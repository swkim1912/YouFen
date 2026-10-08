"use client";
// 랭킹(Pistelog 의 '선수' 탭 역할): 시즌 × 종류(종합/오픈/대회) × 풀(탭 · 종별 · 성별 · 종목)별 점수 순위.
// - 점수·티어는 DB(pool_scores)에 저장된 값을 읽는다. 계산식은 /methodology 와 docs/SCORING.md, 계산 함수는 private.refresh_scores().
// - 협회 선수 원장에 등록된 선수만 대상. 시즌(2년) 안에 같은 풀에서 대회 2회 이상 출전해 배치를 마친 선수만 순위가 매겨진다.
// - 오픈게임 점수는 아직 없어서 '종합' = '대회' 이고 '오픈'은 비어 있다. 회원 연동 후 오픈/종합 데이터를 이 화면에 붙인다.
// - 우측 상단에 1~3위 포디움, 행을 누르면 선수 프로필(/athletes/[id])로 이동.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleHelp, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FilterRow } from "@/components/FilterRow";
import { Podium, type PodiumEntry } from "@/components/Podium";
import { TierPill } from "@/components/TierBadge";
import { usePageTitle } from "@/lib/pageTitle";
import { supabase } from "@/lib/supabase";
import { isMergeable } from "@/lib/members";
import {
  AGES, GENDER_VALUES, MODES, TABS, WEAPON_VALUES, agesFor, ageLabel, fmtDay, genderLabel, publicData, rankColor, tierColor, weaponLabel,
  type Age, type GenderValue, type Mode, type PoolScore, type Season, type Tab, type WeaponValue,
} from "@/lib/fencing";

interface Row extends PoolScore {
  athlete: { id: number; name: string; club_id: number | null; linked_profile_id: string | null } | null;
}

/** 포디움 사진용 연결 회원 정보 (선수 페이지 헤더와 같은 규칙으로 사진을 고르기 위해 필요한 것만) */
interface PodiumMember { id: string; role: string | null; avatar_url: string | null; club_id: number | null; affiliation: string | null }

export default function RankingPage() {
  return (
    <AppShell>
      <Suspense>
        <Ranking />
      </Suspense>
    </AppShell>
  );
}

const pick = <T extends string>(v: string | null, list: readonly T[], dflt: T): T => (v && (list as readonly string[]).includes(v) ? (v as T) : dflt);

function Ranking() {
  const sp = useSearchParams();
  // 기본값: 종합 랭킹 / 동호인 / 일반부 / 남자 / 에페 / 현재 시즌 (동호인 일반부가 주 사용자층)
  const [mode, setMode] = useState<Mode>(pick(sp.get("mode"), MODES, "종합"));
  const [tab, setTab] = useState<Tab>(pick(sp.get("tab"), TABS, "동호인"));
  const [age, setAge] = useState<Age>(pick(sp.get("age"), AGES, "일반"));
  const [gender, setGender] = useState<GenderValue>(pick(sp.get("gender"), GENDER_VALUES, "남"));
  const [weapon, setWeapon] = useState<WeaponValue>(pick(sp.get("weapon"), WEAPON_VALUES, "에페"));
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonSel, setSeasonSel] = useState<string | null>(sp.get("season"));
  const [withUnplaced, setWithUnplaced] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);

  // 엘리트 탭은 일반부만 있다
  const curAge: Age = agesFor(tab).includes(age) ? age : "일반";

  // 시즌 목록: 최신이 위. 지정이 없으면 현재 시즌
  useEffect(() => {
    supabase.from("seasons").select("season,start_date,end_date,is_current").order("season", { ascending: false }).then(({ data }) => {
      setSeasons((data ?? []) as Season[]);
    });
  }, []);
  const season = seasonSel && seasons.some((s) => s.season === seasonSel) ? seasonSel : (seasons.find((s) => s.is_current) ?? seasons[0])?.season ?? null;

  // 필터를 URL 에 반영해 두면 프로필에서 돌아와도, 링크를 공유해도 같은 화면이 나온다
  useEffect(() => {
    const p = new URLSearchParams({ mode, tab, age: curAge, gender, weapon });
    if (season) p.set("season", season);
    window.history.replaceState(null, "", `/ranking?${p}`);
  }, [mode, tab, curAge, gender, weapon, season]);

  useEffect(() => {
    if (!season) return;
    setRows(null);
    // 오픈 랭킹: 오픈게임 데이터가 아직 없다 (회원 연동 후 구현)
    if (mode === "오픈") return setRows([]);
    let cancelled = false;
    (async () => {
      // 풀 하나의 순위표(배치 완료 → 순위 → 점수 순, 최대 1000명)를 DB 함수 data_ranking 으로 받는다
      const data = await publicData<Row[]>("data_ranking", { p_season: season, p_tab: tab, p_age: curAge, p_gender: gender, p_weapon: weapon, p_unplaced: withUnplaced }, []);
      if (!cancelled) setRows(data);
    })();
    return () => { cancelled = true; };
  }, [season, mode, tab, curAge, gender, weapon, withUnplaced]);

  const poolQuery = `tab=${encodeURIComponent(tab)}&age=${curAge}&gender=${gender}&weapon=${weapon}&season=${season ?? ""}`;
  const hrefOf = (id: number) => `/athletes/${id}?${poolQuery}`;

  const placed = useMemo(() => (rows ?? []).filter((r) => r.placed), [rows]);
  // 1~3위 중 유펜 회원과 연결된 선수는 그 회원의 사진 설정을 읽어 온다(학부모 계정은 합치지 않으므로 제외 — 선수 페이지와 같은 규칙)
  const topLinked = placed.slice(0, 3).map((r) => r.athlete?.linked_profile_id).filter((x): x is string => !!x).join(",");
  const [podMembers, setPodMembers] = useState<Record<string, PodiumMember>>({});
  useEffect(() => {
    if (!topLinked) return setPodMembers({});
    let live = true;
    supabase.from("profiles").select("id,role,avatar_url,club_id,affiliation").in("id", topLinked.split(",")).then(({ data }) => {
      if (!live) return;
      const m: Record<string, PodiumMember> = {};
      for (const p of (data ?? []) as PodiumMember[]) if (isMergeable(p)) m[p.id] = p;
      setPodMembers(m);
    });
    return () => { live = false; };
  }, [topLinked]);

  // 포디움 사진 = 선수 페이지(AthleteView) 헤더 사진과 같은 규칙:
  //   연결 회원 사진 설정 → (없으면) 소속 클럽 이미지(회원 클럽, 없으면 선수 클럽) → 소속팀 이름 첫 글자 → 선수 이름 첫 글자
  const podium: (PodiumEntry | undefined)[] = [0, 1, 2].map((i) => {
    const r = placed[i];
    if (!r?.athlete) return undefined;
    const mem = r.athlete.linked_profile_id ? podMembers[r.athlete.linked_profile_id] : undefined;
    return {
      athleteId: r.athlete_id, name: r.athlete.name, team: r.current_team, score: r.tour_score, tier: r.tier, href: hrefOf(r.athlete_id),
      avatar: { avatarUrl: mem?.avatar_url ?? null, clubId: mem?.club_id ?? r.athlete.club_id ?? null, affiliation: mem?.affiliation ?? r.current_team },
    };
  });

  // 브라우저 탭 제목도 지금 보고 있는 랭킹으로 (예: "동호인 일반부 남자 에페 랭킹 · 유펜 YouFen")
  usePageTitle(`${tab} ${ageLabel(curAge)} ${genderLabel(gender)} ${weaponLabel(weapon)} 랭킹`);

  const shown = useMemo(() => {
    const t = q.trim();
    return (rows ?? []).filter((r) => !t || r.athlete?.name.includes(t) || r.current_team?.includes(t));
  }, [rows, q]);

  return (
    <div className="space-y-5">
      {/* 상단: 제목·필터(좌) + 포디움(우) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-3">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold sm:text-3xl">
            {tab} {ageLabel(curAge)} {genderLabel(gender)} {weaponLabel(weapon)} 랭킹
            <Link href="/methodology" title="랭킹과 점수는 이렇게 계산됩니다" aria-label="점수 산정 방식 안내" className="-m-2 flex h-10 w-10 items-center justify-center rounded-md text-muted hover:text-brand">
              <CircleHelp size={22} />
            </Link>
          </h1>
          <div className="space-y-2">
            <FilterRow label="종류" options={MODES} value={mode} onChange={setMode} render={(m) => (m === "종합" ? "종합 랭킹" : m === "오픈" ? "오픈 랭킹" : "대회 랭킹")} />
            <FilterRow label="구분" options={TABS} value={tab} onChange={setTab} />
            <FilterRow label="종별" options={agesFor(tab)} value={curAge} onChange={setAge} render={ageLabel} />
            <FilterRow label="성별" options={GENDER_VALUES} value={gender} onChange={setGender} render={genderLabel} />
            <FilterRow label="종목" options={WEAPON_VALUES} value={weapon} onChange={setWeapon} render={weaponLabel} />
          </div>
        </div>
        <Podium top={podium} />
      </div>

      {/* 시즌 + 검색 + 배치 중 포함 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={season ?? ""}
          onChange={(e) => setSeasonSel(e.target.value)}
          aria-label="시즌"
          className="h-9 rounded-md border border-line bg-panel2 px-2 text-sm"
        >
          {seasons.map((s) => <option key={s.season} value={s.season}>{s.season} 시즌{s.is_current ? " (현재)" : ""}</option>)}
        </select>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="선수 이름 또는 소속 검색" placeholder="선수 이름 또는 소속 검색"
            className="h-9 w-full rounded-md border border-line bg-panel2 pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={withUnplaced} onChange={(e) => setWithUnplaced(e.target.checked)} />
          배치 중 선수 포함
        </label>
        <span className="ml-auto text-sm text-muted">
          순위 <b className="text-foreground">{placed.length.toLocaleString()}</b>명
        </span>
      </div>

      {/* 랭킹 표 */}
      {mode === "오픈" ? (
        <p className="py-16 text-center text-muted">아직 오픈게임 랭킹 데이터가 없습니다. 유펜 회원의 오픈게임 기록이 쌓이면 표시됩니다.</p>
      ) : rows === null ? (
        <p className="py-16 text-center text-muted">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-muted">표시할 선수가 없습니다</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="grid grid-cols-[1.75rem_1fr_3.75rem_2.5rem] items-center gap-2 border-b border-line bg-panel2 px-3 py-2 text-xs text-muted sm:grid-cols-[3rem_1fr_1fr_6rem_9rem_4rem_6rem]">
            <span>순위</span><span>이름</span><span className="hidden sm:block">소속</span><span>티어</span><span className="text-right sm:text-left">점수</span>
            <span className="hidden text-right sm:block" title="이 시즌(2년) 안에 실제로 참가한 대회 수">대회 수</span><span className="hidden text-right sm:block">최근 대회</span>
          </div>
          {shown.map((r) =>
            r.athlete ? (
              <Link
                key={r.athlete_id}
                href={hrefOf(r.athlete_id)}
                className="grid grid-cols-[1.75rem_1fr_3.75rem_2.5rem] items-center gap-2 border-b border-line px-3 py-2.5 text-sm last:border-0 hover:bg-white/5 sm:grid-cols-[3rem_1fr_1fr_6rem_9rem_4rem_6rem]"
              >
                <span className="font-bold" style={{ color: rankColor(r.pool_rank) }}>{r.pool_rank ?? "-"}</span>
                <span className="truncate font-medium">{r.athlete.name}</span>
                <span className="hidden truncate text-xs text-muted sm:block">{r.current_team ?? "-"}</span>
                <TierPill tier={r.tier} />
                <span className="flex items-center justify-end gap-2 sm:justify-start">
                  <span className="w-10 text-right font-semibold">{r.tour_score}</span>
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded bg-line sm:block">
                    <span className="block h-full rounded" style={{ width: `${Math.min(100, r.tour_score / 10)}%`, backgroundColor: tierColor(r.tier) }} />
                  </span>
                </span>
                <span className="hidden text-right text-xs text-muted sm:block">{r.n_events}회</span>
                <span className="hidden text-right text-xs text-muted sm:block">{fmtDay(r.last_date)}</span>
              </Link>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
