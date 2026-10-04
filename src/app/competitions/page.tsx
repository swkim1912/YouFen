"use client";
// 대회 목록(Pistelog '대회' 탭): 탭 × 종별 × 성별 × 종목을 고르면 그 종목이 열린 대회를 최신순으로 보여준다.
// 한 줄 = 대회 하나의 해당 종목(예: 2026 FILA배 동호인 일반부 남자 에페). 누르면 대회 상세로 이동.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { FilterRow } from "@/components/FilterRow";
import { supabase } from "@/lib/supabase";
import {
  AGES, GENDER_VALUES, TABS, WEAPON_VALUES, agesFor, ageLabel, fmtRange, genderLabel, weaponLabel,
  type Age, type GenderValue, type Tab, type WeaponValue,
} from "@/lib/fencing";

interface Row {
  id: string;
  division: string | null;
  entrants: number | null;
  start_date: string | null;
  competition: { id: string; name: string; start_date: string | null; end_date: string | null };
  winner: { id: number; name: string } | null;
}

export default function CompetitionsPage() {
  return (
    <AppShell>
      <Suspense>
        <Inner />
      </Suspense>
    </AppShell>
  );
}

const pick = <T extends string>(v: string | null, list: readonly T[], dflt: T): T => (v && (list as readonly string[]).includes(v) ? (v as T) : dflt);

function Inner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>(pick(sp.get("tab"), TABS, "동호인"));
  const [age, setAge] = useState<Age>(pick(sp.get("age"), AGES, "일반"));
  const [gender, setGender] = useState<GenderValue>(pick(sp.get("gender"), GENDER_VALUES, "남"));
  const [weapon, setWeapon] = useState<WeaponValue>(pick(sp.get("weapon"), WEAPON_VALUES, "에페"));
  const [year, setYear] = useState("전체");
  const [rows, setRows] = useState<Row[] | null>(null);

  const curAge: Age = agesFor(tab).includes(age) ? age : "일반";

  useEffect(() => {
    const p = new URLSearchParams({ tab, age: curAge, gender, weapon });
    window.history.replaceState(null, "", `/competitions?${p}`);
  }, [tab, curAge, gender, weapon]);

  useEffect(() => {
    setRows(null);
    setYear("전체");
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("comp_events")
        .select("id,division,entrants,start_date,competition:competitions(id,name,start_date,end_date),winner:athletes!winner_athlete_id(id,name)")
        .eq("tab", tab).eq("age", curAge).eq("gender", gender).eq("weapon", weapon)
        .gt("entrants", 0)
        .order("start_date", { ascending: false })
        .limit(1000);
      if (!cancelled) setRows((data ?? []) as unknown as Row[]);
    })();
    return () => { cancelled = true; };
  }, [tab, curAge, gender, weapon]);

  const years = useMemo(() => ["전체", ...[...new Set((rows ?? []).map((r) => (r.start_date ?? "").slice(0, 4)))].filter(Boolean).sort().reverse()], [rows]);
  const shown = (rows ?? []).filter((r) => year === "전체" || (r.start_date ?? "").startsWith(year));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">대회</h1>
        <p className="text-sm text-muted">
          {tab} {ageLabel(curAge)} {genderLabel(gender)} {weaponLabel(weapon)}
          {rows && <> {rows.length}개 대회의 전체 결과를 확인하세요.</>}
        </p>
      </div>
      <div className="space-y-2">
        <FilterRow label="구분" options={TABS} value={tab} onChange={setTab} />
        <FilterRow label="종별" options={agesFor(tab)} value={curAge} onChange={setAge} render={ageLabel} />
        <FilterRow label="성별" options={GENDER_VALUES} value={gender} onChange={setGender} render={genderLabel} />
        <FilterRow label="종목" options={WEAPON_VALUES} value={weapon} onChange={setWeapon} render={weaponLabel} />
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs text-muted">연도</span>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="h-9 rounded-md border border-line bg-panel2 px-2 text-sm" aria-label="연도">
            {years.map((y) => <option key={y} value={y}>{y === "전체" ? "연도 전체" : `${y}년`}</option>)}
          </select>
        </div>
      </div>

      {rows === null ? (
        <p className="py-16 text-center text-muted">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-muted">해당 종목의 대회 기록이 없습니다</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          {/* 표 머리글은 넓은 화면에서만 (좁은 화면은 카드형 두 줄) */}
          <div className="hidden grid-cols-[9rem_1fr_7rem_4rem] items-center gap-3 border-b border-line bg-panel2 px-3 py-2 text-xs text-muted sm:grid">
            <span>날짜</span><span>대회명</span><span>우승</span><span className="text-right">참가</span>
          </div>
          {shown.map((r) => (
            <Link
              key={r.id}
              href={`/competitions/${r.competition.id}?event=${r.id}`}
              className="block border-b border-line px-3 py-3 text-sm last:border-0 hover:bg-white/5 sm:grid sm:grid-cols-[9rem_1fr_7rem_4rem] sm:items-center sm:gap-3"
            >
              <span className="hidden text-xs text-muted sm:block">{fmtRange(r.competition.start_date, r.competition.end_date)}</span>
              <span className="block min-w-0">
                <span className="block break-keep font-medium sm:truncate">{r.competition.name}</span>
                <span className="text-xs text-muted">{r.division ?? "오픈"}<span className="sm:hidden"> · {fmtRange(r.competition.start_date, r.competition.end_date)}</span></span>
              </span>
              {/* 좁은 화면: 우승·참가를 둘째 줄에 한꺼번에 */}
              <span className="mt-1 flex items-center gap-2 text-xs sm:contents">
                <span className="truncate font-semibold sm:text-sm"><span className="font-normal text-muted sm:hidden">우승 </span>{r.winner?.name ?? "-"}</span>
                <span className="ml-auto shrink-0 text-muted sm:ml-0 sm:text-right sm:text-sm">{r.entrants}명</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
