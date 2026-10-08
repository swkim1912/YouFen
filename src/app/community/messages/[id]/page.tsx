"use client";
// 커뮤니티 > 1:1 채팅 대화방: /community/messages/123
// - 위: 상대 카드(대화를 시작할 때의 커뮤니티 프로필), 장터 글 요약(누르면 글로), 나가기·신고·차단
// - 메시지: 내 것은 오른쪽, 상대 것은 왼쪽. 사진은 눌러서 크게. 상대가 읽었으면 내 마지막 메시지 옆에 '읽음'.
// - 입력: 글 1,000자 또는 사진 1장(검사 없음 — 문제가 되면 신고), 전화번호가 보이면 한 번 확인
// - 새 메시지는 화면이 보일 때 4초마다 가져온다(dm_thread p_after = 마지막 메시지 id). 열면 읽음 처리된다.
// 데이터: dm_thread / dm_send / dm_leave, 신고·차단은 ReportBlock(kind 'dmthread' — 대상은 상대, 신고 사본은 최근 메시지 30개)
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Package, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { ReportBlock } from "@/components/community/ReportBlock";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { uploadCommunityImage } from "@/lib/communityUpload";
import { type DmMessage, type DmThread, boardImageUrl, communityError, hasPhoneNumber, priceText } from "@/lib/community";
import { cn } from "@/lib/utils";

export default function ThreadPage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Inner />
      </Suspense>
    </AppShell>
  );
}

/** 메시지 시각: 오늘이면 '오후 3:05', 아니면 '10.08 오후 3:05' */
function msgTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  const today = new Date().toDateString() === d.toDateString();
  return today ? time : `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${time}`;
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const threadId = Number(id);
  const router = useRouter();
  const [t, setT] = useState<Omit<DmThread, "messages"> | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<DmMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const lastId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 처음엔 전부, 그다음엔 마지막 메시지 뒤의 새 것만 가져와 붙인다
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("dm_thread", { p_thread: threadId, p_after: lastId.current });
    if (e) {
      setError(communityError(e.message));
      return setT(null);
    }
    const r = data as DmThread;
    const { messages, ...head } = r;
    setT(head);
    if (messages.length) {
      lastId.current = messages[messages.length - 1].id;
      setMsgs((cur) => [...cur, ...messages.filter((m) => !cur.some((c) => c.id === m.id))]);
      setTimeout(() => bottom.current?.scrollIntoView({ block: "end" }), 50);
    }
  }, [threadId]);

  useEffect(() => {
    if (!Number.isFinite(threadId)) return;
    lastId.current = 0;
    setMsgs([]);
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 4000);
    return () => clearInterval(timer);
  }, [threadId, load]);

  if (!Number.isFinite(threadId)) return <p className="py-16 text-center text-muted">잘못된 주소입니다</p>;

  const send = async (uploadId: number | null = null) => {
    const body = text.trim();
    if (!body && uploadId === null) return;
    if (body && hasPhoneNumber(body) && !window.confirm("전화번호가 들어 있어요. 상대를 충분히 확인한 뒤에 보내는 게 안전해요. 보낼까요?")) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("dm_send", { p_thread: threadId, p_body: uploadId !== null ? "" : body, p_upload: uploadId });
    setBusy(false);
    if (e) return toast.error(communityError(e.message));
    if (uploadId === null) setText("");
    load();
  };
  const sendPhoto = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    const r = await uploadCommunityImage(file, "dm");
    setBusy(false);
    if ("error" in r) return toast.error(r.error);
    send(r.id);
  };
  const leave = async () => {
    setAskLeave(false);
    await supabase.rpc("dm_leave", { p_thread: threadId });
    toast.success("대화방에서 나갔어요. 상대가 새 메시지를 보내면 다시 보여요");
    router.replace("/community/messages");
  };

  // 내가 보낸 마지막 메시지(상대가 읽었는지 표시용)
  const lastMine = [...msgs].reverse().find((m) => m.mine);
  const readMine = !!(lastMine && t?.other_read_at && new Date(t.other_read_at) >= new Date(lastMine.created_at));
  // 상대가 나갔어도 보낼 수 있다(보내면 상대 목록에 다시 보임). 차단 중이거나 상대가 탈퇴했으면 불가
  const canSend = t && !t.blocked && t.other.kind !== "gone";

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col gap-3 md:h-[calc(100dvh-6.5rem)]">
      <Link href="/community/messages" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} />1:1 채팅 목록</Link>
      {t === undefined && <p className="py-16 text-center text-muted">불러오는 중…</p>}
      {t === null && <p className="py-16 text-center text-muted">{error ?? "대화방을 찾을 수 없어요"}</p>}
      {t && (
        <>
          <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center gap-2">
              <CommunityCardView card={t.other} size={30} className="text-sm" />
              <span className="rounded bg-white/[0.06] px-1.5 text-[10px] text-muted">{t.i_am_seller ? "문의한 회원" : "글쓴이"}</span>
              <span className="ml-auto flex items-center gap-3 text-xs">
                {t.other.kind !== "gone" && <ReportBlock kind="dmthread" refId={String(t.id)} label={t.other.nickname ?? "상대"} what="1:1 채팅" onBlocked={() => load()} />}
                <button className="text-muted hover:text-foreground" onClick={() => setAskLeave(true)}>나가기</button>
              </span>
            </div>
            <Link href={t.listing_id ? `/community/market/${t.listing_id}` : "#"} className="flex items-center gap-2 rounded-md bg-panel2 p-2 hover:bg-white/[0.04]">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-panel">
                {t.listing?.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={boardImageUrl(t.listing.thumb)} alt="" className="h-full w-full object-cover" />
                ) : <div className="flex h-full items-center justify-center text-muted"><Package size={16} /></div>}
              </div>
              <div className="min-w-0 text-xs">
                <p className="truncate font-semibold">{t.listing_title}</p>
                <p className="text-muted">{t.listing ? `${t.listing.trade_status} · ${priceText(t.listing)}` : "삭제된 장터 글"}</p>
              </div>
            </Link>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-line bg-panel p-3">
            {msgs.length === 0 && <p className="py-8 text-center text-sm text-muted">첫 메시지를 보내 보세요. 거래 조건·상태를 꼼꼼히 확인하세요.</p>}
            {msgs.map((m) => (
              <div key={m.id} className={cn("flex items-end gap-1.5", m.mine ? "justify-end" : "justify-start")}>
                {m.mine && m.id === lastMine?.id && readMine && <span className="text-[10px] text-brand">읽음</span>}
                {m.mine && <span className="text-[10px] text-muted">{msgTime(m.created_at)}</span>}
                <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", m.mine ? "rounded-br-sm bg-brand text-brand-ink" : "rounded-bl-sm bg-panel2")}>
                  {m.status !== "active" ? <span className="text-xs opacity-70">가려진 메시지예요</span> : (
                    <>
                      {m.image && (
                        <a href={boardImageUrl(m.image.path)} target="_blank" rel="noopener noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img loading="lazy" decoding="async" src={boardImageUrl(m.image.thumb)} alt="보낸 사진" width={180} height={180} className="h-44 w-44 rounded-lg object-cover" />
                        </a>
                      )}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    </>
                  )}
                </div>
                {!m.mine && <span className="text-[10px] text-muted">{msgTime(m.created_at)}</span>}
              </div>
            ))}
            <div ref={bottom} />
          </div>

          {canSend && t.other_left && <p className="text-center text-[11px] text-muted">상대가 대화방을 나갔어요. 메시지를 보내면 상대 목록에 다시 보여요.</p>}
          {canSend ? (
            <div className="flex items-end gap-2">
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="사진 보내기" className="mb-1 rounded-md p-2 text-muted hover:text-foreground disabled:opacity-50"><ImagePlus size={20} /></button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => sendPhoto(e.target.files?.[0])} />
              <Textarea value={text} maxLength={1000} rows={1} onChange={(e) => setText(e.target.value)} className="max-h-32 min-h-[42px] flex-1 resize-none"
                aria-label="메시지를 입력하세요" placeholder="메시지를 입력하세요"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
              <Button disabled={busy || !text.trim()} onClick={() => send()} aria-label="보내기" className="mb-0.5"><Send size={16} /></Button>
            </div>
          ) : (
            <p className="rounded-md bg-panel2 px-3 py-2 text-center text-xs text-muted">
              {t.blocked ? "차단 중이라 메시지를 보낼 수 없어요" : "상대가 탈퇴해서 메시지를 보낼 수 없어요"}
            </p>
          )}
          <Confirm open={askLeave} message="대화방에서 나갈까요? 내 목록에서 사라지고, 상대가 새 메시지를 보내면 다시 보여요." okText="나가기" onOk={leave} onCancel={() => setAskLeave(false)} />
        </>
      )}
    </div>
  );
}
