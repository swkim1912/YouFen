"use client";
// 모든 페이지의 공통 틀: 상단 바 + 우측 메뉴바('+' 버튼이 최상단).
// - 좁은 화면(md 미만): 우측 메뉴바는 숨기고, 상단 바 아래에 보조 메뉴 줄 + 화면 아래 탭바(+ 버튼은 오른쪽 아래에 떠 있음)로 바꿔 보여준다.
// - 비로그인 사용자도 사이트(랭킹·검색·기록지)를 볼 수 있다.
// - requireAuth 가 true 인 페이지(마이페이지·피드백 노트)만 로그인으로 보낸다.
// - 알림 버튼: 오픈 기록 수락 요청(game_records PENDING) + 공용 알림(notifications 표: 댓글·답글·좋아요·멘션·장터·운영 등).
//   공용 알림은 실시간 연결 대신 페이지를 옮길 때와 1분마다(화면이 보일 때만) 새로 읽는다(Realtime 동시 접속 한도 절약).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronDown, ClipboardList, Home, LogIn, Medal, NotebookPen, Plus, ShieldCheck, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "./AuthProvider";
import { Logo } from "./Logo";
import { SiteFooter } from "./SiteFooter";
import { ConsentGate } from "./auth/ConsentGate";
import { NoticePopup } from "./NoticePopup";
import { NewRecordModal } from "./NewRecordModal";
import { UserSearchBox } from "./UserSearchBox";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { supabase } from "@/lib/supabase";
import { SELECT_RECORDS } from "@/lib/records";
import type { GameRecord } from "@/lib/types";
import { timeAgo, type Notification } from "@/lib/community";
import { cn } from "@/lib/utils";

export function AppShell({ children, requireAuth = false }: { children: React.ReactNode; requireAuth?: boolean }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [showNew, setShowNew] = useState(false);
  const [showNoti, setShowNoti] = useState(false);
  const [pending, setPending] = useState<GameRecord[]>([]);
  const [notis, setNotis] = useState<Notification[]>([]); // 최근 공용 알림 30개
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

  // 공용 알림(최근 30개) 불러오기: 페이지 이동 시 + 1분마다(탭이 보일 때만)
  const loadNotis = useCallback(async () => {
    if (!user) return setNotis([]);
    const { data } = await supabase
      .from("notifications")
      .select("id,kind,title,body,link,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setNotis((data ?? []) as Notification[]);
  }, [user]);
  useEffect(() => {
    loadNotis();
    const t = setInterval(() => { if (document.visibilityState === "visible") loadNotis(); }, 60_000);
    return () => clearInterval(t);
  }, [loadNotis, path]);
  const unread = notis.filter((n) => !n.read_at).length;
  const badge = pending.length + unread; // 알림 버튼의 빨간 숫자

  // 알림 읽음 처리(ids 가 없으면 전체) 후 다시 읽기
  const markRead = async (ids?: number[]) => {
    await supabase.rpc("mark_notifications_read", { p_ids: ids ?? null });
    loadNotis();
  };
  const openNoti = (n: Notification) => {
    if (!n.read_at) markRead([n.id]);
    if (n.link) {
      setShowNoti(false);
      router.push(n.link);
    }
  };

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

  // 좁은 화면용 스타일: 보조 메뉴 줄 항목 / 아래 탭바 항목
  const mobLink = "shrink-0 whitespace-nowrap px-2.5 py-2 text-muted hover:text-foreground";
  const tabCls = (active: boolean) =>
    cn("flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-brand" : "text-muted hover:text-foreground");

  return (
    <div className="flex min-h-screen flex-col">
      {/* 상단 바 */}
      <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-3 sm:gap-4 sm:px-4 md:pr-24">
          <Link href={loggedIn ? "/" : "/ranking"} aria-label="유펜 YouFen 홈" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-4 text-sm md:flex">
            {/* 오픈피스트·커뮤니티·아카데미 메뉴는 공개 전까지 숨김(2026-10-05). 커뮤니티는 개발 중이라 관리자에게만 보인다(docs/COMMUNITY.md 8장) */}
            {profile?.is_admin && <Link href="/community" className={path.startsWith("/community") ? "text-foreground" : "text-muted hover:text-foreground"}>커뮤니티</Link>}
            <Link href="/methodology" className={path === "/methodology" ? "text-foreground" : "text-muted hover:text-foreground"}>점수 안내</Link>
          </nav>
          <UserSearchBox />
        </div>
        {/* 좁은 화면 전용 보조 메뉴 줄(가로 스크롤) — 넓은 화면에서는 위 nav 가 대신한다 */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-line px-2 text-sm md:hidden">
          <Link href="/methodology" className={cn(mobLink, path === "/methodology" && "text-foreground")}>점수 안내</Link>
          {profile?.is_admin && <Link href="/community" className={cn(mobLink, path.startsWith("/community") && "text-foreground")}>커뮤니티</Link>}
          {profile?.is_admin && <Link href="/admin" className={cn(mobLink, path === "/admin" && "text-foreground")}>관리자</Link>}
          {loggedIn ? (
            <button onClick={signOut} className={cn(mobLink, "ml-auto")}>로그아웃</button>
          ) : (
            <Link href="/login" className={cn(mobLink, "ml-auto text-brand")}>로그인</Link>
          )}
        </nav>
      </header>

      {/* 우측 메뉴바: 로그인 시 최상단 '+' = 게임 기록 추가 */}
      <aside className="fixed right-0 top-14 z-20 hidden md:flex h-[calc(100vh-3.5rem)] w-20 flex-col items-center gap-1 overflow-y-auto border-l border-line bg-panel py-3">
        {loggedIn && (
          <>
            <button
              onClick={() => setShowNew(true)}
              aria-label="게임 기록 추가"
              className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand font-semibold text-brand-ink hover:bg-brand/90"
            >
              <Plus size={26} />
            </button>
            <button onClick={() => setShowNoti(true)} className={cn(itemCls(false), "relative")}>
              <Bell size={20} />
              알림
              {badge > 0 && (
                <span className="absolute right-3 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] text-white">
                  {badge > 99 ? "99+" : badge}
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
        {profile?.is_admin && <Link href="/admin" className={itemCls(path === "/admin")}><ShieldCheck size={20} />관리자</Link>}
        <div className="mt-auto w-full">
          {loggedIn ? (
            <button onClick={signOut} className="w-full py-2 text-[11px] text-muted hover:text-foreground">로그아웃</button>
          ) : (
            <Link href="/login" className={itemCls(false)}><LogIn size={20} />로그인</Link>
          )}
        </div>
      </aside>

      <main key={refreshKey} className="mx-auto w-full max-w-5xl min-w-0 flex-1 overflow-x-clip px-3 py-4 sm:px-4 md:py-5 md:pr-24">{children}</main>

      {/* 좁은 화면: 게임 기록 추가(+) 떠 있는 버튼과 아래 탭바 */}
      {loggedIn && (
        <button
          onClick={() => setShowNew(true)}
          aria-label="게임 기록 추가"
          className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-brand font-semibold text-brand-ink shadow-lg md:hidden"
        >
          <Plus size={26} />
        </button>
      )}
      {sheetOpen && (
        <div className="fixed inset-x-0 bottom-14 z-30 flex justify-center gap-2 border-t border-line bg-panel2 py-2 text-sm md:hidden">
          <Link href="/sheet/pool" className={cn("rounded px-4 py-1.5", path === "/sheet/pool" ? "text-brand" : "text-muted")}>개인전 기록지</Link>
          <Link href="/sheet/team" className={cn("rounded px-4 py-1.5", path === "/sheet/team" ? "text-brand" : "text-muted")}>단체전 기록지</Link>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t border-line bg-panel md:hidden">
        {loggedIn && <Link href="/" className={tabCls(path === "/")}><Home size={20} />마이 펜싱</Link>}
        <Link href="/ranking" className={tabCls(path === "/ranking" || path.startsWith("/athletes"))}><Trophy size={20} />랭킹</Link>
        <Link href="/competitions" className={tabCls(path.startsWith("/competitions"))}><Medal size={20} />대회</Link>
        <button onClick={() => setSheetOpen((o) => !o)} className={tabCls(path.startsWith("/sheet"))}><ClipboardList size={20} />기록지</button>
        {loggedIn && (
          <>
            <button onClick={() => setShowNoti(true)} className={cn(tabCls(false), "relative")}>
              <Bell size={20} />알림
              {badge > 0 && <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] text-white">{badge > 99 ? "99+" : badge}</span>}
            </button>
            <Link href="/notes" className={tabCls(path === "/notes")}><NotebookPen size={20} />피드백</Link>
          </>
        )}
      </nav>

      <SiteFooter className="pb-20 md:pb-5" />
      {loggedIn && <ConsentGate />}
      {/* 공지 팝업: 동의·온보딩이 끝난 로그인 회원에게만 */}
      {loggedIn && profile?.onboarded && profile.consent_version && <NoticePopup />}

      {loggedIn && <NewRecordModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => setRefreshKey((k) => k + 1)} />}

      {/* 알림 팝업: 오픈 기록 수락/거절 + 공용 알림 목록 */}
      <Modal open={showNoti} onClose={() => setShowNoti(false)} title="알림">
        {pending.length === 0 && notis.length === 0 && <p className="text-sm text-muted">새 알림이 없습니다</p>}
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
        {notis.length > 0 && (
          <>
            <div className="mb-1.5 flex items-center text-xs text-muted">
              <span className="mr-auto">최근 알림 (60일 보관)</span>
              {unread > 0 && <button className="hover:text-foreground" onClick={() => markRead()}>모두 읽음</button>}
            </div>
            <ul className="space-y-1.5">
              {notis.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openNoti(n)}
                    className={cn("w-full rounded-md border px-3 py-2 text-left text-sm", n.read_at ? "border-line text-muted" : "border-brand/40 bg-brand/5")}
                  >
                    <span className="flex items-start gap-2">
                      {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-label="읽지 않음" />}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block", !n.read_at && "font-semibold text-foreground")}>{n.title}</span>
                        {n.body && <span className="block whitespace-pre-wrap text-xs text-muted">{n.body}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              받을 알림은 <Link href="/?tab=community" className="text-brand" onClick={() => setShowNoti(false)}>마이 펜싱 &gt; 커뮤니티 설정</Link>에서 고를 수 있어요.
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}
