"use client";
// 모든 페이지의 공통 틀: 상단 바 + 우측 메뉴바('+' 버튼이 최상단).
// - 비로그인 사용자도 사이트(랭킹·검색·기록지)를 볼 수 있다.
// - requireAuth 가 true 인 페이지(마이페이지·피드백 노트)만 로그인으로 보낸다.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronDown, ClipboardList, Home, LogIn, Medal, NotebookPen, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "./AuthProvider";
import { NewRecordModal } from "./NewRecordModal";
import { UserSearchBox } from "./UserSearchBox";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { supabase } from "@/lib/supabase";
import { SELECT_RECORDS } from "@/lib/records";
import type { GameRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const soon = () => toast("준비 중인 기능입니다"); // 미구현 메뉴 공통 토스트

export function AppShell({ children, requireAuth = false }: { children: React.ReactNode; requireAuth?: boolean }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [showNew, setShowNew] = useState(false);
  const [showNoti, setShowNoti] = useState(false);
  const [pending, setPending] = useState<GameRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0); // 기록 저장 후 페이지 새로고침용
  const [sheetOpen, setSheetOpen] = useState(path.startsWith("/sheet")); // 기록지 메뉴 펼침

  // 가드: 로그인이 필요한 페이지는 /login, 프로필 미완성(구글 가입 직후)은 /onboarding
  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (requireAuth) router.replace("/login");
    } else if (profile && !profile.onboarded) router.replace("/onboarding");
  }, [loading, user, profile, router, requireAuth]);

  // 나에게 온 수락 대기 요청(=알림) 불러오기
  const loadPending = useCallback(async () => {
    if (!user) return setPending([]);
    const { data } = await supabase
      .from("game_records")
      .select(SELECT_RECORDS)
      .eq("opponent_id", user.id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });
    setPending((data ?? []) as unknown as GameRecord[]);
  }, [user]);
  useEffect(() => {
    loadPending();
  }, [loadPending, refreshKey, path]);

  const respond = async (id: string, accept: boolean) => {
    const { error } = await supabase.rpc("respond_record", { rid: id, accept });
    if (error) return toast.error(error.message);
    toast.success(accept ? "수락했습니다. 전적에 반영됩니다" : "거절했습니다");
    setRefreshKey((k) => k + 1);
  };

  const ready = !loading && (!requireAuth || (user && profile?.onboarded));
  if (!ready) {
    return <div className="flex flex-1 items-center justify-center text-muted">불러오는 중…</div>;
  }
  const loggedIn = !!user && !!profile;

  const itemCls = (active: boolean) =>
    cn("flex w-full flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-brand" : "text-muted hover:text-foreground");

  return (
    <div className="flex min-h-screen flex-col">
      {/* 상단 바 */}
      <header className="sticky top-0 z-30 border-b border-line bg-panel">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 pr-24">
          <Link href={loggedIn ? "/" : "/ranking"} className="text-lg font-extrabold text-brand">
            유펜<span className="ml-1 text-xs font-normal text-muted">YouFen</span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm md:flex">
            <Link href="/methodology" className={path === "/methodology" ? "text-foreground" : "text-muted hover:text-foreground"}>점수 안내</Link>
            <button onClick={soon} className="text-muted hover:text-foreground">오픈피스트</button>
            <button onClick={soon} className="text-muted hover:text-foreground">커뮤니티</button>
            <button onClick={soon} className="text-muted hover:text-foreground">아카데미</button>
          </nav>
          <UserSearchBox />
        </div>
      </header>

      {/* 우측 메뉴바: 로그인 시 최상단 '+' = 게임 기록 추가 */}
      <aside className="fixed right-0 top-14 z-20 flex h-[calc(100vh-3.5rem)] w-20 flex-col items-center gap-1 overflow-y-auto border-l border-line bg-panel py-3">
        {loggedIn && (
          <>
            <button
              onClick={() => setShowNew(true)}
              aria-label="게임 기록 추가"
              className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white hover:bg-brand/90"
            >
              <Plus size={26} />
            </button>
            <button onClick={() => setShowNoti(true)} className={cn(itemCls(false), "relative")}>
              <Bell size={20} />
              알림
              {pending.length > 0 && (
                <span className="absolute right-3 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] text-white">
                  {pending.length}
                </span>
              )}
            </button>
            <Link href="/" className={itemCls(path === "/")}><Home size={20} />마이 펜싱</Link>
          </>
        )}
        <Link href="/ranking" className={itemCls(path === "/ranking" || path.startsWith("/athletes"))}><Trophy size={20} />랭킹</Link>
        <Link href="/competitions" className={itemCls(path.startsWith("/competitions"))}><Medal size={20} />대회</Link>
        {/* 기록지: 누르면 펼쳐지며 개인전/단체전 선택 */}
        <button onClick={() => setSheetOpen((o) => !o)} className={itemCls(path.startsWith("/sheet"))}>
          <ClipboardList size={20} />
          <span className="flex items-center">기록지<ChevronDown size={11} className={cn("transition-transform", sheetOpen && "rotate-180")} /></span>
        </button>
        {sheetOpen && (
          <div className="flex w-full flex-col items-center rounded-md bg-panel2 py-1">
            <Link href="/sheet/pool" className={cn("w-full py-1.5 text-center text-[11px]", path === "/sheet/pool" ? "text-brand" : "text-muted hover:text-foreground")}>개인전</Link>
            <Link href="/sheet/team" className={cn("w-full py-1.5 text-center text-[11px]", path === "/sheet/team" ? "text-brand" : "text-muted hover:text-foreground")}>단체전</Link>
          </div>
        )}
        {loggedIn && <Link href="/notes" className={itemCls(path === "/notes")}><NotebookPen size={20} />피드백</Link>}
        <div className="mt-auto w-full">
          {loggedIn ? (
            <button onClick={signOut} className="w-full py-2 text-[11px] text-muted hover:text-foreground">로그아웃</button>
          ) : (
            <Link href="/login" className={itemCls(false)}><LogIn size={20} />로그인</Link>
          )}
        </div>
      </aside>

      <main key={refreshKey} className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pr-24">{children}</main>

      {loggedIn && <NewRecordModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => setRefreshKey((k) => k + 1)} />}

      {/* 알림 팝업: 오픈 기록 수락/거절 */}
      <Modal open={showNoti} onClose={() => setShowNoti(false)} title="알림">
        {pending.length === 0 && <p className="text-sm text-muted">새 알림이 없습니다</p>}
        {pending.map((r) => (
          <div key={r.id} className="mb-3 rounded-md border border-line bg-panel2 p-3 text-sm">
            <p className="mb-2">
              <b>{r.creator?.nickname}</b> 님이 오픈 기록 등록을 요청했습니다
              <br />
              <span className="text-muted">
                나 {r.opp_score} : {r.my_score} {r.creator?.nickname} ({r.target_score}점 내기)
              </span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => respond(r.id, true)}>수락</Button>
              <Button size="sm" variant="outline" onClick={() => respond(r.id, false)}>거절</Button>
            </div>
          </div>
        ))}
      </Modal>
    </div>
  );
}
