"use client";
// 오픈피스트 참가자 방: /openpiste/123/room — 주최자와 참가 신청한 회원만(관리자는 확인용으로 볼 수 있음)
// - 커뮤니티의 다른 곳과 달리 **유펜 프로필**(닉네임·사진)로 보인다(기획서 0-1 예외). 들어가기 전에 안내하고 '다시 보지 않기'를 고를 수 있다
//   (이 기기에만 기억 — localStorage).
// - 위: 모집 요약(일시·장소)·오픈채팅 링크·참가자 목록. 메시지: 내 것은 오른쪽, 주최자는 '주최' 표시.
//   말풍선을 누르면 메뉴(내 것 = 삭제, 다른 회원 = 신고·차단, 관리자 = 숨김·삭제).
// - 새 메시지는 화면이 보일 때 5초마다 가져온다(op_room p_after). 메시지는 1달 보관.
// 데이터: op_room / op_send / op_message_delete, 신고·차단 ReportBlock(kind 'opmsg')
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, MessageCircle, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { ReportBlock } from "@/components/community/ReportBlock";
import { AdminContentTools } from "@/components/community/AdminContentTools";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Modal, Confirm } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { hasPhoneNumber } from "@/lib/community";
import { type OpMessage, type OpRoom, durationText, opDateText, opError } from "@/lib/openpiste";
import { cn } from "@/lib/utils";

const NOTICE_KEY = "youfen-op-room-notice-off";

export default function RoomPage() {
  return (
    <AppShell requireAuth>
      <Gate />
    </AppShell>
  );
}

/** 입장 전 안내(유펜 프로필로 보임). '다시 보지 않기'를 골랐으면 바로 들어간다 */
function Gate() {
  const { id } = useParams<{ id: string }>();
  const postId = Number(id);
  const [entered, setEntered] = useState<boolean | null>(null);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    let off = false;
    try { off = localStorage.getItem(NOTICE_KEY) === "1"; } catch { /* 저장소를 못 쓰면 매번 안내 */ }
    setEntered(off);
  }, []);

  if (!Number.isFinite(postId)) return <p className="py-16 text-center text-muted">잘못된 주소입니다</p>;
  if (entered === null) return <p className="py-16 text-center text-muted">불러오는 중…</p>;
  if (entered) return <Room postId={postId} />;

  const enter = () => {
    if (dontShow) { try { localStorage.setItem(NOTICE_KEY, "1"); } catch { /* 무시 */ } }
    setEntered(true);
  };
  return (
    <Modal open onClose={() => history.back()} title="참가자 방 안내">
      <div className="space-y-3 text-sm">
        <p>참가자 방은 <b>주최자와 참가 신청한 회원만</b> 들어올 수 있는 대화방이에요.</p>
        <p className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-xs leading-relaxed">
          함께 만나서 운동하는 자리라서 이 방에서는 커뮤니티 프로필이 아니라 <b>유펜 프로필(닉네임·사진)</b>로 보여요.
          방에 있는 회원끼리 서로의 유펜 프로필을 볼 수 있어요.
        </p>
        <p className="text-xs text-muted">연락처를 주고받을 때는 상대를 충분히 확인해 주세요. 메시지는 1달 동안 보관돼요.</p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} className="h-4 w-4 accent-brand" />
          다시 보지 않기(이 기기)
        </label>
        <div className="flex justify-end gap-2">
          <Link href={`/openpiste/${postId}`}><Button variant="outline">돌아가기</Button></Link>
          <Button onClick={enter}>들어가기</Button>
        </div>
      </div>
    </Modal>
  );
}

function msgTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  return new Date().toDateString() === d.toDateString() ? time : `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${time}`;
}

function Room({ postId }: { postId: number }) {
  const { profile } = useAuth();
  const [room, setRoom] = useState<Omit<OpRoom, "messages"> | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<OpMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [askDelete, setAskDelete] = useState<number | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const lastId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  /** 처음엔 전부, 그다음엔 마지막 메시지 뒤의 새 것만 가져와 붙인다(참가자 목록·모집 정보도 함께 갱신) */
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("op_room", { p_id: postId, p_after: lastId.current });
    if (e) { setError(opError(e.message)); return setRoom(null); }
    const { messages, ...head } = data as OpRoom;
    setRoom(head);
    if (messages.length) {
      lastId.current = messages[messages.length - 1].id;
      setMsgs((cur) => [...cur, ...messages.filter((m) => !cur.some((c) => c.id === m.id))]);
      setTimeout(() => bottom.current?.scrollIntoView({ block: "end" }), 50);
    }
  }, [postId]);

  /** 전부 다시(삭제·숨김 반영, 차단 후) */
  const reloadAll = useCallback(() => {
    lastId.current = 0;
    setMsgs([]);
    load();
  }, [load]);

  useEffect(() => {
    reloadAll();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    return () => clearInterval(t);
  }, [load, reloadAll]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (hasPhoneNumber(body) && !window.confirm("전화번호가 들어 있어요. 방에 있는 모든 회원이 볼 수 있어요. 보낼까요?")) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("op_send", { p_id: postId, p_body: body });
    setBusy(false);
    if (e) return toast.error(opError(e.message));
    setText("");
    load();
  };
  const removeMine = async (mid: number) => {
    setAskDelete(null);
    const { error: e } = await supabase.rpc("op_message_delete", { p_msg: mid });
    if (e) return toast.error(opError(e.message));
    setOpenId(null);
    reloadAll();
  };

  if (room === undefined) return <p className="py-16 text-center text-muted">불러오는 중…</p>;
  if (room === null) {
    return (
      <div className="space-y-3 py-16 text-center">
        <p className="text-muted">{error ?? "들어갈 수 없는 방이에요"}</p>
        <Link href={`/openpiste/${postId}`} className="text-sm text-brand">모집글로 돌아가기</Link>
      </div>
    );
  }
  const p = room.post;
  const isAdmin = !!profile?.is_admin;

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col gap-3 md:h-[calc(100dvh-6.5rem)]">
      <Link href={`/openpiste/${postId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} />모집글</Link>

      <div className="space-y-2 rounded-lg border border-line bg-panel p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="rounded bg-brand/15 px-1.5 py-0.5 font-semibold text-brand">{p.weapon}</span>
          <span className="min-w-0 truncate text-sm font-bold">{p.title}</span>
          {p.status === "cancelled" && <span className="rounded bg-loss/15 px-1.5 py-0.5 text-loss">취소된 모집</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{opDateText(p.starts_at)} · {durationText(p.duration_h)}</span>
          <span className="inline-flex items-center gap-1"><MapPin size={12} />{p.region} · {p.place}</span>
          <button className="inline-flex items-center gap-1 text-foreground hover:text-brand" onClick={() => setShowMembers((v) => !v)}>
            <Users size={12} />참가자 {room.members.length}명 {showMembers ? "접기" : "보기"}
          </button>
          {p.chat_url && (
            <a href={p.chat_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-brand hover:underline"><MessageCircle size={12} />오픈채팅방</a>
          )}
        </div>
        {showMembers && (
          <ul className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-2">
            {room.members.map((m, i) => (
              <li key={i} className="inline-flex items-center gap-1">
                <CommunityCardView card={m} size={22} className="text-xs" />
                {m.host && <span className="rounded bg-brand/15 px-1 text-[10px] text-brand">주최</span>}
                {m.me && <span className="text-[10px] text-muted">(나)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-line bg-panel p-3">
        {msgs.length === 0 && <p className="py-8 text-center text-sm text-muted">첫 인사를 남겨 보세요. 준비물·도착 시간 등을 함께 정하면 좋아요.</p>}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const head = !m.mine && (!prev || prev.mine || prev.card.id !== m.card.id);
          const open = openId === m.id;
          return (
            <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
              {head && (
                <span className="mb-1 inline-flex items-center gap-1">
                  <CommunityCardView card={m.card} size={20} link={false} className="text-xs" />
                  {m.is_host && <span className="rounded bg-brand/15 px-1 text-[10px] text-brand">주최</span>}
                </span>
              )}
              <div className={cn("flex max-w-[85%] items-end gap-1.5", m.mine ? "flex-row-reverse" : "flex-row")}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenId(open ? null : m.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") setOpenId(open ? null : m.id); }}
                  className={cn("min-w-0 cursor-pointer rounded-2xl px-3 py-2 text-sm",
                    m.mine ? "rounded-br-sm bg-brand text-brand-ink" : "rounded-bl-sm bg-panel2", m.status !== "active" && "opacity-70")}
                >
                  {m.status === "deleted" ? <span className="text-xs italic">{m.by_admin ? "관리자에 의해 삭제된 메시지예요" : "삭제된 메시지예요"}</span> : (
                    <>
                      {m.status === "hidden" && <span className="block text-xs italic">신고가 쌓여 가려진 메시지예요</span>}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    </>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-muted">{msgTime(m.created_at)}</span>
              </div>
              {open && (
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  {!m.mine && m.status !== "deleted" && m.card.kind !== "gone" && (
                    <ReportBlock kind="opmsg" refId={String(m.id)} label={m.card.nickname ?? "회원"} what="메시지" onBlocked={() => { setOpenId(null); reloadAll(); }} />
                  )}
                  {m.mine && m.status !== "deleted" && <button className="text-muted hover:text-loss" onClick={() => setAskDelete(m.id)}>삭제</button>}
                  {isAdmin && <AdminContentTools kind="opmsg" refId={String(m.id)} status={m.status} onChanged={reloadAll} compact />}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {room.can_send ? (
        <div className="flex items-end gap-2">
          <Textarea value={text} maxLength={1000} rows={1} onChange={(e) => setText(e.target.value)} className="max-h-32 min-h-[42px] flex-1 resize-none"
            aria-label="메시지를 입력하세요" placeholder="메시지를 입력하세요"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <Button disabled={busy || !text.trim()} onClick={send} aria-label="보내기" className="mb-0.5"><Send size={16} /></Button>
        </div>
      ) : (
        <p className="rounded-md bg-panel2 px-3 py-2 text-center text-xs text-muted">
          {isAdmin ? "관리자 보기 — 참가자가 아니라 메시지를 보낼 수 없어요" : "커뮤니티 이용이 제한되어 메시지를 보낼 수 없어요"}
        </p>
      )}
      <Confirm open={askDelete !== null} message="이 메시지를 지울까요? 다른 참가자에게는 '삭제된 메시지'로 보여요." okText="삭제"
        onOk={() => askDelete !== null && removeMine(askDelete)} onCancel={() => setAskDelete(null)} />
    </div>
  );
}
