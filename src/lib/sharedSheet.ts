"use client";
// 기록지(개인전·단체전) 내용을 '혼자 편집(이 기기에만)' 또는 '공동 편집(링크로 들어온 회원끼리 실시간)'으로 다루는 훅.
//
// - 기록지 화면은 내용 전체를 하나의 문서(doc, JSON)로 들고, 바꿀 때는 patch([{p: 경로, v: 값}]) 로 '어느 칸을 무엇으로' 만 알린다.
//   (경로 예: ["info","title"], ["results","0-1"], ["tsA","3"] / 삭제는 {p, d: 1} / 경로가 빈 배열이면 전체 교체 = 초기화)
// - 혼자 편집: 이 기기 화면 상태만 바꾼다(지금까지와 같음).
// - 공동 편집(주소에 ?share=<id>): 서버 문서(shared_sheets) + 아직 서버에 반영 안 된 내 수정(pending)을 겹쳐서 보여준다.
//   수정은 RPC sheet_patch 로 보내 서버가 차례로 적용하고(다른 칸을 동시에 고쳐도 덮어쓰지 않음),
//   다른 사람의 수정은 Supabase Realtime(postgres_changes, 참여자만 받음)으로 받아 버전이 더 새로우면 서버 문서를 바꾼다.
//   글자 입력은 debounceKey 로 묶어 잠시 멈췄을 때 한 번만 보낸다(키 입력마다 서버 요청을 하지 않도록).
// - 접속 중인 사람은 Realtime presence 로 닉네임을 모은다.
// - 공동 편집 중 다른 메뉴를 누르면 확인 팝업(leaveTo), 이 기기에 '최근 공동 편집 기록지'(localStorage)를 남겨 다시 들어올 수 있게 한다.
// DB: shared_sheets / shared_sheet_members, RPC sheet_create·sheet_join·sheet_patch (supabase/README.md 31)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "./supabase";
import { useAuth } from "@/components/AuthProvider";

export type Op = { p: string[]; v?: unknown; d?: 1 };
export type SheetMode = "local" | "loading" | "live" | "login" | "missing";

/** 문서에 수정 목록을 차례로 적용한 새 문서(원본은 그대로). 서버 sheet_patch 와 같은 규칙 */
export function applyOps<T>(doc: T, ops: Op[]): T {
  let out: unknown = doc;
  for (const op of ops) {
    if (op.p.length === 0) { out = op.v; continue; }
    out = setIn(out, op.p, op.d ? DELETE : op.v ?? null);
  }
  return out as T;
}
const DELETE = Symbol("delete");
function setIn(node: unknown, path: string[], value: unknown): unknown {
  const [k, ...rest] = path;
  if (Array.isArray(node)) {
    const i = Number(k);
    const copy = [...node];
    if (rest.length) copy[i] = setIn(copy[i], rest, value);
    else if (value === DELETE) copy.splice(i, 1);
    else copy[i] = value;
    return copy;
  }
  const obj = { ...((node ?? {}) as Record<string, unknown>) };
  if (rest.length) obj[k] = setIn(obj[k], rest, value);
  else if (value === DELETE) delete obj[k];
  else obj[k] = value;
  return obj;
}

interface Pending { id: number; key?: string; ops: Op[]; sent: boolean }

export function useSheetDoc<T extends object>(kind: "pool" | "team", initial: () => T, shareId: string | null) {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [localDoc, setLocalDoc] = useState<T>(initial);
  const [serverDoc, setServerDoc] = useState<T | null>(null);
  const [pending, setPendingState] = useState<Pending[]>([]);
  // 보낼 내용을 바로 읽어야 해서 목록은 ref 에 두고, 화면 갱신용으로 state 에도 같이 넣는다
  const pendingRef = useRef<Pending[]>([]);
  const setPending = useCallback((fn: (list: Pending[]) => Pending[]) => {
    pendingRef.current = fn(pendingRef.current);
    setPendingState(pendingRef.current);
  }, []);
  const [mode, setMode] = useState<SheetMode>(shareId ? "loading" : "local");
  const [members, setMembers] = useState<string[]>([]);
  const verRef = useRef(0);
  const seqRef = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const initialRef = useRef(initial);

  // 서버 문서를 받을 때 빠진 칸이 있어도 화면이 깨지지 않게 기본 문서와 합친다
  const adopt = useCallback((data: unknown, version: number) => {
    if (version <= verRef.current) return;
    verRef.current = version;
    setServerDoc({ ...initialRef.current(), ...(data as T) });
  }, []);

  // ---- 공동 편집: 참여(현재 내용 받기) + 실시간 구독 ----
  useEffect(() => {
    if (!shareId) { setMode("local"); return; }
    if (authLoading) return;
    if (!user) { setMode("login"); return; }
    let alive = true;
    const join = async () => {
      const { data, error } = await supabase.rpc("sheet_join", { p_id: shareId });
      if (!alive) return;
      if (error) { toast.error(error.message); setMode("missing"); return; }
      const r = data as { kind: string; data: unknown; version: number } | null;
      if (!r || r.kind !== kind) { setMode("missing"); return; }
      adopt(r.data, r.version);
      setMode("live");
    };
    join();
    const ch = supabase.channel(`sheet-${shareId}`, { config: { presence: { key: user.id } } });
    ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "shared_sheets", filter: `id=eq.${shareId}` }, (payload) => {
      const row = payload.new as { data: unknown; version: number };
      adopt(row.data, Number(row.version));
    })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "shared_sheets", filter: `id=eq.${shareId}` }, () => setMode("missing"))
      .on("presence", { event: "sync" }, () => {
        const st = ch.presenceState<{ nickname: string }>();
        setMembers([...new Set(Object.values(st).flat().map((x) => x.nickname).filter(Boolean))]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          ch.track({ nickname: profile?.nickname ?? "회원" });
          join(); // 구독 직전 사이에 바뀐 내용이 있을 수 있어 한 번 더 받는다
        }
      });
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [shareId, kind, user, authLoading, profile?.nickname, adopt]);

  // ---- 보내기 ----
  const send = useCallback(async (entryId: number) => {
    if (!shareId) return;
    const entry = pendingRef.current.find((e) => e.id === entryId);
    if (!entry || entry.sent) return;
    const ops = entry.ops;
    setPending((list) => list.map((e) => (e.id === entryId ? { ...e, sent: true } : e)));
    const { data, error } = await supabase.rpc("sheet_patch", { p_id: shareId, p_ops: ops });
    setPending((list) => list.filter((e) => e.id !== entryId));
    if (error) {
      toast.error(error.message.includes("참여자") ? "이 기록지에 참여하지 않았어요. 새로고침해 주세요" : "변경 내용을 저장하지 못했어요. 다시 시도해 주세요");
      return;
    }
    const r = data as { version: number; data: unknown };
    adopt(r.data, r.version);
  }, [shareId, adopt, setPending]);

  /** 수정 알리기. debounceKey 를 주면(글자 입력) 같은 칸의 연속 입력을 묶어 잠시 뒤 한 번만 보낸다 */
  const patch = useCallback((ops: Op[], opts?: { debounceKey?: string }) => {
    if (!shareId) { setLocalDoc((d) => applyOps(d, ops)); return; }
    const key = opts?.debounceKey;
    if (key) {
      const hit = pendingRef.current.find((e) => e.key === key && !e.sent);
      const id = hit ? hit.id : ++seqRef.current;
      setPending((list) => (hit ? list.map((e) => (e.id === id ? { ...e, ops } : e)) : [...list, { id, key, ops, sent: false }]));
      const old = timers.current.get(key);
      if (old) clearTimeout(old);
      timers.current.set(key, setTimeout(() => { timers.current.delete(key); send(id); }, 400));
      return;
    }
    const id = ++seqRef.current;
    setPending((list) => [...list, { id, ops, sent: false }]);
    setTimeout(() => send(id), 0);
  }, [shareId, send, setPending]);

  // 화면에 보일 문서: 혼자 편집이면 로컬, 공동 편집이면 서버 문서 + 아직 반영 안 된 내 수정
  const doc = useMemo<T>(() => {
    if (!shareId) return localDoc;
    const base = serverDoc ?? localDoc;
    return pending.reduce((d, e) => applyOps(d, e.ops), base);
  }, [shareId, localDoc, serverDoc, pending]);

  const link = shareId && typeof window !== "undefined" ? `${window.location.origin}${pathname}?share=${shareId}` : "";
  const [linkOpen, setLinkOpen] = useState(false); // 공동 편집 링크 팝업 (만든 직후 자동으로 열림)
  const [leaveTo, setLeaveTo] = useState<string | null>(null); // 다른 메뉴로 나가려 할 때 확인 팝업에 쓸 주소

  // 이 기기의 '최근 공동 편집 기록지' 목록에 남긴다(다른 메뉴로 나갔다가 다시 들어올 수 있게) — 제목이 바뀌면 같이 갱신
  const title = (doc as { info?: { title?: string } }).info?.title ?? "";
  useEffect(() => {
    if (mode === "live" && shareId) rememberSheet(kind, shareId, title);
    if (mode === "missing" && shareId) forgetSheet(shareId);
  }, [mode, shareId, kind, title]);

  // 공동 편집 중 다른 메뉴(링크)를 누르면 한 번 더 확인하고, 새로고침·탭 닫기는 브라우저 확인 창을 띄운다
  useEffect(() => {
    if (mode !== "live") return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.searchParams.get("share") === shareId) return; // 같은 기록지
      e.preventDefault();
      e.stopPropagation(); // Next 의 Link 이동도 막는다(문서 캡처 단계에서 먼저 처리)
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [mode, shareId]);

  const copyLink = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("링크를 복사했어요. 함께 편집할 회원에게 보내 주세요");
    } catch {
      toast.error("자동 복사가 안 돼요. 링크를 길게 눌러 직접 복사해 주세요");
    }
  }, [link]);

  /** 공동 편집 시작: 지금까지 적은 내용으로 공동 기록지를 만들고 그 주소로 이동한 뒤 링크 팝업을 연다 */
  const startShare = useCallback(async () => {
    if (!user) return toast.error("공동 편집은 로그인한 회원만 이용할 수 있어요");
    const { data, error } = await supabase.rpc("sheet_create", { p_kind: kind, p_data: localDoc });
    if (error || !data) return toast.error(error?.message ?? "공동 편집을 시작하지 못했어요");
    const id = data as string;
    verRef.current = 1;
    setServerDoc(localDoc);
    setMode("loading");
    setLinkOpen(true);
    router.replace(`${pathname}?share=${id}`);
  }, [user, kind, localDoc, router, pathname]);

  /** 혼자 편집으로 전환: 지금 보이는 내용을 이 기기로 복사하고 공동 편집 주소에서 나온다(다른 사람의 기록지는 그대로) */
  const leaveShare = useCallback(() => {
    setLocalDoc(doc);
    setServerDoc(null);
    setPending(() => []);
    verRef.current = 0;
    router.replace(pathname);
  }, [doc, router, pathname, setPending]);

  /** 기록지 나가기: 빈 기록지로 돌아간다(공동 기록지는 그대로 남아 링크·최근 목록으로 다시 들어올 수 있음) */
  const exitShare = useCallback(() => {
    setLocalDoc(initialRef.current());
    setServerDoc(null);
    setPending(() => []);
    verRef.current = 0;
    router.replace(pathname);
  }, [router, pathname, setPending]);

  /** 나가기 확인 팝업에서 '나가기'를 누르면 원래 가려던 메뉴로 이동 */
  const confirmLeave = useCallback(() => {
    const to = leaveTo;
    setLeaveTo(null);
    if (to) router.push(to);
  }, [leaveTo, router]);

  return {
    doc, patch, mode, members, startShare, leaveShare, exitShare,
    link, copyLink, linkOpen, setLinkOpen,
    leaveTo, confirmLeave, cancelLeave: () => setLeaveTo(null),
  };
}

// ---- 이 기기의 최근 공동 편집 기록지 (localStorage, 최대 5개) ----
export interface RecentSheet { id: string; kind: string; title: string; at: number }
const RECENT_KEY = "youfen.recentSheets";

export function recentSheets(kind: string): RecentSheet[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentSheet[];
    // 서버는 5일 동안 수정이 없으면 지우므로 그보다 오래된 항목은 보여주지 않는다
    return list.filter((x) => x.kind === kind && Date.now() - x.at < 5 * 24 * 3600 * 1000);
  } catch {
    return [];
  }
}
function rememberSheet(kind: string, id: string, title: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentSheet[]).filter((x) => x.id !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ id, kind, title, at: Date.now() }, ...list].slice(0, 5)));
  } catch { /* 저장소를 못 쓰는 환경이면 목록 없이 동작 */ }
}
function forgetSheet(id: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentSheet[]).filter((x) => x.id !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* 무시 */ }
}
