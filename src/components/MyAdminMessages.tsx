"use client";
// 고객지원 페이지의 '운영팀 메시지': 관리자가 보낸 고객지원 답장·쪽지를 회원이 읽는 곳.
// - 데이터: RPC my_admin_messages()(내가 받은 최근 50건, 보낸 관리자 정보 없음). 표(admin_messages)는 직접 읽을 수 없다.
// - 알림(notifications)의 링크 /support?msg=<id> 로 들어오면 그 메시지를 자동으로 펼친다. 펼치면 RPC read_admin_message 로 읽음 표시.
//   (알림 자체의 읽음 처리는 AppShell 알림 창이 한다.)
// - 답장 기능은 따로 없다: 추가로 할 말은 아래 접수 양식으로 새로 접수한다(안내 문구 참고).
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

interface Msg { id: number; title: string; body: string; ticket_id: number | null; ticket_title: string | null; created_at: string; read_at: string | null }

export function MyAdminMessages() {
  const { user } = useAuth();
  const sp = useSearchParams();
  const wanted = Number(sp.get("msg")) || null; // 알림에서 넘어온 메시지 번호
  const [list, setList] = useState<Msg[]>([]);
  const [open, setOpen] = useState<number | null>(wanted);

  const load = useCallback(async () => {
    if (!user) return setList([]);
    const { data } = await supabase.rpc("my_admin_messages");
    setList((data ?? []) as Msg[]);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  // 펼친 메시지가 안 읽은 것이면 읽음 표시(화면에도 바로 반영)
  useEffect(() => {
    const m = list.find((x) => x.id === open);
    if (!m || m.read_at) return;
    supabase.rpc("read_admin_message", { p_id: m.id }).then(() => {
      setList((cur) => cur.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)));
    });
  }, [open, list]);

  if (!user || list.length === 0) return null;
  const unread = list.filter((m) => !m.read_at).length;

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="mb-2 text-base font-bold">
        운영팀 메시지 {unread > 0 && <span className="ml-1 rounded bg-brand px-1.5 py-0.5 align-middle text-[11px] font-semibold text-brand-ink">새 글 {unread}</span>}
      </h2>
      <ul className="space-y-1.5">
        {list.map((m) => (
          <li key={m.id} className="rounded-md bg-panel2">
            <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id} className="flex w-full items-center gap-2 px-3 py-2 text-left">
              {!m.read_at && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="안 읽음" />}
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-muted">{m.ticket_id ? "문의 답변" : "쪽지"}</span>
              <span className={cn("min-w-0 flex-1 truncate", !m.read_at && "font-semibold")}>{m.title}</span>
              <span className="shrink-0 text-xs text-muted">{m.created_at.slice(0, 10)}</span>
            </button>
            {open === m.id && (
              <div className="space-y-2 border-t border-line px-3 py-3 text-sm">
                {m.ticket_id && <p className="text-xs text-muted">내 문의: {m.ticket_title ?? "(삭제된 접수)"}</p>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className="text-xs text-muted">유펜 운영팀 · 이 메시지에는 바로 답장할 수 없어요. 추가로 알릴 내용은 아래 양식으로 접수해 주세요.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
