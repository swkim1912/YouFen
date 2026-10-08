"use client";
// 커뮤니티 > 자유톡방(단체 채팅, docs/COMMUNITY.md 4장): /community/chat
// - 방은 하나. 처음 들어올 때 얼굴(커뮤니티 프로필 / 자유톡방 익명 닉네임)을 고르고 이용 규칙에 동의한다(ChatGate).
//   얼굴을 바꾸면 규칙에 다시 동의해야 보낼 수 있다(DB chat_agreed_persona).
// - 메시지: 내 것은 오른쪽, 다른 회원 것은 왼쪽(이름·사진은 보낼 때의 얼굴). 누르면 아래에 메뉴(@부르기·신고·차단 / 내 것은 삭제 / 관리자 도구).
//   @닉네임 은 굵게, 나를 부른 메시지는 테두리로 표시. 삭제·신고로 가려진 메시지는 안내 문구만.
// - 실시간: 비공개 Realtime 채널 'community-chat' 에서 DB 가 보내는 "새 메시지 번호" 신호를 받으면 chat_feed 로 새 메시지를 가져온다
//   (메시지 내용·보낸 사람은 신호에 들어 있지 않고, 차단·숨김은 DB 가 걸러 준다). 접속자 수는 presence(무작위 키 — 누구인지 모름).
//   연결이 끊겨 있으면 15초, 연결돼 있어도 1분마다 한 번씩 새 메시지를 확인한다(신호를 놓친 경우 대비).
// - 위로 '이전 메시지 보기'(50개씩, 1달 이내). 메시지는 1달 보관.
// 데이터: chat_me / chat_set_identity / chat_random_nickname / chat_agree / chat_feed / chat_send / chat_delete,
//        신고·차단 ReportBlock(kind 'chat' — 대상 = 보낸 사람, 사본 = 그 메시지와 앞 10개), 관리자 AdminContentTools(kind 'chat')
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImagePlus, Send, Users } from "lucide-react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { ReportBlock } from "@/components/community/ReportBlock";
import { AdminContentTools } from "@/components/community/AdminContentTools";
import { Button } from "@/components/ui/button";
import { Modal, Confirm } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { uploadCommunityImage } from "@/lib/communityUpload";
import {
  CHAT_MAX, CHAT_RULES, NAME_REASON, type ChatMe, type ChatMessage, type CommunityCard,
  boardImageUrl, communityError, hasPhoneNumber,
} from "@/lib/community";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  return (
    <AppShell requireAuth>
      <Room />
    </AppShell>
  );
}

// ───────────────────────── 작은 도우미 ─────────────────────────

/** 같은 사람이 이어서 보낸 메시지를 묶기 위한 열쇠(보낸 사람 id 는 화면에 없으므로 카드로 구분) */
const cardKey = (m: ChatMessage) => `${m.mine ? "me" : ""}:${m.card.kind}:${m.card.id ?? m.card.pid ?? m.card.nickname ?? ""}`;
const timeText = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
const dayText = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
const sameMinute = (a: string, b: string) => Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000);

const MENTION_RE = /(@[0-9A-Za-z가-힣]{2,12})/g;

/** 본문: @닉네임 을 굵게(내 이름이면 강조) */
function ChatText({ text, myName, mine }: { text: string; myName: string | null; mine: boolean }) {
  const parts = text.split(MENTION_RE);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className={cn("font-semibold", !mine && myName && p.slice(1).toLowerCase() === myName.toLowerCase() && "text-brand")}>{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

// ───────────────────────── 입장·얼굴 바꾸기 + 이용 규칙 동의 ─────────────────────────

/** 얼굴 고르기 + 규칙 동의. 처음 입장, 얼굴을 바꾼 뒤 다시 동의, '바꾸기' 창에서 함께 쓴다 */
function ChatGate({ me, onDone, submitText }: { me: ChatMe; onDone: (m: ChatMe) => void; submitText: string }) {
  const [choice, setChoice] = useState<"profile" | "nick">(me.use_nickname ? "nick" : "profile");
  const [nick, setNick] = useState(me.chat_nickname ?? "");
  const [nickIssue, setNickIssue] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const suggest = useCallback(async () => {
    const { data } = await supabase.rpc("chat_random_nickname");
    if (typeof data === "string") setNick(data);
  }, []);
  // 익명 닉네임이 아직 없으면 추천 이름을 하나 채워 둔다
  useEffect(() => { if (!me.chat_nickname) suggest(); }, [me.chat_nickname, suggest]);

  // 닉네임을 바꾸면 0.4초 뒤 사용 가능 여부 확인(지금 내 이름이면 확인하지 않음)
  useEffect(() => {
    const n = nick.trim();
    if (!n || n === me.chat_nickname) { setNickIssue(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("community_name_available", { n });
      setNickIssue(data ? NAME_REASON[data as string] ?? "사용할 수 없는 닉네임이에요" : null);
    }, 400);
    return () => clearTimeout(t);
  }, [nick, me.chat_nickname]);

  const profileBlocked = me.need_nick; // 커뮤니티 전용 프로필인데 닉네임이 없음
  const n = nick.trim();
  const canSubmit = checked && !busy && (choice === "profile" ? !profileBlocked : !!n && !nickIssue);

  const submit = async () => {
    setBusy(true);
    const wantNick = choice === "nick";
    if (wantNick !== me.use_nickname || (wantNick && n !== me.chat_nickname)) {
      const { error } = await supabase.rpc("chat_set_identity", { p_use_nickname: wantNick, p_nickname: wantNick && n !== me.chat_nickname ? n : null });
      if (error) { setBusy(false); return toast.error(communityError(error.message)); }
    }
    const { data, error } = await supabase.rpc("chat_agree");
    setBusy(false);
    if (error) return toast.error(communityError(error.message));
    onDone(data as ChatMe);
  };

  const opt = (active: boolean) => cn("flex w-full items-start gap-3 rounded-lg border p-3 text-left", active ? "border-brand bg-brand/[0.06]" : "border-line hover:bg-white/[0.03]");
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-bold">자유톡방에서 쓸 이름</h3>
        <button type="button" className={opt(choice === "profile")} onClick={() => setChoice("profile")}>
          <input type="radio" readOnly checked={choice === "profile"} className="mt-1 accent-brand" />
          <span className="min-w-0 space-y-1.5">
            <span className="block text-sm font-semibold">커뮤니티 프로필</span>
            <CommunityCardView card={me.profile_card} size={26} link={false} className="text-sm" />
            <span className="block text-[11px] text-muted">
              {profileBlocked ? "커뮤니티 전용 닉네임이 아직 없어요. 마이 펜싱 > 커뮤니티 설정에서 먼저 정해 주세요." : "게시판·장터와 같은 얼굴이에요(커뮤니티 설정에서 바꿀 수 있어요)."}
            </span>
          </span>
        </button>
        <button type="button" className={opt(choice === "nick")} onClick={() => setChoice("nick")}>
          <input type="radio" readOnly checked={choice === "nick"} className="mt-1 accent-brand" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block text-sm font-semibold">자유톡방 익명 닉네임</span>
            <span className="block text-[11px] text-muted">이 방에서만 쓰는 이름이에요. 사진·티어 없이 이름만 보이고, 다른 프로필과 연결되지 않아요.</span>
          </span>
        </button>
        {choice === "nick" && (
          <div className="space-y-1 pl-1">
            <div className="flex gap-2">
              <Input value={nick} maxLength={12} onChange={(e) => setNick(e.target.value)} placeholder="2~12자 한글·영문·숫자" className="h-9" />
              <Button type="button" size="sm" variant="outline" onClick={suggest} className="shrink-0">다른 이름 추천</Button>
            </div>
            {nickIssue ? <p className="text-[11px] text-loss">{nickIssue}</p> : <p className="text-[11px] text-muted">유펜·커뮤니티 닉네임, 선수 실명과 같은 이름은 쓸 수 없어요. 바꾸면 내 예전 메시지도 새 이름으로 보여요.</p>}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold">자유톡방 이용 규칙</h3>
        <ol className="space-y-1 rounded-lg bg-panel2 p-3 text-xs leading-relaxed">
          {CHAT_RULES.map((r, i) => <li key={i}><b className="mr-1 text-brand">{i + 1}.</b>{r}</li>)}
        </ol>
        <p className="text-[11px] text-muted">규칙을 어기면 메시지가 삭제되거나 커뮤니티 이용이 제한될 수 있어요. 익명 닉네임이어도 문제가 되면 운영자가 작성자를 확인할 수 있어요. 메시지는 1달 동안 보관돼요.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="h-4 w-4 accent-brand" />
          위 규칙을 지키겠습니다
        </label>
      </section>
      <Button className="w-full" disabled={!canSubmit} onClick={submit}>{submitText}</Button>
    </div>
  );
}

// ───────────────────────── 방 ─────────────────────────

function Room() {
  const [me, setMe] = useState<ChatMe | null | undefined>(undefined);
  const [changing, setChanging] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    supabase.rpc("chat_me").then(({ data }) => setMe((data as ChatMe | null) ?? null));
  }, []);

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col gap-3 md:h-[calc(100dvh-6.5rem)]">
      <CommunityHeader active="chat" />
      {me === undefined && <p className="py-16 text-center text-muted">불러오는 중…</p>}
      {me === null && <p className="py-16 text-center text-muted">불러오지 못했어요. 새로고침해 주세요.</p>}
      {me && !me.agreed && (
        <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto rounded-lg border border-line bg-panel p-4">
          <p className="mb-4 text-sm">
            {me.ever_agreed
              ? "자유톡방에서 쓰는 얼굴이 바뀌었어요. 이용 규칙을 확인하고 다시 동의해 주세요."
              : "펜싱 이야기를 자유롭게 나누는 단체 채팅방이에요. 이름을 고르고 이용 규칙에 동의하면 들어갈 수 있어요."}
          </p>
          <ChatGate me={me} onDone={setMe} submitText="동의하고 입장하기" />
        </div>
      )}
      {me?.agreed && (
        <>
          <ChatBody me={me} onChangeFace={() => setChanging(true)} onShowRules={() => setShowRules(true)} />
          <Modal open={changing} onClose={() => setChanging(false)} title="자유톡방 이름 바꾸기">
            <ChatGate me={me} submitText="저장하고 규칙에 동의" onDone={(m) => { setMe(m); setChanging(false); toast.success("이름을 바꿨어요"); }} />
          </Modal>
          <Modal open={showRules} onClose={() => setShowRules(false)} title="자유톡방 이용 규칙">
            <ol className="space-y-1.5 text-sm leading-relaxed">
              {CHAT_RULES.map((r, i) => <li key={i}><b className="mr-1 text-brand">{i + 1}.</b>{r}</li>)}
            </ol>
            <p className="mt-3 text-xs text-muted">문제가 되는 메시지는 눌러서 신고해 주세요. 서로 다른 회원 3명이 신고하면 운영자 확인 전까지 자동으로 가려져요.</p>
          </Modal>
        </>
      )}
    </div>
  );
}

function ChatBody({ me, onChangeFace, onShowRules }: { me: ChatMe; onChangeFace: () => void; onShowRules: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [online, setOnline] = useState(0);
  const [live, setLive] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);     // 메뉴를 펼친 메시지
  const [askDelete, setAskDelete] = useState<number | null>(null);
  const [newBelow, setNewBelow] = useState(false);               // 위를 보는 중에 새 메시지가 왔음
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(0);
  const atBottom = useRef(true);
  const fetching = useRef(false);
  const again = useRef(false);
  const stick = useRef<"bottom" | { prevHeight: number } | null>(null); // 다음 그리기 뒤 스크롤 위치 맞추기
  const myName = me.card.nickname;

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setNewBelow(false);
  };
  // 메시지 목록이 바뀐 직후(화면에 그려지기 전) 스크롤 위치를 맞춘다
  useLayoutEffect(() => {
    const el = listRef.current;
    const s = stick.current;
    stick.current = null;
    if (!el || !s) return;
    if (s === "bottom") el.scrollTop = el.scrollHeight;
    else el.scrollTop = el.scrollHeight - s.prevHeight; // 위에 이전 메시지를 붙인 만큼 내려서 보던 곳 유지
  }, [msgs]);

  /** 처음(또는 차단 후) 최근 50개 */
  const loadLatest = useCallback(async () => {
    const { data, error } = await supabase.rpc("chat_feed", {});
    if (error) return toast.error(communityError(error.message));
    const r = data as { messages: ChatMessage[]; has_more: boolean };
    lastId.current = r.messages.length ? r.messages[r.messages.length - 1].id : 0;
    stick.current = "bottom";
    setMsgs(r.messages);
    setHasMore(r.has_more);
  }, []);

  /** 새 메시지만(신호를 받았을 때·주기 확인). 이미 가져오는 중이면 끝난 뒤 한 번 더 */
  const fetchNew = useCallback(async () => {
    if (fetching.current) { again.current = true; return; }
    fetching.current = true;
    try {
      // 가져오는 동안 신호가 또 오면(again) 한 바퀴 더 돈다. 한 번에 100개씩, 최대 5번
      do {
        again.current = false;
        for (let i = 0; i < 5; i++) {
          const { data, error } = await supabase.rpc("chat_feed", { p_after: lastId.current });
          if (error) break;
          const r = data as { messages: ChatMessage[]; has_more: boolean };
          if (r.messages.length) {
            lastId.current = r.messages[r.messages.length - 1].id;
            const mineNew = r.messages.some((m) => m.mine);
            if (atBottom.current || mineNew) stick.current = "bottom";
            else setNewBelow(true);
            setMsgs((cur) => {
              const have = new Set((cur ?? []).map((m) => m.id));
              return [...(cur ?? []), ...r.messages.filter((m) => !have.has(m.id))];
            });
          }
          if (!r.has_more) break;
        }
      } while (again.current);
    } finally {
      fetching.current = false;
    }
  }, []);

  /** 상태가 바뀐 메시지(삭제·숨김·복구)만 다시 받아 바꿔 끼운다 */
  const refreshIds = useCallback(async (ids: number[]) => {
    const { data } = await supabase.rpc("chat_feed", { p_ids: ids });
    const fresh = ((data as { messages: ChatMessage[] } | null)?.messages ?? []);
    if (!fresh.length) return;
    const byId = new Map(fresh.map((m) => [m.id, m]));
    setMsgs((cur) => cur?.map((m) => byId.get(m.id) ?? m) ?? cur);
  }, []);

  const loadOlder = async () => {
    if (!msgs?.length) return;
    const { data, error } = await supabase.rpc("chat_feed", { p_before: msgs[0].id });
    if (error) return toast.error(communityError(error.message));
    const r = data as { messages: ChatMessage[]; has_more: boolean };
    stick.current = { prevHeight: listRef.current?.scrollHeight ?? 0 };
    setMsgs((cur) => [...r.messages, ...(cur ?? [])]);
    setHasMore(r.has_more);
  };

  useEffect(() => { loadLatest(); }, [loadLatest]);

  // 실시간 신호 + 접속자 수. 로그인 토큰을 실시간 연결에 넘긴 뒤(비공개 채널 권한 확인) 들어간다
  useEffect(() => {
    let ch: RealtimeChannel | null = null;
    let alive = true;
    const key = crypto.randomUUID(); // 접속자 수 세기용 무작위 키(누구인지 알 수 없음)
    (async () => {
      await supabase.realtime.setAuth();
      if (!alive) return;
      const c = supabase.channel("community-chat", { config: { private: true, presence: { key } } });
      ch = c;
      c.on("broadcast", { event: "new" }, () => fetchNew())
        .on("broadcast", { event: "update" }, ({ payload }) => { const id = Number(payload?.id); if (id) refreshIds([id]); })
        .on("presence", { event: "sync" }, () => setOnline(Object.keys(c.presenceState()).length))
        .subscribe((status) => {
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") { c.track({}); fetchNew(); }
        });
    })();
    return () => { alive = false; if (ch) supabase.removeChannel(ch); };
  }, [fetchNew, refreshIds]);

  // 신호를 놓쳤을 때를 대비한 주기 확인(연결 끊김 15초, 연결됨 1분) + 다시 화면으로 돌아왔을 때
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") fetchNew(); }, live ? 60_000 : 15_000);
    const onVis = () => { if (document.visibilityState === "visible") fetchNew(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [live, fetchNew]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setNewBelow(false);
  };

  const sendable = !me.banned && !(me.persona !== "n" && me.need_nick);

  const send = async (uploadId: number | null = null) => {
    const body = text.trim();
    if (!body && uploadId === null) return;
    if (body && hasPhoneNumber(body) && !window.confirm("전화번호가 들어 있어요. 자유톡방은 모든 회원이 볼 수 있어요. 그래도 보낼까요?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("chat_send", { p_body: uploadId !== null ? "" : body, p_upload: uploadId });
    setBusy(false);
    if (error) return toast.error(communityError(error.message));
    if (uploadId === null) setText("");
    atBottom.current = true;
    fetchNew();
  };
  const sendPhoto = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ""; // file 은 이미 꺼내 두었으므로 비워도 된다
    if (!file) return;
    setBusy(true);
    const r = await uploadCommunityImage(file, "chat");
    setBusy(false);
    if ("error" in r) return toast.error(r.error);
    send(r.id);
  };
  const removeMine = async (id: number) => {
    setAskDelete(null);
    const { error } = await supabase.rpc("chat_delete", { p_id: id });
    if (error) return toast.error(communityError(error.message));
    setOpenId(null);
    refreshIds([id]);
  };
  const mention = (card: CommunityCard) => {
    if (!card.nickname || card.kind === "gone") return;
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${card.nickname} `);
    setOpenId(null);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* 방 머리: 접속자, 내 얼굴(바꾸기), 규칙 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-panel px-3 py-2 text-xs">
        <span className="text-sm font-bold">자유톡방</span>
        <span className="inline-flex items-center gap-1 text-muted" title={live ? "실시간 연결됨" : "연결 중 — 잠시마다 새 메시지를 확인해요"}>
          <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-win" : "bg-muted")} />
          <Users size={13} />{live ? `${online}명 접속 중` : "연결 중"}
        </span>
        <span className="ml-auto inline-flex min-w-0 items-center gap-1.5">
          <span className="text-muted">내 이름</span>
          <CommunityCardView card={me.card} size={18} link={false} className="text-xs" />
          <button className="text-brand hover:underline" onClick={onChangeFace}>바꾸기</button>
        </span>
        <button className="text-muted hover:text-foreground" onClick={onShowRules}>규칙</button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} className="h-full space-y-0.5 overflow-y-auto rounded-lg border border-line bg-panel p-3">
          {msgs === null && <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>}
          {hasMore && (
            <div className="pb-2 text-center">
              <button className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-foreground" onClick={loadOlder}>이전 메시지 보기</button>
            </div>
          )}
          {msgs?.length === 0 && <p className="py-8 text-center text-sm text-muted">아직 메시지가 없어요. 첫 인사를 남겨 보세요!</p>}
          {msgs?.map((m, i) => {
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            // 같은 사람이 5분 안에 이어 보내면 이름을 다시 쓰지 않는다
            const head = newDay || !prev || cardKey(prev) !== cardKey(m) || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000;
            // 시각은 같은 사람의 같은 분 묶음 마지막에만
            const showTime = !next || cardKey(next) !== cardKey(m) || !sameMinute(next.created_at, m.created_at);
            const callsMe = !m.mine && !!myName && !!m.body && m.body.toLowerCase().includes(`@${myName.toLowerCase()}`);
            const open = openId === m.id;
            return (
              <div key={m.id}>
                {newDay && <p className="my-3 text-center text-[11px] text-muted">{dayText(m.created_at)}</p>}
                <div className={cn("flex flex-col", m.mine ? "items-end" : "items-start", head && "mt-2.5")}>
                  {head && !m.mine && <CommunityCardView card={m.card} size={22} link={false} className="mb-1 text-xs" />}
                  <div className={cn("flex max-w-[85%] items-end gap-1.5", m.mine ? "flex-row-reverse" : "flex-row", !m.mine && "pl-7")}>
                    {/* 말풍선을 누르면 메뉴를 펼친다(안에 사진 링크가 있어 button 대신 div) */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(open ? null : m.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") setOpenId(open ? null : m.id); }}
                      className={cn(
                        "min-w-0 cursor-pointer rounded-2xl px-3 py-2 text-left text-sm",
                        m.mine ? "rounded-br-sm bg-brand text-brand-ink" : "rounded-bl-sm bg-panel2",
                        callsMe && "ring-1 ring-brand",
                        m.status !== "active" && "opacity-70",
                      )}
                    >
                      {m.status === "deleted" ? (
                        <span className="text-xs italic">{m.by_admin ? "관리자에 의해 삭제된 메시지예요" : "삭제된 메시지예요"}</span>
                      ) : (
                        <>
                          {m.status === "hidden" && <span className="block text-xs italic">신고가 쌓여 가려진 메시지예요{m.body !== null && " (보낸 사람·관리자에게만 내용이 보여요)"}</span>}
                          {m.image && (
                            <a href={boardImageUrl(m.image.path)} target="_blank" rel="noopener noreferrer" className="block" onClick={(e) => e.stopPropagation()}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={boardImageUrl(m.image.thumb)} alt="보낸 사진" width={180} height={180} className="h-44 w-44 rounded-lg object-cover" />
                            </a>
                          )}
                          {m.body && <ChatText text={m.body} myName={myName} mine={m.mine} />}
                        </>
                      )}
                    </div>
                    {showTime && <span className="shrink-0 text-[10px] text-muted">{timeText(m.created_at)}</span>}
                  </div>
                  {open && (
                    // 메시지 메뉴: 다른 회원 = @부르기·신고·차단, 내 것 = 삭제, 관리자 = 숨김·삭제·작성자 확인
                    <div className={cn("mt-1 flex flex-wrap items-center gap-3 text-xs", !m.mine && "pl-7")}>
                      {!m.mine && m.card.kind !== "gone" && <button className="text-brand hover:underline" onClick={() => mention(m.card)}>@부르기</button>}
                      {!m.mine && m.status !== "deleted" && m.card.kind !== "gone" && (
                        <ReportBlock kind="chat" refId={String(m.id)} label={m.card.nickname ?? "회원"} what="메시지" onBlocked={() => { setOpenId(null); loadLatest(); }} />
                      )}
                      {m.mine && m.status !== "deleted" && <button className="text-muted hover:text-loss" onClick={() => setAskDelete(m.id)}>삭제</button>}
                      {me.is_admin && <AdminContentTools kind="chat" refId={String(m.id)} status={m.status} onChanged={() => refreshIds([m.id])} compact />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {newBelow && (
          <button onClick={scrollToBottom} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-ink shadow-lg">
            새 메시지 ↓
          </button>
        )}
      </div>

      {sendable ? (
        <div className="flex items-end gap-2">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="사진 보내기" className="mb-1 rounded-md p-2 text-muted hover:text-foreground disabled:opacity-50"><ImagePlus size={20} /></button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => sendPhoto(e.target.files?.[0])} />
          <Textarea ref={inputRef} value={text} maxLength={CHAT_MAX} rows={1} onChange={(e) => setText(e.target.value)} className="max-h-32 min-h-[42px] flex-1 resize-none"
            placeholder="메시지를 입력하세요 (@닉네임 으로 부르기)"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <Button disabled={busy || !text.trim()} onClick={() => send()} aria-label="보내기" className="mb-0.5"><Send size={16} /></Button>
        </div>
      ) : (
        <p className="rounded-md bg-panel2 px-3 py-2 text-center text-xs text-muted">
          {me.banned
            ? <>커뮤니티 이용이 제한되어 메시지를 보낼 수 없어요({me.ban_permanent ? "영구" : me.ban_until ? `${new Date(me.ban_until).toLocaleDateString("ko-KR")}까지` : ""}). <Link href="/?tab=community" className="text-brand">사유 보기</Link></>
            : <>커뮤니티 전용 닉네임이 없어요. <Link href="/?tab=community" className="text-brand">커뮤니티 설정</Link>에서 정하거나 이름을 익명 닉네임으로 <button className="text-brand" onClick={onChangeFace}>바꿔</button> 주세요.</>}
        </p>
      )}
      <Confirm open={askDelete !== null} message="이 메시지를 지울까요? 다른 회원에게는 '삭제된 메시지'로 보여요." okText="삭제" onOk={() => askDelete !== null && removeMine(askDelete)} onCancel={() => setAskDelete(null)} />
    </>
  );
}
