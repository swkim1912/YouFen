"use client";
// 피드백 노트 모아보기: 검색(단어/기술명/상대 이름), 독립 노트 추가, 게임 연동 노트 → 게임 상세로 역추적
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { GameDetailModal } from "@/components/GameDetailModal";
import { Modal, Confirm } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { fetchUserRecords, type RecordView } from "@/lib/records";
import type { FeedbackNote } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { download, exportFilename, notesToRows, toCsv, toXlsx } from "@/lib/exportNotes";

export default function NotesPage() {
  return (
    <AppShell requireAuth>
      <Notes />
    </AppShell>
  );
}

function Notes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<FeedbackNote[]>([]);
  const [games, setGames] = useState<Map<string, RecordView>>(new Map());
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<RecordView | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [delId, setDelId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data }, recs] = await Promise.all([
      supabase.from("feedback_notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      fetchUserRecords(user.id, true),
    ]);
    setNotes((data ?? []) as FeedbackNote[]);
    setGames(new Map(recs.map((r) => [r.rec.id, r])));
  }, [user]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!content.trim()) return toast.error("내용을 입력해 주세요");
    const { error } = await supabase.from("feedback_notes").insert({ user_id: user!.id, title: title.trim() || null, content: content.trim() });
    if (error) return toast.error(error.message);
    setTitle(""); setContent(""); setAdding(false);
    load();
  };

  const remove = async () => {
    if (!delId) return;
    await supabase.from("feedback_notes").delete().eq("id", delId);
    setDelId(null);
    load();
  };

  // 내 노트 전체를 파일로 내보내기 (검색 필터와 상관없이 전부). 브라우저 안에서 만들어 바로 내려받는다.
  const exportAs = async (kind: "csv" | "xlsx") => {
    if (notes.length === 0) return toast.error("내보낼 노트가 없습니다");
    setExporting(true);
    try {
      const rows = notesToRows(notes, games);
      if (kind === "csv") download(toCsv(rows), exportFilename("csv"), "text/csv;charset=utf-8");
      else download(await toXlsx(rows), exportFilename("xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      toast.success(`노트 ${notes.length}개를 내보냈어요`);
    } catch {
      toast.error("내보내지 못했어요. 다시 시도해 주세요");
    }
    setExporting(false);
  };

  // 검색: 제목/내용/상대 이름에 대한 단순 텍스트 매칭
  const filtered = notes.filter((n) => {
    if (!q.trim()) return true;
    const g = n.game_id ? games.get(n.game_id) : undefined;
    return [n.title ?? "", n.content, g?.oppName ?? ""].some((s) => s.includes(q.trim()));
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">피드백 노트</h1>
        <Input className="ml-auto w-full sm:w-56" placeholder="단어·기술명·상대 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="outline" onClick={() => exportAs("xlsx")} disabled={exporting} title="엑셀(.xlsx)로 내보내기">엑셀 내보내기</Button>
        <Button variant="outline" onClick={() => exportAs("csv")} disabled={exporting} title="CSV(엑셀·구글 시트에서 열림)로 내보내기">CSV</Button>
        <Button onClick={() => setAdding(true)}>노트 추가</Button>
      </div>
      {filtered.length === 0 && <p className="py-16 text-center text-muted">노트가 없습니다</p>}
      <div className="space-y-2">
        {filtered.map((n) => {
          const g = n.game_id ? games.get(n.game_id) : undefined;
          return (
            <div key={n.id} className="rounded-lg border border-line bg-panel p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>
                  {fmtDate(n.created_at)}
                  {g ? ` · vs ${g.oppName} ${g.mine}:${g.theirs} (${fmtDate(g.rec.played_at)})` : " · 독립 노트"}
                </span>
                <span className="flex gap-3">
                  {g && <button className="text-brand" onClick={() => setDetail(g)}>게임 보기</button>}
                  <button onClick={() => setDelId(n.id)}>삭제</button>
                </span>
              </div>
              {n.title && <div className="font-bold">{n.title}</div>}
              <div className="whitespace-pre-wrap text-sm">{n.content}</div>
            </div>
          );
        })}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="독립 피드백 노트">
        <div className="space-y-3">
          <div><Label>제목</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>내용</Label><Textarea value={content} onChange={(e) => setContent(e.target.value)} /></div>
          <Button className="w-full" onClick={add}>저장</Button>
        </div>
      </Modal>
      <Confirm open={!!delId} message="이 노트를 삭제할까요?" onOk={remove} onCancel={() => setDelId(null)} okText="삭제" />
      <GameDetailModal view={detail} onClose={() => setDetail(null)} onChanged={load} />
    </div>
  );
}
