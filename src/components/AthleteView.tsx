"use client";
// 선수 프로필: 랭킹에서 선수를 눌렀을 때 / 대회 결과에서 이름을 눌렀을 때 / 검색에서 선수를 골랐을 때 보이는 화면.
// 유저 전적검색(ProfileView)과 같은 구성(내 정보 → 티어 → 최근 추이 → 전적)으로 맞췄고, 대회 선수라서 '대회 기록'과 '점수 추이'가 더해진다.
// 유펜 회원과 선수가 연동되면(본인인증, 추후 구현) 종합/오픈 탭과 오픈게임 전적도 이 화면에서 함께 보여줄 예정이다.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, CircleHelp, Settings } from "lucide-react";
import { StatDonut } from "./StatDonut";
import { TierCircle } from "./TierBadge";
import { TierFrame } from "./TierFrame";
import { Avatar } from "./Avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dot } from "./ui/dot";
import { MemberRecords } from "./MemberRecords";
import { GameDetailModal } from "./GameDetailModal";
import { SettingsModal } from "./SettingsModal";
import { useAuth } from "./AuthProvider";
import { isMergeable, type FeedRow } from "@/lib/members";
import { fetchUserRecords, type RecordView } from "@/lib/records";
import type { FeedbackNote, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  fmtDay, genderLabel, publicData, poolLabel, rankColor, roundLabel, tierColor, weaponLabel, ageLabel,
  type AthleteRow, type EventMeta, type MatchRow, type PoolKey, type PoolScore,
} from "@/lib/fencing";
import { cn, fmtDate } from "@/lib/utils";
import { usePageTitle } from "@/lib/pageTitle";

interface EntryRow {
  event_id: string;
  team_name: string | null;
  poule_rank: number | null;
  final_rank: number | null;
  poule_no: number | null;
  event: EventMeta;
}
interface EventScore { event_id: string; score: number | null; steps: number | null; total_steps: number | null }

/** 한 경기를 이 선수 기준으로 본 모양 */
interface MView {
  m: MatchRow;
  ev: EventMeta;
  oppId: number;
  mine: number | null;
  theirs: number | null;
  win: boolean;
  date: string;
  label: string;
}

// 같은 날짜 안에서 뿔 → 예선 ED → 본선 ED(큰 라운드 먼저) 순서
const stageOrder = (m: MatchRow) => (m.stage === "POULE" ? 0 : m.stage === "EDQ" ? 1 : 2) * 1000 + (m.third_place ? -1 : 0) + (1000 - (m.round_size ?? 0)) / 1000;

const KIND_LABEL = { PRIVATE: "프라이빗", OPEN: "오픈", TOURNAMENT: "대회" } as const;

/** own: 마이 펜싱 탭에서 본인의 연결 선수로 이 화면을 쓸 때 넘긴다(설정 버튼·전적 수정·피드백 노트가 추가됨) */
export function AthleteView({ athleteId, initialPool, initialSeason, own }: { athleteId: number; initialPool?: Partial<PoolKey>; initialSeason?: string; own?: Profile }) {
  const [athlete, setAthlete] = useState<AthleteRow | null | undefined>(undefined); // undefined=로딩, null=없음
  const [pools, setPools] = useState<PoolScore[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [scores, setScores] = useState<Map<string, EventScore>>(new Map());
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [opp, setOpp] = useState<Map<number, { name: string; club: string | null; reg: boolean }>>(new Map());
  const [sel, setSel] = useState<string | null>(null); // 선택한 종목 키 "weapon|gender"
  const [open, setOpen] = useState<Set<string>>(new Set()); // 경기 펼친 대회(event id)
  const [shownEntries, setShownEntries] = useState(10);
  const [filter, setFilter] = useState<"ALL" | "POULE" | "ED">("ALL");
  usePageTitle(own ? null : athlete?.name); // 선수 페이지 탭 제목 = 선수 이름 (마이 펜싱에서 쓸 때는 그대로)
  const [oppQ, setOppQ] = useState("");
  const { user } = useAuth();
  // 연결된 유펜 회원(학부모 제외): 선수 페이지에 닉네임·회원 전적을 합쳐 보여준다
  const [member, setMember] = useState<{ id: string; nickname: string; role: string | null; avatar_url: string | null; club_id: number | null; affiliation: string | null; hide_records: boolean } | null>(null);
  const [tierMode, setTierMode] = useState<"대회" | "종합" | "오픈">("종합") // 기본은 종합 점수;
  const [memberRecs, setMemberRecs] = useState<RecordView[] | null>(null); // 연결 회원의 전적 (null = 불러오는 중)
  const [notes, setNotes] = useState<(FeedbackNote & { game?: RecordView })[]>([]);
  const [detail, setDetail] = useState<RecordView | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [shown, setShown] = useState(10);

  // 연결된 회원 조회 (합칠 수 있는 회원만 member 로 둔다)
  const linkedId = athlete?.linked_profile_id ?? null;
  useEffect(() => {
    setMember(null);
    setTierMode("종합");
    if (!linkedId) return;
    let live = true;
    supabase.from("profiles").select("id,nickname,role,avatar_url,club_id,affiliation,hide_records").eq("id", linkedId).maybeSingle().then(({ data }) => {
      if (live && data && isMergeable(data as { role: string | null })) setMember(data as NonNullable<typeof member>);
    });
    return () => { live = false; };
  }, [linkedId]);

  // 연결 회원의 전적(오픈·대회·프라이빗). 전적 비공개 회원은 본인 외에는 불러오지 않는다.
  const viewerIsMember = !!member && member.id === user?.id;
  const memberHidden = !!member && member.hide_records && !viewerIsMember;
  const loadMemberRecs = useCallback(async () => {
    if (!member || memberHidden) return setMemberRecs([]);
    try {
      const recs = await fetchUserRecords(member.id, viewerIsMember); // 본인은 수락 대기 건도 보임
      setMemberRecs(recs);
      if (own && user) {
        const { data } = await supabase.from("feedback_notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
        const byId = new Map(recs.map((r) => [r.rec.id, r]));
        setNotes(((data ?? []) as FeedbackNote[]).map((n) => ({ ...n, game: n.game_id ? byId.get(n.game_id) : undefined })));
      }
    } catch {
      setMemberRecs([]);
    }
  }, [member, memberHidden, viewerIsMember, own, user]);
  useEffect(() => {
    setMemberRecs(null);
    loadMemberRecs();
  }, [loadMemberRecs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAthlete(undefined);
      // 선수 + 풀 점수 + 출전 기록 + 대회 점수 + 경기 + 상대 선수 정보를 한 번에 (DB 함수 data_athlete)
      const r = await publicData<{
        athlete: AthleteRow | null; pools?: PoolScore[]; entries?: EntryRow[]; scores?: EventScore[]; matches?: MatchRow[];
        opps?: { id: number; name: string; is_registered: boolean; club: { name: string } | null }[];
      } | null>("data_athlete", { p_id: athleteId }, null);
      if (cancelled) return;
      if (!r?.athlete) return setAthlete(null);
      const oppMap = new Map<number, { name: string; club: string | null; reg: boolean }>();
      for (const o of r.opps ?? []) oppMap.set(o.id, { name: o.name, club: o.club?.name ?? null, reg: o.is_registered });
      setAthlete(r.athlete);
      setPools(r.pools ?? []);
      setEntries(r.entries ?? []);
      setScores(new Map((r.scores ?? []).map((s) => [s.event_id, s])));
      setMatches(r.matches ?? []);
      setOpp(oppMap);
    })();
    return () => { cancelled = true; };
  }, [athleteId]);

  // 종목(무기·성별) 목록: 출전 기록이 있는 종목. 가장 최근에 나간 종목을 기본으로, 링크로 지정하면 그 종목.
  const events = useMemo(() => {
    const m = new Map<string, { key: string; weapon: string; gender: string; last: string; n: number }>();
    for (const e of entries) {
      const ev = e.event;
      if (!ev?.weapon || !ev.gender) continue;
      const key = `${ev.weapon}|${ev.gender}`;
      const cur = m.get(key) ?? { key, weapon: ev.weapon, gender: ev.gender, last: "", n: 0 };
      cur.n += 1;
      if ((ev.start_date ?? "") > cur.last) cur.last = ev.start_date ?? "";
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.last.localeCompare(a.last));
  }, [entries]);

  const curKey = sel ?? (initialPool?.weapon && initialPool.gender && events.some((e) => e.key === `${initialPool.weapon}|${initialPool.gender}`) ? `${initialPool.weapon}|${initialPool.gender}` : events[0]?.key);
  const [weapon, gender] = (curKey ?? "|").split("|");

  // 시즌: 링크로 지정한 시즌 > 가장 최근 시즌. (시즌 = 2년 창, 예: 2025-26)
  const seasonList = useMemo(() => [...new Set(pools.map((p) => p.season))].sort().reverse(), [pools]);
  const [seasonSel, setSeasonSel] = useState<string | null>(initialSeason ?? null);
  const curSeason = seasonSel && seasonList.includes(seasonSel) ? seasonSel : seasonList[0];

  // 선택한 종목·시즌에 해당하는 풀 점수: 링크로 받은 풀 > 가장 최근 풀
  const poolsHere = useMemo(
    () => pools.filter((p) => p.weapon === weapon && p.gender === gender && p.season === curSeason).sort((a, b) => (b.last_date ?? "").localeCompare(a.last_date ?? "")),
    [pools, weapon, gender, curSeason]
  );
  const pool = poolsHere.find((p) => p.tab === initialPool?.tab && p.age === initialPool?.age) ?? poolsHere[0];
  const [poolSel, setPoolSel] = useState<string | null>(null);
  const curPool = poolsHere.find((p) => `${p.tab}|${p.age}` === poolSel) ?? pool;
  // 같은 풀의 시즌별 성적
  const seasonRows = useMemo(
    () => (curPool ? pools.filter((p) => p.tab === curPool.tab && p.age === curPool.age && p.weapon === weapon && p.gender === gender).sort((a, b) => b.season.localeCompare(a.season)) : []),
    [pools, curPool, weapon, gender]
  );

  const myEntries = useMemo(
    () => entries.filter((e) => e.event?.weapon === weapon && e.event?.gender === gender).sort((a, b) => (b.event.start_date ?? "").localeCompare(a.event.start_date ?? "")),
    [entries, weapon, gender]
  );
  const evById = useMemo(() => new Map(entries.map((e) => [e.event_id, e.event])), [entries]);

  // 이 선수 기준 경기 목록 (선택한 종목만, 최근 순)
  const views: MView[] = useMemo(() => {
    const out: MView[] = [];
    for (const m of matches) {
      const ev = evById.get(m.event_id);
      if (!ev || ev.weapon !== weapon || ev.gender !== gender) continue;
      const isA = m.a_athlete === athleteId;
      out.push({
        m, ev,
        oppId: isA ? m.b_athlete : m.a_athlete,
        mine: isA ? m.a_score : m.b_score,
        theirs: isA ? m.b_score : m.a_score,
        win: m.winner === athleteId,
        date: ev.start_date ?? "",
        label: roundLabel(m.stage, m.round_size, m.third_place),
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.ev.id.localeCompare(a.ev.id) || stageOrder(b.m) - stageOrder(a.m));
  }, [matches, evById, weapon, gender, athleteId]);

  // 합계: 전체 / 뿔 / ED (점수 없는 기권승은 승패만 센다)
  const tally = (list: MView[]) => ({
    wins: list.filter((v) => v.win).length,
    losses: list.filter((v) => !v.win).length,
    gf: list.reduce((a, v) => a + (v.mine ?? 0), 0),
    ga: list.reduce((a, v) => a + (v.theirs ?? 0), 0),
  });
  const all = tally(views), poule = tally(views.filter((v) => v.m.stage === "POULE")), ed = tally(views.filter((v) => v.m.stage !== "POULE"));
  // 통합 전적: 협회 대회 경기 + (연결 회원이면) 회원 전적을 날짜순으로 합친다
  const feed: FeedRow[] = useMemo(() => {
    if (!member) return [];
    const rows: FeedRow[] = views.map((v) => ({
      key: `m${v.m.id}`, win: v.win, oppName: opp.get(v.oppId)?.name ?? "-", oppIsMember: false, mine: v.mine, theirs: v.theirs,
      kind: "TOURNAMENT", kindLabel: `대회 · ${v.label}`, date: v.date, dateText: fmtDay(v.date), pending: false, official: true,
    }));
    for (const r of memberRecs ?? []) {
      rows.push({
        key: `g${r.rec.id}`, win: r.win, oppName: r.oppName, oppIsMember: !!r.oppId, mine: r.mine, theirs: r.theirs,
        kind: r.rec.kind, kindLabel: KIND_LABEL[r.rec.kind], date: r.rec.played_at, dateText: fmtDate(r.rec.played_at),
        pending: r.rec.status === "PENDING", official: false, rec: r,
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [member, views, opp, memberRecs]);

  // 최근 추이용 행: 통합(회원)이면 통합 전적의 최근 30경기, 아니면 협회 대회 경기 30경기
  const recentRows: { win: boolean; mine: number | null; theirs: number | null; key: string; name: string; href?: string }[] = useMemo(() => {
    if (member) {
      return feed.filter((r) => !r.pending).slice(0, 30).map((r) => ({ win: r.win, mine: r.mine, theirs: r.theirs, key: `n:${r.oppName}`, name: r.oppName }));
    }
    return views.slice(0, 30).map((v) => ({ win: v.win, mine: v.mine, theirs: v.theirs, key: `a${v.oppId}`, name: opp.get(v.oppId)?.name ?? "-", href: `/athletes/${v.oppId}?weapon=${weapon}&gender=${gender}` }));
  }, [member, feed, views, opp, weapon, gender]);
  const recentTally = {
    wins: recentRows.filter((r) => r.win).length,
    losses: recentRows.filter((r) => !r.win).length,
    gf: recentRows.reduce((a, r) => a + (r.mine ?? 0), 0),
    ga: recentRows.reduce((a, r) => a + (r.theirs ?? 0), 0),
  };

  // 최근 30경기 상대별 승률 (2경기 이상)
  const { best, worst } = useMemo(() => {
    const g = new Map<string, { n: number; w: number; name: string; href?: string }>();
    for (const r of recentRows) {
      const c = g.get(r.key) ?? { n: 0, w: 0, name: r.name, href: r.href };
      c.n += 1; if (r.win) c.w += 1;
      g.set(r.key, c);
    }
    const list = [...g.entries()].filter(([, c]) => c.n >= 2).map(([id, c]) => ({ id, name: c.name, href: c.href, n: c.n, rate: Math.round((c.w / c.n) * 100) }));
    // 상대가 적으면 같은 사람이 양쪽 목록에 나오므로, 낮은 쪽 목록에서는 높은 쪽에 이미 나온 상대를 뺀다
    const best = [...list].sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, 3);
    const used = new Set(best.map((o) => o.id));
    const worst = [...list].filter((o) => !used.has(o.id)).sort((a, b) => a.rate - b.rate || b.n - a.n).slice(0, 3);
    return { best, worst };
  }, [recentRows]);

  // 소속 이력: 연속으로 같은 소속이면 한 줄로 묶는다 (오래된 순)
  const history = useMemo(() => {
    const sorted = [...entries].filter((e) => e.team_name && e.event?.start_date).sort((a, b) => (a.event.start_date! > b.event.start_date! ? 1 : -1));
    const out: { team: string; from: string; to: string; n: number }[] = [];
    for (const e of sorted) {
      const last = out[out.length - 1];
      if (last && last.team === e.team_name) { last.to = e.event.start_date!; last.n += 1; }
      else out.push({ team: e.team_name!, from: e.event.start_date!, to: e.event.start_date!, n: 1 });
    }
    return out;
  }, [entries]);

  // 점수 추이 (선택한 종목, 오래된 → 최근)
  const trend = useMemo(
    () => [...myEntries].reverse().map((e) => ({ date: e.event.start_date ?? "", score: scores.get(e.event_id)?.score ?? null })).filter((p) => p.score !== null) as { date: string; score: number }[],
    [myEntries, scores]
  );

  const list = views
    .filter((v) => (filter === "ALL" ? true : filter === "POULE" ? v.m.stage === "POULE" : v.m.stage !== "POULE"))
    .filter((v) => (oppQ.trim() ? (opp.get(v.oppId)?.name ?? "").includes(oppQ.trim()) : true));

  if (athlete === undefined) return <p className="py-16 text-center text-muted">불러오는 중…</p>;
  if (athlete === null) return <p className="py-16 text-center text-muted">선수를 찾을 수 없습니다</p>;

  const teamNow = history[history.length - 1]?.team ?? athlete.club?.name ?? null;
  const linkQ = `weapon=${weapon}&gender=${gender}`;
  const best100 = myEntries.reduce((a, e) => Math.max(a, scores.get(e.event_id)?.score ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* 내 정보 */}
      <TierFrame tier={curPool?.tier} contentClassName="flex flex-col items-center gap-3 text-center sm:flex-row sm:flex-wrap sm:gap-4 sm:text-left">
        <Avatar avatarUrl={member?.avatar_url ?? null} clubId={member?.club_id ?? athlete.club_id ?? null} affiliation={member?.affiliation ?? teamNow} nickname={athlete.name} size={80} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-center gap-2 text-xl font-bold sm:justify-start">
            <Dot member={!!member} />
            {athlete.name}
            {member && <span className="text-base font-semibold text-muted">({member.nickname})</span>}
            <span className="rounded bg-brand/20 px-1.5 py-0.5 text-xs font-normal text-brand">{member ? "선수 · 회원" : "선수"}</span>
          </div>
          <div className="text-sm text-muted">
            {genderLabel(gender)} {weaponLabel(weapon)}
            {curPool && <> · {poolLabel(curPool).split(" ").slice(0, 2).join(" ")}</>}
          </div>
          <div className="text-sm text-muted">{teamNow ?? "소속 정보 없음"}</div>
        </div>
        {curPool?.pool_rank && (
          <div className="sm:text-right">
            <div className="text-xs text-muted">{poolLabel(curPool)} 순위</div>
            <div className="text-3xl font-extrabold" style={{ color: rankColor(curPool.pool_rank) }}>{curPool.pool_rank}<span className="text-sm font-normal text-muted"> / {curPool.pool_size}</span></div>
          </div>
        )}
        {own && (
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} aria-label="상세 설정">
            <Settings size={16} />
          </Button>
        )}
      </TierFrame>

      {/* 종목 선택 (여러 종목에 출전한 선수) */}
      {events.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {events.map((e) => (
            <button aria-pressed={e.key === curKey} key={e.key} onClick={() => { setSel(e.key); setPoolSel(null); setShown(10); setShownEntries(10); }}
              className={cn("min-h-10 rounded px-3 py-1.5 text-sm md:min-h-0", e.key === curKey ? "bg-brand font-semibold text-brand-ink" : "bg-panel text-muted hover:text-foreground")}>
              {genderLabel(e.gender)} {weaponLabel(e.weapon)} <span className="text-xs opacity-70">{e.n}회</span>
            </button>
          ))}
        </div>
      )}

      {/* 티어: 유펜 회원과 연동되면 종합/오픈 탭이 열린다 */}
      <section className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {(["종합", "오픈", "대회"] as const).map((l) => {
            const enabled = l !== "오픈" || !!member; // 오픈은 유펜 회원과 연결된 선수만 (종합은 오픈 집계 전까지 대회 점수와 같음)
            return (
              <button aria-pressed={tierMode === l} key={l} disabled={!enabled} onClick={() => setTierMode(l)} title={enabled ? undefined : "유펜 회원과 연결된 선수만 볼 수 있습니다"}
                className={cn("rounded px-3 py-1 text-sm", tierMode === l ? "bg-brand font-semibold text-brand-ink" : enabled ? "text-muted hover:bg-white/5" : "cursor-not-allowed text-muted/50")}>{l}</button>
            );
          })}
          <Link href="/methodology" title="점수와 티어는 이렇게 계산됩니다" aria-label="점수 산정 방식 안내" className="-my-2 ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-brand"><CircleHelp size={16} /></Link>
          {seasonList.length > 1 && (
            <select value={curSeason} onChange={(e) => setSeasonSel(e.target.value)} className="ml-auto h-8 rounded-md border border-line bg-panel2 px-2 text-xs" aria-label="시즌">
              {seasonList.map((x) => <option key={x} value={x}>{x} 시즌</option>)}
            </select>
          )}
          {poolsHere.length > 1 && (
            <select value={`${curPool?.tab}|${curPool?.age}`} onChange={(e) => setPoolSel(e.target.value)} className="h-8 rounded-md border border-line bg-panel2 px-2 text-xs">
              {poolsHere.map((p) => <option key={`${p.tab}|${p.age}`} value={`${p.tab}|${p.age}`}>{p.tab} {ageLabel(p.age)}</option>)}
            </select>
          )}
        </div>
        {tierMode === "오픈" ? (
          <p className="py-2 text-sm text-muted">오픈게임 점수는 아직 집계 전이에요. 오픈게임 기록이 쌓이면 이곳에 표시됩니다. (아래 최근 전적에서 오픈게임 기록을 볼 수 있어요)</p>
        ) : !athlete.is_registered ? (
          <div className="flex items-center gap-4">
            <TierCircle tier={null} />
            <div>
              <div className="text-lg font-bold">랭킹 제외</div>
              <div className="text-xs text-muted">협회 선수 원장에 등록되지 않은 선수라 점수·티어는 산정하지 않습니다. 대회 기록은 아래에서 볼 수 있습니다.</div>
            </div>
          </div>
        ) : !curPool ? (
          <p className="text-sm text-muted">이 종목의 점수 정보가 없습니다</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-4">
              <TierCircle tier={curPool.tier} />
              <div>
                <div className="text-lg font-bold">{curPool.tier ?? "배치 중"}</div>
                <div className="text-sm text-muted">{curPool.tour_score} 점</div>
                {!curPool.placed && <div className="text-xs text-muted">배치고사: 이 시즌 대회 {curPool.n_events}/2회 (2회 출전하면 티어 부여)</div>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-6 text-sm">
              <Stat label="시즌 참가 대회" value={`${curPool.n_events}회`} />
              <Stat label="유효 대회 수" value={Number(curPool.n_eff).toFixed(2)} />
              <Stat label="최고 대회 점수" value={`${Math.round(curPool.best_score ?? best100)}`} />
            </div>
          </div>
        )}
      </section>

      {tierMode === "종합" && <p className="-mt-2 text-xs text-muted">종합 점수는 오픈게임 기록이 집계되기 전까지 대회 점수와 같습니다.</p>}

      {/* 최근 추이 */}
      <section className="rounded-lg border border-line bg-panel p-4">
        <h3 className="mb-2 font-bold">최근 추이 <span className="text-xs font-normal text-muted">(최근 {recentRows.length}경기)</span></h3>
        {recentRows.length === 0 ? (
          <p className="text-sm text-muted">아직 경기 기록이 없습니다</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatDonut {...recentTally} />
            {([["승률 높은 상대", best], ["승률 낮은 상대", worst]] as const).map(([title, arr]) => (
              <div key={title}>
                <div className="mb-1 text-xs text-muted">{title} (2경기 이상)</div>
                {arr.length === 0 && <div className="text-sm text-muted">-</div>}
                {arr.map((o) => (
                  <div key={o.id} className="flex justify-between text-sm">
                    {o.href ? <Link href={o.href} className="hover:text-brand">{o.name}</Link> : <span>{o.name}</span>}
                    <span>{o.rate}% <span className="text-muted">({o.n})</span></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {views.length > 0 && (
          <div className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
            <RateBar label="전체 승률" t={all} />
            <RateBar label="뿔 승률" t={poule} />
            <RateBar label="ED 승률" t={ed} />
          </div>
        )}
      </section>

      {/* 점수 추이 */}
      {trend.length >= 2 && (
        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="mb-2 font-bold">대회 점수 추이</h3>
          <TrendChart points={trend} />
        </section>
      )}

      {/* 시즌별 성적 */}
      {seasonRows.length > 0 && curPool && (
        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="mb-2 font-bold">시즌별 성적 <span className="text-xs font-normal text-muted">{curPool.tab} {ageLabel(curPool.age)}</span></h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-1.5 text-left font-normal">시즌</th><th className="text-right font-normal">점수</th>
                <th className="text-right font-normal">순위</th><th className="text-right font-normal">티어</th><th className="text-right font-normal">대회</th>
              </tr>
            </thead>
            <tbody>
              {seasonRows.map((r) => (
                <tr key={r.season} className={cn("border-b border-line/60 last:border-0", r.season === curSeason && "bg-white/5")}>
                  <td className="py-1.5">{r.season}</td>
                  <td className="text-right font-semibold">{r.tour_score}</td>
                  <td className="text-right" style={{ color: rankColor(r.pool_rank) }}>{r.pool_rank ? `${r.pool_rank}위 / ${r.pool_size}` : "배치 중"}</td>
                  <td className="text-right" style={{ color: tierColor(r.tier) }}>{r.tier ?? "-"}</td>
                  <td className="text-right text-muted">{r.n_events}회</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* 소속 이력 */}
      {history.length > 0 && (
        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="mb-2 font-bold">소속 이력</h3>
          <ol className="space-y-1 text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-medium">{h.team}</span>
                <span className="text-xs text-muted">{fmtDay(h.from)}{h.to !== h.from && ` – ${fmtDay(h.to)}`} · {h.n}개 대회</span>
                {i === history.length - 1 && <span className="rounded bg-brand/20 px-1.5 text-xs text-brand">현재</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 연결된 유펜 회원의 최근 전적 (종합/오픈/대회) */}
      {member && <MemberRecords rows={feed} nickname={member.nickname} isMe={viewerIsMember} hidden={memberHidden} loading={memberRecs === null} onSelect={own ? (r) => r.rec && setDetail(r.rec) : undefined} />}

      {/* 대회 기록 */}
      <section className="rounded-lg border border-line bg-panel p-4">
        <h3 className="mb-3 font-bold">대회 기록 <span className="text-xs font-normal text-muted">{myEntries.length}개</span></h3>
        {myEntries.length === 0 && <p className="py-4 text-center text-sm text-muted">대회 기록이 없습니다</p>}
        <div className="space-y-1.5">
          {myEntries.slice(0, shownEntries).map((e) => {
            const sc = scores.get(e.event_id);
            const isOpen = open.has(e.event_id);
            const evViews = views.filter((v) => v.m.event_id === e.event_id).sort((a, b) => stageOrder(a.m) - stageOrder(b.m));
            const w = evViews.filter((v) => v.win).length;
            return (
              <div key={e.event_id} className="rounded-md bg-panel2">
                {/* 넓은 화면: 한 줄(날짜·대회명·순위·점수·경기) / 좁은 화면: 대회명 줄 + 순위·점수 줄 */}
                <div className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                  <span className="hidden w-20 shrink-0 text-xs text-muted sm:block">{fmtDay(e.event.start_date)}</span>
                  <span className="min-w-0 sm:flex-1">
                    <Link href={`/competitions/${e.event.competition.id}?event=${e.event_id}`} className="break-keep font-medium hover:text-brand">{e.event.competition.name}</Link>
                    <span className="ml-2 text-xs text-muted">{e.event.division ?? "오픈"} · {e.event.entrants}명<span className="sm:hidden"> · {fmtDay(e.event.start_date)}</span></span>
                    <span className="block truncate text-xs text-muted">{e.team_name}</span>
                  </span>
                  <span className="flex items-center gap-3 sm:contents">
                    <span className="text-xs text-muted sm:w-14 sm:text-right">뿔 {e.poule_rank ? `${e.poule_rank}위` : "-"}</span>
                    <span className="font-bold sm:w-14 sm:text-right" style={{ color: rankColor(e.final_rank) }}>{e.final_rank ? `${e.final_rank}위` : "-"}</span>
                    <span className="font-semibold sm:w-12 sm:text-right">{sc?.score != null ? Math.round(sc.score) : "-"}<span className="ml-0.5 text-[10px] font-normal text-muted sm:hidden">점</span></span>
                    <button
                      disabled={evViews.length === 0}
                      onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(e.event_id)) n.delete(e.event_id); else n.add(e.event_id); return n; })}
                      className="ml-auto flex items-center gap-0.5 text-xs text-brand disabled:text-muted/40 sm:ml-0"
                    >
                      경기 {evViews.length}<ChevronDown size={12} className={cn("transition-transform", isOpen && "rotate-180")} />
                    </button>
                  </span>
                </div>
                {isOpen && (
                  <div className="space-y-1 border-t border-line px-3 py-2">
                    <div className="mb-1 text-xs text-muted">{w}승 {evViews.length - w}패</div>
                    {evViews.map((v) => <MatchLine key={v.m.id} v={v} opp={opp.get(v.oppId)} linkQ={linkQ} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 hidden text-[11px] text-muted sm:block">순서: 날짜 · 대회 · 뿔 순위 · 최종 순위 · 대회 점수(0~1000)</div>
        {shownEntries < myEntries.length && (
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setShownEntries((s) => s + 10)}>더보기</Button>
        )}
      </section>

      {/* 최근 전적 (유저 전적검색과 같은 모양) */}
      <section className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-2 font-bold">{member ? "최근 대회 경기" : "최근 전적"}</h3>
          {([["ALL", "전체"], ["POULE", "뿔"], ["ED", "ED"]] as const).map(([f, l]) => (
            <button aria-pressed={filter === f} key={f} onClick={() => { setFilter(f); setShown(10); }} className={cn("rounded px-2.5 py-1 text-xs", filter === f ? "bg-brand font-semibold text-brand-ink" : "text-muted hover:bg-white/5")}>{l}</button>
          ))}
          <Input className="ml-auto h-8 w-40" aria-label="상대 이름 검색" placeholder="상대 이름 검색" value={oppQ} onChange={(e) => setOppQ(e.target.value)} />
        </div>
        {list.length === 0 && <p className="py-4 text-center text-sm text-muted">기록이 없습니다</p>}
        <div className="space-y-1.5">
          {list.slice(0, shown).map((v) => <MatchLine key={v.m.id} v={v} opp={opp.get(v.oppId)} linkQ={linkQ} withComp />)}
        </div>
        {shown < list.length && <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setShown((s) => s + 10)}>더보기</Button>}
      </section>

      {/* 마이 펜싱(본인) 전용: 피드백 노트, 전적 상세·수정, 설정 */}
      {own && (
        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold">내 피드백 노트</h3>
            <Link href="/notes" className="text-xs text-brand">더보기</Link>
          </div>
          {notes.length === 0 && <p className="text-sm text-muted">작성한 노트가 없습니다</p>}
          {notes.slice(0, 5).map((n) => (
            <button key={n.id} onClick={() => n.game && setDetail(n.game)} className="mb-1.5 block w-full rounded-md bg-panel2 px-3 py-2 text-left text-sm hover:bg-white/5">
              <div className="truncate">{n.title ? `${n.title} · ` : ""}{n.content}</div>
              <div className="text-xs text-muted">{fmtDate(n.created_at)}{n.game && ` · vs ${n.game.oppName} ${n.game.mine}:${n.game.theirs}`}</div>
            </button>
          ))}
        </section>
      )}
      {own && <GameDetailModal view={detail} onClose={() => setDetail(null)} onChanged={loadMemberRecs} />}
      {own && showSettings && <SettingsModal open onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function RateBar({ label, t }: { label: string; t: { wins: number; losses: number } }) {
  const n = t.wins + t.losses;
  const rate = n ? Math.round((t.wins / n) * 1000) / 10 : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span><b className="text-sm">{n ? `${rate}%` : "-"}</b> <span className="text-win">{t.wins}승</span> <span className="text-loss">{t.losses}패</span></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-loss/60">
        <div className="h-full bg-win" style={{ width: `${n ? rate : 0}%` }} />
      </div>
    </div>
  );
}

/** 경기 한 줄: 승/패 · vs 상대(클릭 시 상대 프로필) · 점수 · 단계 [· 대회/날짜]
 *  좁은 화면에서는 한 줄에 다 넣지 않고 둘째 줄(단계 · 대회 · 날짜)로 내려서 상대 이름이 잘리지 않게 한다. */
function MatchLine({ v, opp, linkQ, withComp = false }: { v: MView; opp?: { name: string; club: string | null; reg: boolean }; linkQ: string; withComp?: boolean }) {
  const comp = (
    <Link href={`/competitions/${v.ev.competition.id}?event=${v.ev.id}`} className="hover:text-brand">{v.ev.competition.name}</Link>
  );
  return (
    <div className={cn("rounded-md py-2 pl-4 pr-3 text-sm", v.win ? "bg-win/[0.08]" : "bg-loss/[0.07]")}>
      <div className="flex items-center gap-3">
        <span className={cn("w-6 shrink-0 font-bold", v.win ? "text-win" : "text-loss")}>{v.win ? "승" : "패"}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0">vs</span><Dot member={false} />
          <Link href={`/athletes/${v.oppId}?${linkQ}`} className="truncate font-medium hover:text-brand">{opp?.name ?? "-"}</Link>
          {opp?.club && <span className="hidden truncate text-xs text-muted sm:inline">{opp.club}</span>}
        </span>
        <span className="shrink-0 text-right font-semibold">{v.mine ?? "—"} : {v.theirs ?? "—"}</span>
        <span className="hidden w-20 shrink-0 text-right text-xs text-muted sm:block">{v.label}</span>
        {withComp && <span className="hidden max-w-[10rem] truncate text-xs text-muted md:inline">{comp}</span>}
        {withComp && <span className="hidden w-20 shrink-0 text-right text-xs text-muted sm:block">{fmtDay(v.date)}</span>}
      </div>
      {/* 좁은 화면 둘째 줄 */}
      <div className="mt-0.5 flex items-center gap-1.5 pl-9 text-xs text-muted sm:hidden">
        <span className="shrink-0">{v.label}</span>
        {withComp && <span className="min-w-0 truncate">· {comp}</span>}
        {withComp && <span className="ml-auto shrink-0">{fmtDay(v.date)}</span>}
      </div>
    </div>
  );
}

/** 대회 점수 꺾은선 (0~1000). 의존 라이브러리 없이 SVG 로 그린다 */
function TrendChart({ points }: { points: { date: string; score: number }[] }) {
  const W = 600, H = 150, PL = 30, PR = 10, PT = 10, PB = 22;
  const x = (i: number) => PL + (i * (W - PL - PR)) / Math.max(1, points.length - 1);
  const y = (s: number) => PT + (1 - s / 1000) * (H - PT - PB);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 250, 500, 750, 1000].map((g) => (
        <g key={g}>
          <line x1={PL} x2={W - PR} y1={y(g)} y2={y(g)} className="stroke-line" strokeWidth="1" />
          <text x={PL - 4} y={y(g) + 3} textAnchor="end" className="fill-muted" fontSize="9">{g}</text>
        </g>
      ))}
      <path d={path} fill="none" className="stroke-brand" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.score)} r="3" className="fill-brand" />
          {(i === 0 || i === points.length - 1 || points.length <= 8) && (
            <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted" fontSize="9">{p.date.slice(2, 7).replace("-", ".")}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
