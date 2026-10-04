"use client";
// 대회 상세: /competitions/COMPM00725?event=COMPS000000000004252
// 위에서부터 ① 대회 정보·종목 선택 ② 최종 순위(이름·소속·뿔 순위·대회 점수·종합 점수) ③ 예선 뿔 점수표 ④ 본선 ED 대진
// 선수 이름을 누르면 선수 프로필(/athletes/[id])로 이동한다.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Dot } from "@/components/ui/dot";
import { Button } from "@/components/ui/button";
import { EdBracket } from "@/components/EdBracket";
import {
  WEAPON_VALUES, GENDER_VALUES, fmtRange, publicData, genderLabel, rankColor, weaponLabel,
  type MatchRow, type Tab, type Age, type GenderValue, type WeaponValue,
} from "@/lib/fencing";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/lib/pageTitle";

interface Comp { id: string; name: string; start_date: string | null; end_date: string | null }
interface Ev {
  id: string; name: string; division: string | null; tab: Tab | null; age: Age | null;
  weapon: WeaponValue | null; gender: GenderValue | null; entrants: number | null; has_ed: boolean;
  winner: { id: number; name: string } | null;
}
interface Entry {
  athlete_id: number; team_name: string | null; poule_no: number | null; poule_wins: number | null; poule_bouts: number | null;
  poule_ind: number | null; poule_ts: number | null; poule_rank: number | null; final_rank: number | null;
  athlete: { id: number; name: string } | null;
}

export default function CompetitionPage() {
  return (
    <AppShell>
      <Suspense>
        <Inner />
      </Suspense>
    </AppShell>
  );
}

/** 종목 구분 라벨: 탭 + 부 이름 (예: "동호인 · 일반부", "전문선수 · 오픈") */
const buLabel = (e: Ev) => `${e.tab} · ${e.division ?? "오픈"}`;

function Inner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [comp, setComp] = useState<Comp | null | undefined>(undefined);
  const [events, setEvents] = useState<Ev[]>([]);
  const [eventId, setEventId] = useState<string | null>(sp.get("event"));
  usePageTitle(comp?.name); // 탭 제목 = 대회 이름

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 대회 정보 + 결과가 있는 종목 목록 (DB 함수 data_competition)
      const r = await publicData<{ comp: Comp | null; events: Ev[] }>("data_competition", { p_id: id }, { comp: null, events: [] });
      if (cancelled) return;
      setComp(r.comp ?? null);
      const list = r.events ?? [];
      setEvents(list);
      setEventId((cur) => (cur && list.some((x) => x.id === cur) ? cur : (list.find((x) => x.weapon === "에페" && x.gender === "남") ?? list[0])?.id ?? null));
    })();
    return () => { cancelled = true; };
  }, [id]);

  const ev = events.find((x) => x.id === eventId) ?? null;

  useEffect(() => {
    if (eventId) window.history.replaceState(null, "", `/competitions/${id}?event=${eventId}`);
  }, [eventId, id]);

  // 종목 선택 UI: 부(탭·종별) → 성별 → 종목. 바꾸면 가능한 조합 중 가장 가까운 종목으로 이동한다.
  const bus = useMemo(() => [...new Map(events.map((e) => [buLabel(e), e])).keys()], [events]);
  const choose = (bu: string | null, gender: string | null, weapon: string | null) => {
    const cands = events.filter((e) => (bu ? buLabel(e) === bu : true));
    const exact = cands.find((e) => e.gender === gender && e.weapon === weapon);
    const next = exact ?? cands.find((e) => e.gender === gender) ?? cands.find((e) => e.weapon === weapon) ?? cands[0];
    if (next) setEventId(next.id);
  };
  const has = (gender: string, weapon: string) => events.some((e) => (ev ? buLabel(e) === buLabel(ev) : true) && e.gender === gender && e.weapon === weapon);

  if (comp === undefined) return <p className="py-16 text-center text-muted">불러오는 중…</p>;
  if (comp === null) return <p className="py-16 text-center text-muted">대회를 찾을 수 없습니다</p>;

  const chip = (active: boolean, disabled = false) =>
    cn("rounded px-3 py-1.5 text-sm", active ? "bg-brand font-semibold text-brand-ink" : "bg-panel text-muted hover:text-foreground", disabled && "pointer-events-none opacity-30");

  return (
    <div className="space-y-4">
      {/* 대회 정보 */}
      <section className="rounded-lg border border-line bg-panel p-4">
        <Link href="/competitions" className="text-xs text-muted hover:text-foreground">← 대회 목록</Link>
        <div className="mt-1 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold">{comp.name}</h1>
            <p className="text-sm text-muted">{fmtRange(comp.start_date, comp.end_date)}</p>
          </div>
          {ev && (
            <div className="rounded-md bg-panel2 px-4 py-2 text-right">
              <div className="text-xs text-muted">{genderLabel(ev.gender)} {weaponLabel(ev.weapon)} 우승</div>
              {ev.winner ? (
                <Link href={`/athletes/${ev.winner.id}?tab=${ev.tab}&age=${ev.age}&weapon=${ev.weapon}&gender=${ev.gender}`} className="text-lg font-extrabold hover:underline" style={{ color: rankColor(1) }}>{ev.winner.name}</Link>
              ) : <div className="text-lg font-bold">-</div>}
              <div className="text-xs text-muted">{ev.entrants}명 참가</div>
            </div>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {bus.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {bus.map((b) => <button key={b} onClick={() => choose(b, ev?.gender ?? null, ev?.weapon ?? null)} className={chip(!!ev && buLabel(ev) === b)}>{b}</button>)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {GENDER_VALUES.map((g) => (
              <button key={g} onClick={() => choose(ev ? buLabel(ev) : null, g, ev?.weapon ?? null)} className={chip(ev?.gender === g, !events.some((e) => (ev ? buLabel(e) === buLabel(ev) : true) && e.gender === g))}>{genderLabel(g)}</button>
            ))}
            <span className="mx-1 text-line">|</span>
            {WEAPON_VALUES.map((w) => (
              <button key={w} onClick={() => choose(ev ? buLabel(ev) : null, ev?.gender ?? null, w)} className={chip(ev?.weapon === w, !has(ev?.gender ?? "", w))}>{weaponLabel(w)}</button>
            ))}
          </div>
        </div>
      </section>

      {ev ? <EventDetail key={ev.id} ev={ev} /> : <p className="py-16 text-center text-muted">이 대회의 개인전 결과가 없습니다</p>}
    </div>
  );
}

function EventDetail({ ev }: { ev: Ev }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [scores, setScores] = useState<Map<number, number | null>>(new Map());
  const [matches, setMatches] = useState<MatchRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 종목 하나의 참가자·대회 점수·경기를 한 번에 (DB 함수 data_event)
      const r = await publicData<{ entries: Entry[]; scores: { athlete_id: number; score: number | null }[]; matches: MatchRow[] }>(
        "data_event", { p_event: ev.id }, { entries: [], scores: [], matches: [] },
      );
      if (cancelled) return;
      setEntries(r.entries);
      setScores(new Map(r.scores.map((s) => [s.athlete_id, s.score])));
      setMatches(r.matches);
    })();
    return () => { cancelled = true; };
  }, [ev.id]);

  const byId = useMemo(() => new Map((entries ?? []).map((e) => [e.athlete_id, e])), [entries]);
  const poolQ = `tab=${ev.tab}&age=${ev.age}&weapon=${ev.weapon}&gender=${ev.gender}`;
  const nameLink = (id: number, cls = "") => {
    const e = byId.get(id);
    return (
      <Link href={`/athletes/${id}?${poolQ}`} className={cn("hover:text-brand", cls)}>{e?.athlete?.name ?? "-"}</Link>
    );
  };

  if (!entries || !matches) return <p className="py-10 text-center text-muted">불러오는 중…</p>;

  // 최종 순위: 순위 있는 선수(순위순) → 예선 탈락 등 순위 없는 선수(뿔 순위순)
  const ranked = [...entries].sort((a, b) => (a.final_rank ?? 9999) - (b.final_rank ?? 9999) || (a.poule_rank ?? 9999) - (b.poule_rank ?? 9999));

  return (
    <>
      {/* 최종 순위 */}
      <section className="rounded-lg border border-line bg-panel p-4">
        <h2 className="mb-3 font-bold">최종 순위 <span className="text-xs font-normal text-muted">{ev.division ?? "오픈"} · {entries.length}명</span></h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="w-12 py-2 text-left font-normal">순위</th>
                <th className="text-left font-normal">이름</th>
                <th className="text-left font-normal">소속</th>
                <th className="w-16 text-right font-normal">뿔 순위</th>
                <th className="w-16 text-right font-normal">대회 점수</th>
                <th className="w-20 text-right font-normal" title="유펜 회원과 연동된 선수만 표시됩니다">종합 점수</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((e) => (
                <tr key={e.athlete_id} className="border-b border-line/60 last:border-0">
                  <td className="py-2 font-bold" style={{ color: rankColor(e.final_rank) }}>{e.final_rank ?? <span className="text-xs font-normal text-muted">-</span>}</td>
                  <td className="font-medium"><span className="inline-flex items-center gap-1.5"><Dot member={false} />{nameLink(e.athlete_id)}</span></td>
                  <td className="max-w-[12rem] truncate text-xs text-muted">{e.team_name}</td>
                  <td className="text-right text-muted">{e.poule_rank ? `${e.poule_rank}위` : "-"}</td>
                  <td className="text-right font-semibold">{scores.get(e.athlete_id) != null ? Math.round(scores.get(e.athlete_id)!) : "-"}</td>
                  <td className="text-right text-muted">-</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">순위가 없는 선수는 예선 탈락 등으로 최종 순위가 집계되지 않은 선수입니다. 종합 점수는 유펜 회원과 연동된 선수만 표시됩니다.</p>
      </section>

      <MatchesSection entries={entries} matches={matches} byId={byId} nameLink={nameLink} poolQ={poolQ} />
    </>
  );
}

/** 경기 기록: 뿔 / ED 탭. 탭으로 나눠서 긴 스크롤 없이 필요한 쪽만 본다 */
function MatchesSection({ entries, matches, byId, nameLink, poolQ }: { entries: Entry[]; matches: MatchRow[]; byId: Map<number, Entry>; nameLink: (id: number, cls?: string) => React.ReactNode; poolQ: string }) {
  const poule = matches.filter((m) => m.stage === "POULE");
  const ed = matches.filter((m) => m.stage !== "POULE");
  const mainEd = ed.filter((m) => m.stage === "ED");
  const [tab, setTab] = useState<"POULE" | "ED">(mainEd.length > 0 || poule.length === 0 ? "ED" : "POULE");
  if (matches.length === 0) return null;
  const tabCls = (on: boolean) => cn("flex-1 border-b-2 px-4 py-2.5 text-sm sm:flex-none", on ? "border-brand font-bold text-foreground" : "border-transparent text-muted hover:text-foreground");
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] text-brand">MATCHES</div>
          <h2 className="text-lg font-bold">경기 기록</h2>
        </div>
        <span className="text-sm text-muted">{matches.length}경기</span>
      </div>
      <div className="mb-4 flex gap-1 border-b border-line">
        {poule.length > 0 && <button onClick={() => setTab("POULE")} className={tabCls(tab === "POULE")}>뿔 <span className="ml-1 text-xs text-muted">{poule.length}경기</span></button>}
        {ed.length > 0 && <button onClick={() => setTab("ED")} className={tabCls(tab === "ED")}>ED <span className="ml-1 text-xs text-muted">{mainEd.length || ed.length}경기</span></button>}
      </div>
      {tab === "POULE" ? <PouleTables entries={entries} matches={poule} nameLink={nameLink} /> : <EdTab matches={ed} byId={byId} nameLink={nameLink} poolQ={poolQ} />}
    </section>
  );
}

/** 예선 뿔: 뿔마다 선수 × 선수 점수표. 이긴 칸은 V(목표 점수로 이기면) / V4(그보다 적게 이기면), 진 칸은 점수 */
function PouleTables({ entries, matches, nameLink }: { entries: Entry[]; matches: MatchRow[]; nameLink: (id: number, cls?: string) => React.ReactNode }) {
  const [shown, setShown] = useState(6);
  const groups = useMemo(() => {
    const g = new Map<number, Entry[]>();
    for (const e of entries) if (e.poule_no != null) g.set(e.poule_no, [...(g.get(e.poule_no) ?? []), e]);
    return [...g.entries()].sort((a, b) => a[0] - b[0]).map(([no, list]) => [no, list.sort((a, b) => (a.poule_rank ?? 9999) - (b.poule_rank ?? 9999))] as const);
  }, [entries]);
  // 뿔은 보통 5점 내기. 이 종목에서 나온 가장 큰 점수를 목표 점수로 보고, 그 점수로 이기면 V 만 표시한다
  const target = useMemo(() => matches.reduce((a, m) => Math.max(a, m.a_score ?? 0, m.b_score ?? 0), 0), [matches]);
  const cell = useMemo(() => {
    const m = new Map<string, { mine: number | null; theirs: number | null; win: boolean }>();
    for (const x of matches) {
      m.set(`${x.a_athlete}-${x.b_athlete}`, { mine: x.a_score, theirs: x.b_score, win: x.winner === x.a_athlete });
      m.set(`${x.b_athlete}-${x.a_athlete}`, { mine: x.b_score, theirs: x.a_score, win: x.winner === x.b_athlete });
    }
    return m;
  }, [matches]);

  if (groups.length === 0) return <p className="text-sm text-muted">예선 뿔 기록이 없습니다</p>;
  return (
    <>
      <p className="mb-3 text-xs text-muted">{groups.length}개 뿔 · V = {target || 5}점으로 승리, V4 = 4점으로 승리, 숫자 = 패배한 경기에서 낸 점수</p>
      <div className="space-y-4">
        {groups.slice(0, shown).map(([no, list]) => (
          <div key={no} className="overflow-x-auto">
            <div className="mb-1 text-xs font-semibold text-muted">뿔 {no}</div>
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="w-6 py-1.5 text-left font-normal">#</th>
                  <th className="text-left font-normal">이름</th>
                  <th className="text-left font-normal">소속</th>
                  {list.map((_, i) => <th key={i} className="w-9 text-center font-normal">{i + 1}</th>)}
                  <th className="w-12 text-right font-normal">승</th>
                  <th className="w-10 text-right font-normal">지수</th>
                  <th className="w-10 text-right font-normal">득점</th>
                  <th className="w-10 text-right font-normal">순위</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => (
                  <tr key={a.athlete_id} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 text-muted">{i + 1}</td>
                    <td className="font-medium">{nameLink(a.athlete_id)}</td>
                    <td className="max-w-[9rem] truncate text-xs text-muted">{a.team_name}</td>
                    {list.map((b) => {
                      if (a.athlete_id === b.athlete_id) return <td key={b.athlete_id} className="bg-line/40" />;
                      const c = cell.get(`${a.athlete_id}-${b.athlete_id}`);
                      return (
                        <td key={b.athlete_id} className={cn("text-center text-xs", c ? (c.win ? "font-bold text-win" : "text-loss") : "text-muted/40")}>
                          {c ? (c.win ? (c.mine === target ? "V" : `V${c.mine ?? ""}`) : (c.mine ?? "-")) : "·"}
                        </td>
                      );
                    })}
                    <td className="text-right text-muted">{a.poule_wins ?? "-"}/{a.poule_bouts ?? "-"}</td>
                    <td className="text-right">{a.poule_ind ?? "-"}</td>
                    <td className="text-right">{a.poule_ts ?? "-"}</td>
                    <td className="text-right font-semibold">{a.poule_rank ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {shown < groups.length && (
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setShown((s) => s + 6)}>뿔 더보기 ({groups.length - shown}개 남음)</Button>
      )}
    </>
  );
}

/** ED 탭: 본선 대진표(선으로 연결) + 3·4위전 + (전문선수 대회) 접어 둔 예선 ED 목록 */
function EdTab({ matches, byId, nameLink, poolQ }: { matches: MatchRow[]; byId: Map<number, Entry>; nameLink: (id: number, cls?: string) => React.ReactNode; poolQ: string }) {
  const [showQ, setShowQ] = useState(false);
  const q = matches.filter((m) => m.stage === "EDQ");
  const main = matches.filter((m) => m.stage === "ED" && !m.third_place);
  const third = matches.filter((m) => m.stage === "ED" && m.third_place);
  const players = useMemo(() => new Map([...byId.entries()].map(([id, e]) => [id, { name: e.athlete?.name ?? "-", team: e.team_name }])), [byId]);

  // 라운드별 열 목록: 예선 ED 와 3·4위전, 그리고 대진 번호가 이상해 대진표를 못 만들 때의 대체 표시
  const board = (list: MatchRow[]) => {
    const g = new Map<number, MatchRow[]>();
    for (const m of list) g.set(m.round_size ?? 0, [...(g.get(m.round_size ?? 0) ?? []), m]);
    const num = (m: MatchRow) => Number((m.match_sym ?? "").replace(/\D/g, "")) || m.id;
    const rounds = [...g.entries()].map(([size, ms]) => ({ size, list: ms.sort((a, b) => num(a) - num(b)) })).sort((a, b) => b.size - a.size);
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {rounds.map((r) => (
          <div key={r.size} className="w-60 shrink-0 space-y-1.5">
            <div className="text-xs font-semibold text-muted">{r.size === 2 ? "결승" : r.size === 4 ? "준결승" : `${r.size}강`} <span className="font-normal">· {r.list.length}경기</span></div>
            {r.list.map((m) => (
              <div key={m.id} className="rounded-md border border-line bg-panel2 text-sm">
                {[[m.a_athlete, m.a_score], [m.b_athlete, m.b_score]].map(([id, sc], i) => (
                  <div key={i} className={cn("flex items-center justify-between gap-2 px-2 py-1", m.winner === id ? "font-bold" : "text-muted", i === 1 && "border-t border-line/60")}>
                    <span className="min-w-0 flex-1 truncate">{nameLink(id as number)}<span className="ml-1 text-[11px] font-normal text-muted">{byId.get(id as number)?.team_name}</span></span>
                    <span className={cn("w-6 text-right", m.winner === id && "text-win")}>{sc ?? "-"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {main.length === 0 ? <p className="text-sm text-muted">본선 ED 기록이 없습니다</p> : (
        <EdBracketOrBoard main={main} players={players} poolQ={poolQ} fallback={board(main)} />
      )}
      {third.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">3·4위전</div>
          <div className="max-w-xs">{board(third)}</div>
        </div>
      )}
      {q.length > 0 && (
        <div className="border-t border-line pt-3">
          <button onClick={() => setShowQ((s) => !s)} className="text-sm font-semibold text-brand">
            {showQ ? "▾" : "▸"} 예선 ED {q.length}경기 <span className="font-normal text-muted">(전문선수 대회: 본선 진출자를 가리는 라운드)</span>
          </button>
          {showQ && <div className="mt-3">{board(q)}</div>}
        </div>
      )}
    </div>
  );
}

/** 대진표를 만들 수 있으면 대진표, 아니면(대진 번호가 이상한 예외) 라운드별 목록 */
function EdBracketOrBoard({ main, players, poolQ, fallback }: { main: MatchRow[]; players: Map<number, { name: string; team: string | null }>; poolQ: string; fallback: React.ReactNode }) {
  return <EdBracket matches={main} players={players} linkQuery={poolQ} fallback={fallback} />;
}
