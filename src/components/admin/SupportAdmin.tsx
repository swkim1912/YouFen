"use client";
// 관리자: 고객지원 접수함 — 버그 신고·문의·신고·계정 문의를 보고 처리 상태와 메모를 남긴다(접수 테이블 support_tickets, 관리자는 RLS 로 전체 읽기·수정).
// 답변은 접수자가 남긴 이메일(또는 가입 이메일)로 직접 보낸다 — 화면에서 이메일을 복사할 수 있게 보여준다.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Ticket {
  id: number; category: string; title: string; content: string; contact_email: string | null; page_url: string | null; user_agent: string | null;
  status: "new" | "in_progress" | "done"; admin_note: string | null; created_at: string; profile_id: string | null;
  profile: { nickname: string | null; email?: string | null } | null;
}
const CAT: Record<string, string> = { bug: "버그", inquiry: "문의", report: "신고", account: "계정", other: "기타" };
const STATUS: Record<string, string> = { new: "접수됨", in_progress: "처리 중", done: "처리 완료" };

export function SupportAdmin({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState("new");
  const [cat, setCat] = useState("all");
  const [list, setList] = useState<Ticket[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    let q = supabase.from("support_tickets").select("*, profile:profiles!support_tickets_profile_id_fkey(nickname)").order("created_at", { ascending: false }).limit(100);
    if (status !== "all") q = q.eq("status", status);
    if (cat !== "all") q = q.eq("category", cat);
    const { data } = await q;
    setList((data ?? []) as unknown as Ticket[]);
  }, [status, cat]);
  useEffect(() => { load(); }, [load]);

  const select = (t: Ticket) => { setOpen(open === t.id ? null : t.id); setNote(t.admin_note ?? ""); };
  const update = async (t: Ticket, next: Ticket["status"]) => {
    const { error } = await supabase.from("support_tickets").update({ status: next, admin_note: note.trim() || null }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("저장했어요");
    load();
    onChanged?.();
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-bold">고객지원 접수함</h2>
        <Select className="h-8 w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="new">접수됨</option><option value="in_progress">처리 중</option><option value="done">처리 완료</option><option value="all">전체</option>
        </Select>
        <Select className="h-8 w-28" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">모든 종류</option>{Object.entries(CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      {list === null ? <p className="py-4 text-center text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="py-4 text-center text-sm text-muted">해당하는 접수가 없습니다</p> : (
        <ul className="space-y-1.5">
          {list.map((t) => (
            <li key={t.id} className="rounded-md bg-panel2 text-sm">
              <button onClick={() => select(t)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left">
                <span className={cn("rounded px-1.5 py-0.5 text-[11px]", t.status === "new" ? "bg-loss/20 text-loss" : t.status === "done" ? "bg-win/20 text-win" : "bg-white/10 text-muted")}>{STATUS[t.status]}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-muted">{CAT[t.category]}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                <span className="text-xs text-muted">{t.profile?.nickname ?? "비회원"} · {fmtDateTime(t.created_at)}</span>
              </button>
              {open === t.id && (
                <div className="space-y-2 border-t border-line px-3 py-3">
                  <p className="whitespace-pre-wrap break-words">{t.content}</p>
                  <dl className="grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-[auto_1fr]">
                    <dt>답변 이메일</dt><dd className="select-all break-all text-foreground">{t.contact_email ?? "(입력 없음 — 회원이면 가입 이메일)"}</dd>
                    <dt>접수 화면</dt><dd className="break-all">{t.page_url ?? "-"}</dd>
                    <dt>브라우저</dt><dd className="break-all">{t.user_agent ?? "-"}</dd>
                  </dl>
                  <Textarea rows={2} aria-label="처리 메모 (관리자만 보임)" placeholder="처리 메모 (관리자만 보임)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => update(t, "in_progress")}>처리 중으로</Button>
                    <Button size="sm" onClick={() => update(t, "done")}>처리 완료</Button>
                    {t.status !== "new" && <Button size="sm" variant="ghost" onClick={() => update(t, "new")}>접수됨으로 되돌리기</Button>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
