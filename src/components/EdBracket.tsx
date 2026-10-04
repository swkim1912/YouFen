"use client";
// 본선 ED(엘리미나시옹 디렉트) 대진표: 누가 누구와 겨뤄 어디로 올라갔는지 라운드 사이를 선으로 이어 보여준다.
//
// 데이터 규칙(협회 경기 기호): 64강 경기는 F1~F32, 32강은 E1~E16, 16강 D1~D8, 8강 C1~C4, 준결승 B1~B2, 결승 A1.
//   n번 경기의 승자는 다음 라운드 ceil(n/2)번 경기로 올라가고, 홀수 번호 = 위 칸(a_athlete), 짝수 번호 = 아래 칸(b_athlete).
//   부전승 칸은 DB 에 경기로 없으므로, 다음 라운드의 그 칸에 있는 선수를 'BYE' 카드로 복원해서 그린다.
// 화면: 라운드 탭(64강 … 결승) = 선택한 라운드부터 최대 4열을 보여주고, 경기가 8개 이상이면 4개 '구역'으로 나눠 본다.
import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MatchRow } from "@/lib/fencing";

export interface BracketPlayer {
  name: string;
  team: string | null;
}

const CARD_W = 232, CARD_H = 58, SLOT = 74, GAP = 56, MAX_COLS = 4;

const roundName = (size: number) => (size === 2 ? "결승" : size === 4 ? "준결승" : `${size}강`);
const idxOf = (m: MatchRow) => Number((m.match_sym ?? "").replace(/\D/g, "")) || 0;

/** 카드 한 장에 그릴 내용 */
interface Cell {
  size: number;
  idx: number;
  a: number | null;
  b: number | null;
  as: number | null;
  bs: number | null;
  winner: number | null;
  bye: boolean;
}

export function EdBracket({
  matches, players, linkQuery, fallback,
}: {
  matches: MatchRow[]; // 본선 ED 경기 (3·4위전 제외)
  players: Map<number, BracketPlayer>;
  linkQuery: string; // 선수 링크에 붙일 풀 정보 (tab=..&age=..)
  fallback?: React.ReactNode; // 대진 번호가 이상해 대진표를 못 그릴 때 대신 보여줄 것
}) {
  // 라운드별 경기 표: size → idx → match. 번호가 이상하면(겹침/범위 밖) 대진표를 만들지 않고 null.
  const model = useMemo(() => {
    const byRound = new Map<number, Map<number, MatchRow>>();
    for (const m of matches) {
      if (!m.round_size) return null;
      const i = idxOf(m);
      if (i < 1 || i > m.round_size / 2) return null;
      const r = byRound.get(m.round_size) ?? new Map<number, MatchRow>();
      if (r.has(i)) return null;
      r.set(i, m);
      byRound.set(m.round_size, r);
    }
    const first = Math.max(...byRound.keys());
    const sizes: number[] = [];
    for (let s = first; s >= 2; s /= 2) sizes.push(s);

    // 한 칸에서 올라가는 선수: 경기가 있으면 승자, 부전승이면 다음 라운드의 그 칸 선수
    const occupant = (size: number, i: number): number | null => {
      const m = byRound.get(size)?.get(i);
      if (m) return m.winner;
      if (size <= 2) return null;
      const parent = byRound.get(size / 2)?.get(Math.ceil(i / 2));
      if (parent) return i % 2 === 1 ? parent.a_athlete : parent.b_athlete;
      return occupant(size / 2, Math.ceil(i / 2));
    };
    const cell = (size: number, i: number): Cell | null => {
      const m = byRound.get(size)?.get(i);
      if (m) return { size, idx: i, a: m.a_athlete, b: m.b_athlete, as: m.a_score, bs: m.b_score, winner: m.winner, bye: false };
      const p = occupant(size, i);
      return p == null ? null : { size, idx: i, a: p, b: null, as: null, bs: null, winner: p, bye: true };
    };
    return { sizes, cell, first };
  }, [matches]);

  const [start, setStart] = useState<number | null>(null);
  const [region, setRegion] = useState(0);
  if (!model) return <>{fallback ?? null}</>;
  const { sizes, cell } = model;
  const startSize = start && sizes.includes(start) ? start : sizes[0];

  // 시작 라운드의 경기 수 n0. 8개 이상이면 4구역으로 나눠 본다
  const n0 = startSize / 2;
  const regions = n0 >= 8;
  const per = regions ? n0 / 4 : n0; // 한 화면의 첫 열 경기 수
  const lo0 = regions ? region * per + 1 : 1; // 첫 열의 시작 번호
  const cols: { size: number; idxs: number[] }[] = [];
  for (let c = 0; c < MAX_COLS; c++) {
    const size = startSize / 2 ** c;
    const cnt = per / 2 ** c;
    if (size < 2 || cnt < 1) break;
    const lo = Math.floor((lo0 - 1) / 2 ** c) + 1;
    cols.push({ size, idxs: Array.from({ length: cnt }, (_, j) => lo + j) });
  }

  const height = per * SLOT;
  const width = cols.length * CARD_W + (cols.length - 1) * GAP;
  const topOf = (c: number, j: number) => (j * 2 ** c + (2 ** c - 1) / 2) * SLOT + (SLOT - CARD_H) / 2;

  return (
    <div className="space-y-3">
      {regions && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
          {[0, 1, 2, 3].map((k) => (
            <button key={k} onClick={() => setRegion(k)} className={cn("bg-panel px-3 py-2 text-left", region === k ? "bg-panel2 ring-1 ring-inset ring-brand" : "hover:bg-white/5")}>
              <div className="text-sm font-bold">{k + 1}구역</div>
              <div className="text-[11px] text-muted">{startSize}강 경기 {k * per + 1}–{(k + 1) * per}</div>
            </button>
          ))}
        </div>
      )}
      <div className="flex overflow-x-auto rounded-md border border-line">
        {sizes.map((s) => (
          <button key={s} onClick={() => { setStart(s); setRegion(0); }} className={cn("min-w-[4.5rem] flex-1 border-b-2 px-3 py-2 text-sm", s === startSize ? "border-brand bg-panel2 font-bold" : "border-transparent bg-panel text-muted hover:text-foreground")}>
            {roundName(s)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto pb-2">
        <div style={{ width }}>
          {/* 열 제목 */}
          <div className="relative mb-2 h-10">
            {cols.map((col, c) => (
              <div key={col.size} className="absolute" style={{ left: c * (CARD_W + GAP), width: CARD_W }}>
                <div className="text-[10px] font-bold tracking-wide text-loss">ROUND {sizes.indexOf(col.size) + 1}</div>
                <div className="border-b border-line pb-0.5 text-base font-bold">{roundName(col.size)}</div>
              </div>
            ))}
          </div>
          {/* 카드 + 연결선 */}
          <div className="relative" style={{ width, height }}>
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              {cols.slice(1).flatMap((col, ci) => {
                const c = ci + 1;
                return col.idxs.flatMap((_, j) => {
                  const py = topOf(c, j) + CARD_H / 2;
                  const px = c * (CARD_W + GAP);
                  const xr = (c - 1) * (CARD_W + GAP) + CARD_W;
                  return [2 * j, 2 * j + 1].map((cj) => {
                    const cy = topOf(c - 1, cj) + CARD_H / 2;
                    const mx = xr + GAP / 2;
                    return <path key={`${c}-${j}-${cj}`} d={`M${xr},${cy} H${mx} V${py} H${px}`} fill="none" className="stroke-line" strokeWidth="1.5" />;
                  });
                });
              })}
            </svg>
            {cols.flatMap((col, c) =>
              col.idxs.map((i, j) => {
                const cl = cell(col.size, i);
                if (!cl) return null;
                return (
                  <div key={`${col.size}-${i}`} className="absolute" style={{ left: c * (CARD_W + GAP), top: topOf(c, j), width: CARD_W, height: CARD_H }}>
                    <MatchCard cl={cl} players={players} linkQuery={linkQuery} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 경기 카드: 위/아래 두 칸, 이긴 쪽은 초록 점수 + 굵은 이름, 진 쪽은 빨강 점수. 부전승은 회색 BYE */
export function MatchCard({ cl, players, linkQuery }: { cl: Cell; players: Map<number, BracketPlayer>; linkQuery: string }) {
  const row = (id: number | null, score: number | null, isBye: boolean, slot: "a" | "b") => {
    const win = id != null && cl.winner === id;
    const p = id != null ? players.get(id) : undefined;
    return (
      <div className={cn("flex h-1/2 items-stretch border-l-4", win ? "border-win/0 border-l-green-600" : "border-l-transparent")}>
        <div className={cn("flex min-w-0 flex-1 flex-col justify-center px-2 leading-tight", !win && "text-muted")}>
          {id != null ? (
            <>
              <Link href={`/athletes/${id}?${linkQuery}`} className={cn("truncate text-[13px] hover:text-brand", win && "font-bold text-foreground")}>{p?.name ?? "-"}</Link>
              <span className="truncate text-[10px] text-muted">{p?.team}</span>
            </>
          ) : (
            <span className="text-[12px] text-muted/70">{slot === "b" && cl.bye ? "부전승" : "-"}</span>
          )}
        </div>
        <div
          className={cn(
            "flex w-10 shrink-0 items-center justify-center text-sm font-bold text-white",
            isBye ? "bg-gray-500 text-[10px]" : id == null ? "bg-transparent text-muted" : win ? "bg-green-700" : "bg-red-800"
          )}
        >
          {isBye ? "BYE" : id == null ? "—" : score ?? "—"}
        </div>
      </div>
    );
  };
  return (
    <div className="flex h-full flex-col overflow-hidden rounded border border-line bg-panel2 shadow-sm">
      {row(cl.a, cl.as, cl.bye, "a")}
      <div className="border-t border-line/70" />
      {row(cl.b, cl.bs, false, "b")}
    </div>
  );
}

export type { Cell as BracketCell };
