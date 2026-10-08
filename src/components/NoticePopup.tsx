"use client";
// 관리자가 올린 공지를 로그인한 회원에게 팝업으로 보여준다 (AppShell 에서 로그인 상태일 때만 마운트).
// - 닫기: 이번 접속(브라우저 탭 세션) 동안만 숨김 → 다음에 접속하면 다시 보임 (sessionStorage)
// - 오늘 하루 보지 않기: 오늘 날짜를 기억해 자정까지 숨김 (localStorage)
// - 공지가 여러 개면 최신순으로 하나씩 보여준다. 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 닫아도 페이지를 옮기면 다시 보일 수 있다.
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "./ui/button";
import { useDialogFocus } from "./ui/modal";
import { cn } from "@/lib/utils";

interface NoticeRow { id: number; title: string; body: string; level: "info" | "important" }

const HIDE_KEY = "yf_notice_hide_until"; // { [id]: 'YYYY-MM-DD' } — 해당 날짜에는 숨김
const CLOSED_KEY = "yf_notice_closed"; // 이번 세션에서 닫은 id 배열

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function readJson<T>(store: Storage | undefined, key: string, fallback: T): T {
  try {
    return JSON.parse(store?.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}
function writeJson(store: Storage | undefined, key: string, v: unknown) {
  try {
    store?.setItem(key, JSON.stringify(v));
  } catch {
    /* 저장소를 쓸 수 없으면 무시 */
  }
}

export function NoticePopup() {
  const [queue, setQueue] = useState<NoticeRow[]>([]);

  useEffect(() => {
    let live = true;
    supabase.from("notices").select("id,title,body,level").order("created_at", { ascending: false }).limit(10).then(({ data }) => {
      if (!live) return;
      const hide = readJson<Record<string, string>>(window.localStorage, HIDE_KEY, {});
      const closed = readJson<number[]>(window.sessionStorage, CLOSED_KEY, []);
      setQueue(((data ?? []) as NoticeRow[]).filter((n) => hide[n.id] !== today() && !closed.includes(n.id)));
    });
    return () => { live = false; };
  }, []);

  const cur = queue[0];
  // 공지 창이 떠 있는 동안 키보드 초점을 창 안에 둔다(닫히면 원래 자리로)
  const boxRef = useDialogFocus<HTMLDivElement>(!!cur);
  if (!cur) return null;

  const close = () => {
    writeJson(window.sessionStorage, CLOSED_KEY, [...readJson<number[]>(window.sessionStorage, CLOSED_KEY, []), cur.id]);
    setQueue((q) => q.slice(1));
  };
  const hideToday = () => {
    writeJson(window.localStorage, HIDE_KEY, { ...readJson<Record<string, string>>(window.localStorage, HIDE_KEY, {}), [cur.id]: today() });
    setQueue((q) => q.slice(1));
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[#03080e]/75 p-4 backdrop-blur-[2px]" onMouseDown={close}>
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="공지"
        className={cn("max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border bg-panel p-5 shadow-xl", cur.level === "important" ? "border-loss/60" : "border-line")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Megaphone size={18} className={cur.level === "important" ? "text-loss" : "text-brand"} />
          <h2 className="min-w-0 flex-1 text-base font-bold">{cur.title}</h2>
          {queue.length > 1 && <span className="shrink-0 text-xs text-muted">남은 공지 {queue.length - 1}개</span>}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{cur.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={hideToday}>오늘 하루 보지 않기</Button>
          <Button onClick={close}>닫기</Button>
        </div>
      </div>
    </div>
  );
}
