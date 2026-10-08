"use client";
// 메인 = 마이페이지. 비로그인 사용자에게는 랜딩(로그인/회원가입 카드 + '비로그인으로 이용')을 보여주고,
// 로그인한 사용자는 바로 마이 펜싱이 열린다.
// 탭: 종합(프로필·티어·전적) / 상세정보(연결된 선수·협회 등록 확인 + 클럽 마크 신청 + 회원 탈퇴) / 커뮤니티 설정(CommunitySettings)
// 주소의 ?tab=detail|community 로 처음 열 탭을 정한다(알림에서 '/?tab=community' 로 들어오는 경우 등).
// 선수가 연결된 회원(학부모 제외)의 종합 탭은 선수 프로필 통합 화면(AthleteView own 모드: 티어 카드·점수·추이·전적·노트)을 쓴다.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthLanding } from "@/components/auth/AuthLanding";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { LinkedAthletes } from "@/components/LinkedAthletes";
import { AccountDelete } from "@/components/AccountDelete";
import { ClubMarkRequest } from "@/components/ClubMarkRequest";
import { AthleteView } from "@/components/AthleteView";
import { CommunitySettings } from "@/components/community/CommunitySettings";
import { isMergeable } from "@/lib/members";
import { publicData } from "@/lib/fencing";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

export default function Home() {
  const { user, loading } = useAuth();
  // 세션 확인 중에는 빈 화면(랜딩이 번쩍 보였다 사라지는 것 방지), 비로그인이면 랜딩
  if (loading) return <div className="flex flex-1 items-center justify-center text-muted">불러오는 중…</div>;
  if (!user) return <AuthLanding />;

  return (
    <AppShell>
      {/* useSearchParams 를 쓰는 화면은 Suspense 안에 둬야 한다(Next 규칙) */}
      <Suspense>
        <MyPage />
      </Suspense>
    </AppShell>
  );
}

type Tab = "main" | "detail" | "community";
const isTab = (t: string | null): t is Tab => t === "main" || t === "detail" || t === "community";

function MyPage() {
  const { profile } = useAuth();
  const tabParam = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(isTab(tabParam) ? tabParam : "main");
  // 이미 마이 펜싱을 보고 있을 때 알림 링크(?tab=…)로 들어와도 탭을 바꾼다
  useEffect(() => { if (isTab(tabParam)) setTab(tabParam); }, [tabParam]);
  // 이 회원에 연결된 선수들 (undefined = 확인 중)
  const [linked, setLinked] = useState<{ id: number; name: string }[] | undefined>(undefined);
  const [pick, setPick] = useState<number | null>(null);
  const pid = profile?.id;
  useEffect(() => {
    if (!pid) return;
    let live = true;
    publicData<{ id: number; name: string }[]>("data_athletes_of_members", { p_ids: [pid] }, []).then((data) => {
      if (live) setLinked(data);
    });
    return () => { live = false; };
  }, [pid, tab]);
  if (!profile) return null;
  const merged = isMergeable(profile) && (linked?.length ?? 0) > 0;
  const curAthlete = linked?.find((a) => a.id === pick) ?? linked?.[0];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-line">
        {([["main", "종합"], ["detail", "상세정보"], ["community", "커뮤니티 설정"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-4 py-2 text-sm", tab === k ? "border-brand font-bold" : "border-transparent text-muted hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>
      {tab === "community" ? (
        <CommunitySettings />
      ) : tab === "detail" ? (
        <>
          <LinkedAthletes />
          <ClubMarkRequest />
          <AccountDelete />
        </>
      ) : linked === undefined ? (
        <p className="py-16 text-center text-muted">불러오는 중…</p>
      ) : merged && curAthlete ? (
        <>
          {linked.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {linked.map((a) => (
                <button key={a.id} onClick={() => setPick(a.id)} className={cn("rounded px-3 py-1.5 text-sm", a.id === curAthlete.id ? "bg-brand font-semibold text-brand-ink" : "bg-panel text-muted hover:text-foreground")}>{a.name}</button>
              ))}
            </div>
          )}
          <AthleteView key={curAthlete.id} athleteId={curAthlete.id} own={profile} />
        </>
      ) : (
        <ProfileView profile={profile} isMe />
      )}
    </div>
  );
}
