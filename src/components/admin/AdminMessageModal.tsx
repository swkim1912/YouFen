"use client";
// 관리자: 회원에게 쪽지 보내기 / 고객지원 접수에 답장하기 (고객지원 접수함·회원 관리 공용)
// - RPC admin_send_message(p_user, p_title, p_body, p_ticket, p_done) → 표 admin_messages 에 저장 + 받는 회원에게 공용 알림(/support?msg=<id>).
//   회원은 /support 의 '운영팀 메시지'에서 읽는다(MyAdminMessages). 보낸 관리자 정보는 회원 화면에 나가지 않고 '유펜 운영팀'으로만 표시된다.
// - ticket 이 있으면 그 접수를 낸 회원에게만 보낼 수 있고(DB 가 검사), 보내면 접수가 '처리 중'으로 바뀐다.
//   '처리 완료로 표시'를 켜면 '처리 완료'로 바뀐다.
// - 같은 접수·회원에게 이미 보낸 내역을 아래에 보여 준다(RPC admin_messages_of).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fmtDateTime, rpcOk } from "@/lib/adminApi";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export interface MessageTarget {
  id: string;                                   // 받는 회원 id
  name: string;                                 // 화면에 보일 이름(닉네임)
  ticket?: { id: number; title: string };       // 고객지원 답장이면 그 접수
}

interface Sent { id: number; ticket_id: number | null; title: string; body: string; created_at: string; read_at: string | null; sender_nickname: string | null }

export const TITLE_MAX = 100;
export const BODY_MAX = 2000;

export function AdminMessageModal({ target, onClose, onSent }: {
  target: MessageTarget | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [done, setDone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);

  // 창이 열릴 때마다 초기화: 답장이면 제목을 'Re: 접수 제목'으로 채우고, 이미 보낸 내역을 불러온다
  const tid = target?.ticket?.id ?? null;
  useEffect(() => {
    if (!target) return;
    setTitle(target.ticket ? `Re: ${target.ticket.title}`.slice(0, TITLE_MAX) : "");
    setBody("");
    setDone(true);
    (async () => {
      const { data } = await supabase.rpc("admin_messages_of", { p_user: target.id, p_ticket: tid });
      setSent((data ?? []) as Sent[]);
    })();
  }, [target, tid]);

  const submit = async () => {
    if (!target) return;
    if (!title.trim()) return toast.error("제목을 적어 주세요");
    if (!body.trim()) return toast.error("내용을 적어 주세요");
    setBusy(true);
    const err = await rpcOk("admin_send_message", { p_user: target.id, p_title: title, p_body: body, p_ticket: tid, p_done: tid ? done : false });
    setBusy(false);
    if (err) return toast.error(err);
    toast.success(`${target.name} 님에게 보냈어요(알림 전송)`);
    onClose();
    onSent();
  };

  return (
    <Modal open={!!target} onClose={onClose} title={target?.ticket ? "고객지원 답장" : "회원에게 쪽지"}>
      <div className="space-y-3">
        <p className="text-sm">
          <b>{target?.name}</b> 님에게 보내요. 받는 사람에게는 알림이 가고, <b>고객지원 &gt; 운영팀 메시지</b>에서 읽을 수 있어요. 보낸 사람은 &lsquo;유펜 운영팀&rsquo;으로만 보여요.
        </p>
        <div>
          <Label>제목</Label>
          <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
        </div>
        <div>
          <Label>내용</Label>
          <Textarea rows={7} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder="내용을 적어 주세요" />
          <p className="mt-1 text-xs text-muted">{body.length}/{BODY_MAX} · 보낸 뒤에는 고칠 수 없고, 1년 뒤 자동으로 지워져요. 비밀번호 등 민감한 정보는 적지 마세요.</p>
        </div>
        {target?.ticket && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            보내면서 이 접수를 &lsquo;처리 완료&rsquo;로 표시 <span className="text-xs text-muted">(끄면 &lsquo;처리 중&rsquo;)</span>
          </label>
        )}
        {sent.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted">{target?.ticket ? "이 접수에 이미 보낸 답장" : "이 회원에게 보낸 내역"} (최근 {sent.length}건)</p>
            <ul className="max-h-40 space-y-1 overflow-auto">
              {sent.map((m) => (
                <li key={m.id} className="rounded-md bg-panel2 px-2.5 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <b className="min-w-0 flex-1 truncate">{m.title}</b>
                    <span className="shrink-0 text-muted">{m.sender_nickname ?? "관리자"} · {fmtDateTime(m.created_at)} · {m.read_at ? "읽음" : "안 읽음"}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-muted">{m.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button disabled={busy} onClick={submit}>{busy ? "보내는 중…" : "보내기"}</Button>
        </div>
      </div>
    </Modal>
  );
}
