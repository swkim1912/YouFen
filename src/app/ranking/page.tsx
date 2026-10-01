"use client";
// 랭킹: 부서(엘리트/전문선수/동호인) × 종합/오픈/대회 필터, 상위 3명 포디움, 최근 대회 우승자, 전체 리스트
// 확정된(ACCEPTED) 오픈/대회 기록 전체를 가져와 클라이언트에서 점수를 계산한다.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { SELECT_RECORDS, toView } from "@/lib/records";
import { calcTier, type TierMode } from "@/lib/tier";
import type { GameRecord, Profile } from "@/lib/types";
import { cn, PUBLIC_COLS } from "@/lib/utils";

// 동호인부가 주 사용자층이므로 가장 앞에 두고 기본 선택으로 한다
const GROUPS = ["동호인", "엘리트", "전문선수"] as const;
const DIVISION_LIST = ["전체", "초등부", "중등부", "고등부", "대학부", "일반부"] as const;
const GENDERS = ["남", "여"] as const;
const WEAPON_LIST = ["에페", "플뢰레", "사브르"] as const;

export default function RankingPage() {
  return (
    <AppShell>
      <Ranking />
    </AppShell>
  );
}

function Ranking() {
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("동호인")
  const [division, setDivision] = useState<(typeof DIVISION_LIST)[number]>("전체");
  const [gender, setGender] = useState<(typeof GENDERS)[number]>("남");
  const [weapon, setWeapon] = useState<(typeof WEAPON_LIST)[number]>("에페");;
  const [mode, setMode] = useState<TierMode>("ALL");
  const [year, setYear] = useState<string>("전체");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select(PUBLIC_COLS).not("nickname", "is", null),
        supabase.from("game_records").select(SELECT_RECORDS).eq("status", "ACCEPTED").limit(5000),
      ]);
      setProfiles((p.data ?? []) as Profile[]);
      setRecords((r.data ?? []) as unknown as GameRecord[]);
      setLoading(false);
    })();
  }, []);

  const years = useMemo(
    () => ["전체", ...[...new Set(records.map((r) => String(new Date(r.played_at).getFullYear())))].sort().reverse()],
    [records]
  );

  const rows = useMemo(() => {
    const recs = year === "전체" ? records : records.filter((r) => String(new Date(r.played_at).getFullYear()) === year);
    return profiles
      .filter((p) => p.role === group && p.gender === gender && p.weapon === weapon && (division === "전체" || p.division === division) && !p.hide_records) // 전적 비공개 유저는 랭킹에서 제외
      .map((p) => {
        const views = recs.filter((r) => r.creator_id === p.id || r.opponent_id === p.id).map((r) => toView(r, p.id));
        const t = calcTier(views, mode);
        return { p, t, games: views.length, wins: views.filter((v) => v.win).length };
      })
      .filter((x) => x.games > 0)
      .sort((a, b) => b.t.points - a.t.points || b.wins - a.wins);
  }, [profiles, records, group, gender, weapon, division, mode, year]);

  // 해당 부서의 가장 최근 대회 + 우승자(대회 내 승수 최다)
  const lastTour = useMemo(() => {
    const ids = new Set(profiles.filter((p) => p.role === group && p.gender === gender && p.weapon === weapon && (division === "전체" || p.division === division)).map((p) => p.id));
    const tours = records.filter((r) => r.kind === "TOURNAMENT" && ids.has(r.creator_id));
    if (!tours.length) return null;
    tours.sort((a, b) => b.played_at.localeCompare(a.played_at));
    const name = tours[0].tournament_name;
    const wins = new Map<string, number>();
    for (const r of tours.filter((t) => t.tournament_name === name)) {
      const w = r.my_score > r.opp_score ? r.creator_id : r.opponent_id;
      if (w) wins.set(w, (wins.get(w) ?? 0) + 1);
    }
    const top = [...wins.entries()].sort((a, b) => b[1] - a[1])[0];
    return { name, winner: profiles.find((p) => p.id === top?.[0])?.nickname };
  }, [records, profiles, group, gender, weapon, division]);

  const podium = [rows[1], rows[0], rows[2]]; // 2위-1위-3위 순서로 배치
  const heights = ["h-24", "h-32", "h-20"];
  const places = [2, 1, 3];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={cn("rounded px-3 py-1.5 text-sm", group === g ? "bg-brand text-white" : "bg-panel text-muted")}>
            {g}부
          </button>
        ))}
        <span className="mx-2 text-line">|</span>
        {([["ALL", "종합"], ["OPEN", "오픈게임"], ["TOURNAMENT", "대회"]] as const).map(([m, l]) => (
          <button key={m} onClick={() => setMode(m)} className={cn("rounded px-3 py-1.5 text-sm", mode === m ? "bg-brand text-white" : "bg-panel text-muted")}>
            {l}
          </button>
        ))}
        <span className="mx-2 text-line">|</span>
        {GENDERS.map((g) => (
          <button key={g} onClick={() => setGender(g)} className={cn("rounded px-3 py-1.5 text-sm", gender === g ? "bg-brand text-white" : "bg-panel text-muted")}>
            {g}자
          </button>
        ))}
        <span className="mx-2 text-line">|</span>
        {WEAPON_LIST.map((w) => (
          <button key={w} onClick={() => setWeapon(w)} className={cn("rounded px-3 py-1.5 text-sm", weapon === w ? "bg-brand text-white" : "bg-panel text-muted")}>
            {w}
          </button>
        ))}
        <span className="mx-2 text-line">|</span>
        <select value={division} onChange={(e) => setDivision(e.target.value as (typeof DIVISION_LIST)[number])} className="h-9 rounded-md border border-line bg-panel2 px-2 text-sm" aria-label="종별">
          {DIVISION_LIST.map((d) => <option key={d} value={d}>{d === "전체" ? "종별 전체" : d}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="ml-auto h-9 rounded-md border border-line bg-panel2 px-2 text-sm">
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-center text-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-muted">아직 랭킹 데이터가 없습니다</p>
      ) : (
        <>
          {/* 포디움 */}
          <div className="flex items-end justify-center gap-3 rounded-lg border border-line bg-panel px-4 pt-6">
            {podium.map((r, i) =>
              r ? (
                <Link key={r.p.id} href={`/search?q=${encodeURIComponent(r.p.nickname!)}`} className="flex w-28 flex-col items-center">
                  <span className="mb-1 text-sm font-bold">{r.p.nickname}</span>
                  <span className="mb-1 text-xs text-muted">{r.t.points}점</span>
                  <div className={cn("flex w-full items-start justify-center rounded-t-md bg-brand/30 pt-2 text-2xl font-extrabold", heights[i])}>{places[i]}</div>
                </Link>
              ) : (
                <div key={i} className="w-28" />
              )
            )}
          </div>

          {/* 최근 대회 */}
          <div className="rounded-lg border border-line bg-panel p-3 text-sm">
            <span className="text-muted">최근 대회: </span>
            {lastTour ? <>{lastTour.name} · 우승 <b>{lastTour.winner ?? "-"}</b></> : <span className="text-muted">등록된 대회가 없습니다</span>}
          </div>

          {/* 전체 리스트 */}
          <div className="overflow-hidden rounded-lg border border-line bg-panel">
            {rows.map((r, i) => (
              <Link key={r.p.id} href={`/search?q=${encodeURIComponent(r.p.nickname!)}`} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0 hover:bg-white/5">
                <span className="w-8 font-bold">{i + 1}</span>
                <span className="flex-1">{r.p.nickname} <span className="text-xs text-muted">{r.p.affiliation}</span></span>
                <span className="text-xs" style={{ color: r.t.tier?.color }}>{r.t.tier?.name ?? "배치 중"}</span>
                <span className="w-16 text-right font-semibold">{r.t.points}</span>
                <span className="w-24 text-right text-xs text-muted">{r.wins}승 {r.games - r.wins}패</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
