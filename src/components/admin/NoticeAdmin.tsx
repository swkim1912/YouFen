"use client";
// 관리자: 공지 관리. 만든 공지는 회원이 로그인(세션 시작)할 때 팝업으로 뜬다(components/NoticePopup.tsx).
// - 켜짐/꺼짐, 시작·종료 시각(종료를 비우면 계속)으로 노출을 조절한다. 쓰기는 DB 정책(notices_admin)이 관리자만 허용한다.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Notice {
  id: number;
  title: string;
  body: string;
  level: "info" | "important";
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

/** ISO → datetime-local 입력값(브라우저 시간대) */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const empty = { title: "", body: "", level: "info" as Notice["level"], ends: "", active: true };

export function NoticeAdmin() {
  const [list, setList] = useState<Notice[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("notices").select("*").order("created_at", { ascending: false }).limit(50);
    setList((data ?? []) as Notice[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return toast.error("제목과 내용을 입력해 주세요");
    const ends_at = form.ends ? new Date(form.ends).toISOString() : null;
    setBusy(true);
    const row = { title: form.title.trim(), body: form.body.trim(), level: form.level, active: form.active, ends_at, updated_at: new Date().toISOString() };
    const { error } = editId ? await supabase.from("notices").update(row).eq("id", editId) : await supabase.from("notices").insert(row);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editId ? "공지를 수정했어요" : "공지를 등록했어요. 회원이 다음에 접속할 때 팝업으로 보여요");
    setForm(empty);
    setEditId(null);
    load();
  };

  const edit = (n: Notice) => {
    setEditId(n.id);
    setForm({ title: n.title, body: n.body, level: n.level, ends: toLocalInput(n.ends_at), active: n.active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggle = async (n: Notice) => {
    const { error } = await supabase.from("notices").update({ active: !n.active, updated_at: new Date().toISOString() }).eq("id", n.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async () => {
    if (delId == null) return;
    const { error } = await supabase.from("notices").delete().eq("id", delId);
    setDelId(null);
    if (error) return toast.error(error.message);
    load();
  };

  const [now] = useState(() => Date.now()); // 화면을 연 시각 기준으로 게시 상태 표시
  const state = (n: Notice) =>
    !n.active ? "꺼짐" : n.ends_at && new Date(n.ends_at).getTime() <= now ? "기간 종료" : new Date(n.starts_at).getTime() > now ? "예약됨" : "게시 중";

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <h2 className="text-base font-bold">공지 팝업</h2>
      <p className="text-xs text-muted">게시 중인 공지는 회원이 로그인(접속)할 때 팝업으로 뜹니다. 회원은 &quot;닫기&quot;(이번 접속 동안 숨김) 또는 &quot;오늘 하루 보지 않기&quot;를 고를 수 있어요.</p>
      <form onSubmit={save} className="space-y-2 rounded-md border border-line bg-panel2 p-3">
        <div><Label>제목 (100자 이내)</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={100} /></div>
        <div><Label>내용 (2000자 이내, 줄바꿈 유지)</Label><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={2000} /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>중요도</Label>
            <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Notice["level"] })}>
              <option value="info">일반</option>
              <option value="important">중요 (강조 표시)</option>
            </Select>
          </div>
          <div><Label>게시 종료 일시 (비우면 계속 게시)</Label><Input type="datetime-local" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />바로 게시</label>
        <div className="flex gap-2">
          <Button disabled={busy}>{editId ? "수정 저장" : "공지 등록"}</Button>
          {editId && <Button type="button" variant="outline" onClick={() => { setEditId(null); setForm(empty); }}>수정 취소</Button>}
        </div>
      </form>

      {list.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">등록된 공지가 없습니다</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((n) => {
            const s = state(n);
            return (
              <li key={n.id} className="rounded-md bg-panel2 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px]", s === "게시 중" ? "bg-win/20 text-win" : "bg-white/10 text-muted")}>{s}</span>
                  {n.level === "important" && <span className="rounded bg-loss/20 px-1.5 py-0.5 text-[11px] text-loss">중요</span>}
                  <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                  <span className="text-xs text-muted">{n.created_at.slice(0, 10)}</span>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted">{n.body}</p>
                <div className="mt-2 flex gap-1.5">
                  <Button type="button" size="sm" variant="outline" onClick={() => toggle(n)}>{n.active ? "게시 중단" : "다시 게시"}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => edit(n)}>수정</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDelId(n.id)}>삭제</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Confirm open={delId != null} message="이 공지를 삭제할까요? 되돌릴 수 없어요." okText="삭제" onOk={remove} onCancel={() => setDelId(null)} />
    </section>
  );
}
