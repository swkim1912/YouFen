"use client";
// 마이페이지 '상세정보' 탭: 내 계정에 연결된 선수 목록(협회 등록 확인 시즌·종목·소속)과 연결/해제.
// 연결 개수: 학부모·지도자는 여러 명(최대 10), 그 외 신분(선수 본인)은 1명 — DB link_athlete 가 같은 규칙으로 막는다.
// 해제하면 선수가 비어 다른 계정(또는 같은 계정, 같은 번호로)이 다시 연결할 수 있다.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { weaponLabel } from "@/lib/fencing";
import { Button } from "./ui/button";
import { Confirm } from "./ui/modal";
import { LinkAthleteModal } from "./LinkAthleteModal";
import { useAuth } from "./AuthProvider";

interface LinkRow {
  athlete_id: number;
  reg_year: number;
  linked_at: string;
  athlete: { id: number; name: string; gender: string | null; reg_years: number[]; club: { name: string } | null } | null;
}

export function LinkedAthletes() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [weapons, setWeapons] = useState<Map<number, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [unlink, setUnlink] = useState<LinkRow | null>(null);

  const load = useCallback(async () => {
    // 내 연결 선수 + 그 선수가 대회에서 실제로 뛴 종목 (DB 함수 my_linked_athletes — 선수 표는 직접 읽지 않음)
    const { data } = await supabase.rpc("my_linked_athletes");
    const list = (data ?? []) as (LinkRow & { weapons: string[] })[];
    setRows(list);
    setWeapons(new Map(list.map((r) => [r.athlete_id, r.weapons ?? []])));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const doUnlink = async () => {
    if (!unlink) return;
    const { error } = await supabase.rpc("unlink_athlete", { p_athlete_id: unlink.athlete_id });
    setUnlink(null);
    if (error) return toast.error(error.message);
    toast.success("선수 연결을 해제했습니다");
    load();
  };

  const thisYear = new Date().getFullYear();
  const multi = profile?.role === "학부모" || profile?.role === "지도자"; // 여러 선수를 연결할 수 있는 신분
  const canLink = !loading && (multi ? rows.length < 10 : rows.length === 0);

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold">연결된 선수</h3>
        {canLink && <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} className="mr-1" />선수 연결</Button>}
      </div>
      {!loading && !multi && rows.length > 0 && (
        <p className="-mt-1 mb-3 text-xs text-muted">선수 본인 계정은 선수를 한 명만 연결할 수 있어요. 자녀·지도 선수를 여러 명 연결하려면 상세 설정에서 신분을 학부모 또는 지도자로 바꿔 주세요.</p>
      )}
      {loading ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">연결된 선수가 없습니다. 선수를 연결하면 대회 기록과 랭킹이 내 계정에 이어집니다.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const a = r.athlete;
            if (!a) return null;
            const regNow = a.reg_years.includes(thisYear);
            return (
              <div key={r.athlete_id} className="rounded-md bg-panel2 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Link href={`/athletes/${a.id}`} className="font-bold hover:text-brand">{a.name}</Link>
                  <span className="text-xs text-muted">{a.gender}</span>
                  <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${regNow ? "bg-win/20 text-win" : "bg-white/10 text-muted"}`}>
                    {regNow ? `${thisYear} 등록 확인` : `${thisYear} 등록 미확인`}
                  </span>
                  <button className="ml-auto text-xs text-muted hover:text-loss" onClick={() => setUnlink(r)}>연결 해제</button>
                </div>
                <dl className="mt-1.5 grid grid-cols-[4.5rem_1fr] gap-y-0.5 text-xs">
                  <dt className="text-muted">소속</dt><dd>{a.club?.name ?? "-"}</dd>
                  <dt className="text-muted">종목</dt><dd>{(weapons.get(a.id) ?? []).map(weaponLabel).join(" · ") || "-"}</dd>
                  <dt className="text-muted">등록 확인 시즌</dt><dd>{a.reg_years.length ? a.reg_years.join(" · ") : "-"} <span className="text-muted">(연결 시 확인: {r.reg_year}년)</span></dd>
                </dl>
              </div>
            );
          })}
        </div>
      )}
      <LinkAthleteModal open={open} onClose={() => setOpen(false)} onLinked={() => { setOpen(false); load(); }} />
      <Confirm
        open={!!unlink}
        message={`${unlink?.athlete?.name ?? ""} 선수의 연결을 해제할까요? 해제해도 같은 체육인번호로 언제든 다시 연결할 수 있어요.`}
        okText="해제"
        onOk={doUnlink}
        onCancel={() => setUnlink(null)}
      />
    </section>
  );
}
