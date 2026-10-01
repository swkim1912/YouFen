// 개인전 Poole Sheet 순위 계산
// 정렬 기준: 승률 → Ind(TS-TR) → TS. 세 가지가 모두 같으면 공동 순위(재경기는 반영 안 함).
export interface PoolPlayer {
  id: string; // 로컬 식별자
  name: string;
  userId: string | null; // 유펜 유저면 profiles.id
}
// results[i][j] = i번 선수가 j번 선수와 싸워 낸 점수 (i 입장), 없으면 undefined
export type PoolResults = (number | undefined)[][];

export interface PoolRow {
  idx: number;
  v: number;
  games: number;
  rate: number;
  ts: number;
  tr: number;
  ind: number;
  place: number;
}

export function calcPool(n: number, results: PoolResults): PoolRow[] {
  const rows: PoolRow[] = [];
  for (let i = 0; i < n; i++) {
    let v = 0, games = 0, ts = 0, tr = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = results[i]?.[j];
      const b = results[j]?.[i];
      if (a === undefined || b === undefined) continue;
      games++;
      ts += a;
      tr += b;
      if (a > b) v++;
    }
    rows.push({ idx: i, v, games, rate: games ? v / games : 0, ts, tr, ind: ts - tr, place: 0 });
  }
  const sorted = [...rows].sort((x, y) => y.rate - x.rate || y.ind - x.ind || y.ts - x.ts);
  sorted.forEach((r, k) => {
    const p = sorted[k - 1];
    r.place = p && p.rate === r.rate && p.ind === r.ind && p.ts === r.ts ? p.place : k + 1;
  });
  return sorted;
}
