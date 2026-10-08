"use client";
// 관리자 페이지(/admin): 탭 — 현황 / 공지 / 데이터 갱신 / 고객지원 / 신고(커뮤니티 신고 + 프로필 사진 신고) / 선수 연결 / 지도자 승인 / 클럽 / 회원.
// - 주소의 ?tab=<탭> 으로 처음 열 탭을 정한다(운영 알림의 링크 '/admin?tab=reports' 등).
// - 관리자 권한(profiles.is_admin)은 Supabase 대시보드 SQL 로만 부여한다(웹에서는 부여·변경 불가).
//   예) update public.profiles set is_admin = true where email = '가입한 이메일';
// - 화면 보호는 보조 수단이고, 실제 권한 검사는 DB(RLS 정책·RPC 의 is_admin_user())와 서버 API(authed().isAdmin)가 한다.
// - 탭 이름 옆 빨간 숫자는 처리할 일의 개수(admin_overview). 처리하면 해당 탭이 onChanged 로 숫자를 다시 읽는다.
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { NoticeAdmin } from "@/components/admin/NoticeAdmin";
import { RefreshPanel } from "@/components/admin/RefreshPanel";
import { SupportAdmin } from "@/components/admin/SupportAdmin";
import { ReportsAdmin } from "@/components/admin/ReportsAdmin";
import { CommunityReportsAdmin } from "@/components/admin/CommunityReportsAdmin";
import { ClaimsAdmin } from "@/components/admin/ClaimsAdmin";
import { ClubsAdmin } from "@/components/admin/ClubsAdmin";
import { MembersAdmin } from "@/components/admin/MembersAdmin";
import { LeadersAdmin } from "@/components/admin/LeadersAdmin";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/adminApi";
import { cn } from "@/lib/utils";

interface Overview {
  users: number; linked_athletes: number; claims: number; support_new: number; avatar_reports: number; community_reports?: number; club_requests: number; leaders_pending: number; clubs_review: number;
  teams: number; clubs: number; players: number; competitions: number; last_competition: string | null; events: number;
  last_done: Record<string, string>;
}
interface AuditRow { id: number; action: string; target: string | null; detail: Record<string, unknown> | null; created_at: string; admin_nickname: string | null }

type Tab = "home" | "notice" | "refresh" | "support" | "reports" | "claims" | "leaders" | "clubs" | "members";
const TAB_KEYS: Tab[] = ["home", "notice", "refresh", "support", "reports", "claims", "leaders", "clubs", "members"];

const ACTION: Record<string, string> = {
  avatar_lock: "사진 변경 제한", avatar_unlock: "사진 제한 해제", avatar_remove: "사진 삭제", avatar_remove_lock: "사진 삭제+제한",
  report_resolved: "신고 처리", report_dismissed: "신고 기각", report_open: "신고 되돌림",
  claim_resolved: "연결 문의 처리", claim_rejected: "연결 문의 반려", claim_open: "연결 문의 되돌림", athlete_unlink: "선수 연결 해제",
  club_confidence: "클럽 확인 표시", club_rename: "클럽 이름 변경", club_merge: "클럽 병합",
  club_image_set: "클럽 마크 등록", club_image_approve: "클럽 마크 승인", club_image_reject: "클럽 마크 반려", club_image_remove: "클럽 마크 제거",
  suspend: "이용 정지", unsuspend: "정지 해제", leader_approve: "지도자 승인", leader_reject: "지도자 반려",
  community_ban: "커뮤니티 정지", community_unban: "커뮤니티 정지 해제", community_nick_clear: "커뮤니티 닉네임 삭제",
  creport_resolved: "커뮤니티 신고 처리", creport_dismissed: "커뮤니티 신고 기각", creport_open: "커뮤니티 신고 되돌림",
  cavatar_remove: "커뮤니티 사진 삭제", cavatar_remove_lock: "커뮤니티 사진 삭제+제한",
};

export default function AdminPage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Admin />
      </Suspense>
    </AppShell>
  );
}

function Admin() {
  const { profile } = useAuth();
  const tabParam = useSearchParams().get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam && TAB_KEYS.includes(tabParam) ? tabParam : "home");
  useEffect(() => { if (tabParam && TAB_KEYS.includes(tabParam)) setTab(tabParam); }, [tabParam]);
  const [ov, setOv] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const isAdmin = !!profile?.is_admin;

  const loadOv = useCallback(async () => {
    const { data } = await supabase.rpc("admin_overview");
    setOv(data as Overview | null);
    const a = await supabase.rpc("admin_audit_recent", { p_limit: 20 });
    setAudit((a.data ?? []) as AuditRow[]);
  }, []);
  useEffect(() => { if (isAdmin) loadOv(); }, [isAdmin, loadOv]);

  if (!isAdmin) return <p className="py-16 text-center text-muted">접근 권한이 없습니다</p>;

  const TABS: [Tab, string, number | undefined][] = [
    ["home", "현황", undefined], ["notice", "공지", undefined], ["refresh", "데이터 갱신", undefined],
    ["support", "고객지원", ov?.support_new], ["reports", "신고", ((ov?.avatar_reports ?? 0) + (ov?.community_reports ?? 0)) || undefined], ["claims", "선수 연결", ov?.claims],
    ["leaders", "지도자 승인", ov?.leaders_pending], ["clubs", "클럽", (ov?.club_requests ?? 0) || undefined], ["members", "회원", undefined],
  ];
  const cards: [string, string | number | undefined][] = [
    ["회원", ov?.users], ["연결된 선수", ov?.linked_athletes], ["새 고객지원 접수", ov?.support_new], ["미처리 사진 신고", ov?.avatar_reports], ["미처리 커뮤니티 신고", ov?.community_reports],
    ["미처리 선수 연결 문의", ov?.claims], ["지도자 승인 대기", ov?.leaders_pending], ["클럽 마크 신청 대기", ov?.club_requests], ["확인 필요 클럽", ov?.clubs_review],
    ["협회 팀 / 클럽", ov ? `${ov.teams} / ${ov.clubs}` : undefined], ["협회 선수", ov?.players],
    ["대회 / 종목", ov ? `${ov.competitions} / ${ov.events}` : undefined], ["가장 최근 대회", ov?.last_competition ?? undefined],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">관리자</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("-mb-px flex shrink-0 items-center gap-1 border-b-2 px-3 py-2 text-sm", tab === k ? "border-brand font-bold" : "border-transparent text-muted hover:text-foreground")}>
            {label}
            {!!n && <span className="rounded-full bg-loss px-1.5 text-[10px] font-bold text-white">{n}</span>}
          </button>
        ))}
      </nav>

      {tab === "home" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {cards.map(([label, v]) => (
              <div key={label} className="rounded-lg border border-line bg-panel p-3">
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-0.5 text-lg font-bold">{v ?? "-"}</div>
              </div>
            ))}
          </div>
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-2 text-base font-bold">최근 관리 기록</h2>
            {audit.length === 0 ? <p className="text-sm text-muted">아직 기록이 없습니다</p> : (
              <ul className="space-y-1 text-xs">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap gap-x-2 rounded-md bg-panel2 px-3 py-1.5">
                    <b>{ACTION[a.action] ?? a.action}</b><span className="text-muted">{a.admin_nickname ?? "(관리자)"} · 대상 {a.target ?? "-"}</span>
                    <span className="ml-auto text-muted">{fmtDateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {tab === "notice" && <NoticeAdmin />}
      {tab === "refresh" && <RefreshPanel lastDone={ov?.last_done ?? {}} />}
      {tab === "support" && <SupportAdmin onChanged={loadOv} />}
      {tab === "reports" && (
        <>
          <CommunityReportsAdmin onChanged={loadOv} />
          <ReportsAdmin onChanged={loadOv} />
        </>
      )}
      {tab === "claims" && <ClaimsAdmin onChanged={loadOv} />}
      {tab === "leaders" && <LeadersAdmin onChanged={loadOv} />}
      {tab === "clubs" && <ClubsAdmin onChanged={loadOv} />}
      {tab === "members" && <MembersAdmin />}
    </div>
  );
}
