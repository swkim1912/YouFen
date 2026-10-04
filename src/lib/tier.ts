// 티어(MMR) 계산 — 단순 점수제. 기준을 바꾸고 싶으면 아래 상수만 수정하세요.
// (대회 점수는 Pistelog 방식을 참고한 단순화 버전: 대회 승리 가중치를 높게 둠)
import type { RecordView } from "./records";

export const TIERS = [
  { name: "브론즈", min: 0, color: "#cf8a5c" },
  { name: "실버", min: 150, color: "#b3c0cd" },
  { name: "골드", min: 350, color: "#d9a63a" },
  { name: "플래티넘", min: 600, color: "#4cc9be" },
  { name: "다이아몬드", min: 900, color: "#8196ff" },
  { name: "마스터", min: 1300, color: "#bf83f2" },
  { name: "챌린저", min: 1800, color: "#ffd76a" },
] as const;

const OPEN_WIN = 20, OPEN_LOSS = -8, TOUR_WIN = 40, TOUR_LOSS = -10;

export type TierMode = "ALL" | "OPEN" | "TOURNAMENT";

export interface TierResult {
  points: number;
  tier: (typeof TIERS)[number] | null; // null = 배치 중
  openCount: number;
  tourCount: number;
  placed: boolean;
}

export function calcTier(views: RecordView[], mode: TierMode): TierResult {
  const open = views.filter((v) => v.rec.kind === "OPEN" && v.rec.status === "ACCEPTED");
  const tour = views.filter((v) => v.rec.kind === "TOURNAMENT");
  const use = mode === "OPEN" ? open : mode === "TOURNAMENT" ? tour : [...open, ...tour];
  let points = 0;
  for (const v of use) {
    const t = v.rec.kind === "TOURNAMENT";
    points += v.win ? (t ? TOUR_WIN : OPEN_WIN) : t ? TOUR_LOSS : OPEN_LOSS;
  }
  points = Math.max(0, points);
  // 대회 '출전 횟수'는 대회명 기준으로 중복 제거
  const tourCount = new Set(tour.map((v) => v.rec.tournament_name)).size;
  const openCount = open.length;
  // 배치고사: 대회 2회 이상 / 오픈 10경기 이상
  const placed =
    mode === "OPEN" ? openCount >= 10 : mode === "TOURNAMENT" ? tourCount >= 2 : openCount >= 10 || tourCount >= 2;
  const tier = placed ? [...TIERS].reverse().find((t) => points >= t.min)! : null;
  return { points, tier, openCount, tourCount, placed };
}
