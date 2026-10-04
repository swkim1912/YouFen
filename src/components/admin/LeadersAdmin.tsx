"use client";
// 관리자: 지도자 승인. 회원이 가입·설정에서 신분을 '지도자'로 고르면(또는 지도자가 소속 클럽을 바꾸면) 승인 대기(leader_status='pending')가 된다.
// - 승인하면 프로필에 '지도자'로 보이고, 소속 클럽 이미지 신청(/api/club-image)을 할 수 있다. 반려하면 '지도자(승인 반려)'로 보인다.
// - 판단 근거: 닉네임·이메일·소속 클럽·지역. 필요하면 이메일로 지도자 확인(자격증·클럽 운영 여부 등)을 받은 뒤 처리한다.
// - 상태 변경은 DB 함수 admin_set_leader 만 할 수 있다(일반 회원은 leader_status 를 직접 못 바꿈 — 트리거 profiles_guard).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fmtDateTime, rpcOk } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

interface Leader {
  id: string; nickname: string | null; email: string | null; club_id: number | null; club_name: string | null; affiliation: string | null;
  region: string | null; weapon: string | null; division: string | null; leader_status: "pending" | "approved" | "rejected" | null;
  leader_requested_at: string | null; created_at: string;
}
const STATUS = { pending: "승인 대기", approved: "승인됨", rejected: "반려" } as const;

export function LeadersAdmin({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState("pending");
  const [list, setList] = useState<Leader[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_leaders", { p_status: status });
    setList((data ?? []) as Leader[]);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (l: Leader, approve: boolean) => {
    const err = await rpcOk("admin_set_leader", { p_target: l.id, p_approve: approve });
    if (err) return toast.error(err);
    toast.success(approve ? "지도자로 승인했어요" : "반려했어요");
    load();
    onChanged?.();
  };

  return (
    <section className="space-y-4 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-base font-bold">지도자 승인</h2>
        <Select className="h-8 w-28" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">승인 대기</option><option value="approved">승인됨</option><option value="rejected">반려</option><option value="all">전체</option>
        </Select>
      </div>
      <p className="text-xs text-muted">신분을 지도자로 고른 회원입니다. 소속 클럽의 실제 지도자인지 확인한 뒤 승인해 주세요. 승인된 지도자만 클럽 이미지를 신청할 수 있어요.</p>
      {list === null ? <p className="py-3 text-center text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="py-3 text-center text-sm text-muted">해당하는 회원이 없습니다</p> : (
        <ul className="space-y-2">
          {list.map((l) => (
            <li key={l.id} className="space-y-1.5 rounded-md bg-panel2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-2">
                <b>{l.nickname ?? "(닉네임 없음)"}</b>
                <span className="select-all text-xs text-muted">{l.email}</span>
                <span className="ml-auto text-[11px] text-muted">{l.leader_status ? STATUS[l.leader_status] : "-"} · 신청 {fmtDateTime(l.leader_requested_at)}</span>
              </div>
              <p className="text-xs text-muted">
                소속 클럽 <b className="text-foreground">{l.club_name ?? l.affiliation ?? "무소속"}</b> · {[l.region, l.weapon, l.division].filter(Boolean).join(" · ")} · 가입 {fmtDateTime(l.created_at)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {l.leader_status !== "approved" && <Button size="sm" onClick={() => decide(l, true)}>승인</Button>}
                {l.leader_status !== "rejected" && <Button size="sm" variant="outline" onClick={() => decide(l, false)}>{l.leader_status === "approved" ? "승인 취소(반려)" : "반려"}</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
