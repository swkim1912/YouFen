// 랭킹·대회·선수 화면이 함께 쓰는 상수/타입/헬퍼.
// 점수제도 설계는 docs/SCORING.md 참고. 점수는 DB 함수 private.refresh_scores() 가 계산해 pool_scores / event_scores 에 저장해 둔다.

/** 랭킹 탭: 동호인 대회(엘리트부 제외) / 동호인 대회의 엘리트부 / 협회·연맹 대회 */
export const TABS = ["동호인", "엘리트", "전문선수"] as const;
export type Tab = (typeof TABS)[number];

/** 종별(연령 구분). 고등부를 넘으면 전부 일반부 */
export const AGES = ["초등", "중등", "고등", "일반"] as const;
export type Age = (typeof AGES)[number];

/** DB 에는 '플러레' 로 저장되어 있다 (화면에는 사이트 표기대로 '플뢰레') */
export const WEAPON_VALUES = ["에페", "사브르", "플러레"] as const;
export type WeaponValue = (typeof WEAPON_VALUES)[number];
export const weaponLabel = (w: string | null | undefined) => (w === "플러레" ? "플뢰레" : (w ?? ""));

export const GENDER_VALUES = ["남", "여"] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];
export const genderLabel = (g: string | null | undefined) => (g === "남" ? "남자" : g === "여" ? "여자" : "");

/** 엘리트 탭은 일반부만 있다(동호인 대회의 엘리트부) */
export const agesFor = (tab: Tab): readonly Age[] => (tab === "엘리트" ? (["일반"] as const) : AGES);

export const ageLabel = (a: string) => `${a}부`;

// 티어 색상: 티어 엠블럼(design/tier/tokens.json)의 색에서 뽑아, 어두운 바탕에서 글자로 읽히게 밝기만 올린 값.
// 골드와 챌린저는 엠블럼이 둘 다 금빛이라 밝기로 구분한다(골드 = 짙은 황금, 챌린저 = 밝은 금빛).
// tier.ts(회원 전적검색의 옛 티어)도 같은 색을 쓴다 — 바꿀 땐 같이 바꿀 것.
export const TIER_META: Record<string, { color: string; short: string }> = {
  브론즈: { color: "#cf8a5c", short: "브" },
  실버: { color: "#b3c0cd", short: "실" },
  골드: { color: "#d9a63a", short: "골" },
  플래티넘: { color: "#4cc9be", short: "플" },
  다이아몬드: { color: "#8196ff", short: "다" },
  마스터: { color: "#bf83f2", short: "마" },
  챌린저: { color: "#ffd76a", short: "챌" },
};
export const tierColor = (tier: string | null | undefined) => (tier ? TIER_META[tier]?.color : undefined) ?? "#6b7a8f";

/** 랭킹 종류: 종합(대회+오픈) / 오픈게임 / 대회. 오픈게임 데이터가 생기기 전에는 종합 = 대회 점수 */
export const MODES = ["종합", "오픈", "대회"] as const;
export type Mode = (typeof MODES)[number];

/** 시즌 = 2년 창 (예: 2025-26). 점수 계산은 DB(private.refresh_scores)가 한다 */
export interface Season {
  season: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

/** 등수 색: 1등 금색, 2등 은색, 3등 동색 (그 밖은 기본색) */
export const MEDAL_COLORS = ["#e5c14b", "#c0c6d4", "#cd8b4a"] as const;
export const rankColor = (rank: number | null | undefined): string | undefined =>
  rank && rank >= 1 && rank <= 3 ? MEDAL_COLORS[rank - 1] : undefined;

/** 풀(랭킹 단위) 키 */
export interface PoolKey {
  tab: Tab;
  age: Age;
  weapon: WeaponValue;
  gender: GenderValue;
}
export const poolLabel = (p: PoolKey) => `${p.tab} ${ageLabel(p.age)} ${genderLabel(p.gender)} ${weaponLabel(p.weapon)}`;

// ---- DB 행 타입 ----
export interface PoolScore {
  athlete_id: number;
  season: string;
  tab: Tab;
  age: Age;
  weapon: WeaponValue;
  gender: GenderValue;
  n_events: number; // 해당 시즌 창(2년) 안의 참가 대회 수
  n_eff: number;
  tour_score: number;
  placed: boolean;
  pool_rank: number | null;
  pool_size: number | null;
  tier: string | null;
  best_score: number | null;
  current_team: string | null;
  first_date: string | null;
  last_date: string | null;
}

export interface AthleteRow {
  id: number;
  name: string;
  gender: string | null;
  is_registered: boolean;
  club_id?: number | null;
  linked_profile_id?: string | null; // 연결된 유펜 회원(없으면 null)
  club: { name: string } | null;
}

export interface MatchRow {
  id: number;
  event_id: string;
  stage: "POULE" | "EDQ" | "ED";
  poule_no: number | null;
  round_size: number | null;
  match_sym: string | null;
  a_athlete: number;
  b_athlete: number;
  a_score: number | null;
  b_score: number | null;
  winner: number | null;
  third_place: boolean;
}

export interface EventMeta {
  id: string;
  name: string;
  division: string | null;
  tab: Tab | null;
  age: Age | null;
  weapon: WeaponValue | null;
  gender: GenderValue | null;
  entrants: number | null;
  has_ed: boolean;
  start_date: string | null;
  competition: { id: string; name: string; start_date: string | null; end_date: string | null };
}

// ---- 표시 헬퍼 ----
/** ED 라운드 이름: 4강→준결승, 2강→결승, 나머지 N강. 예선 ED 는 앞에 '예선' */
export function roundLabel(stage: string, roundSize: number | null, thirdPlace = false): string {
  if (thirdPlace) return "3·4위전";
  const base = roundSize === 2 ? "결승" : roundSize === 4 ? "준결승" : roundSize ? `${roundSize}강` : "";
  if (stage === "POULE") return "뿔";
  return stage === "EDQ" ? `예선 ED ${base}` : `ED ${base}`;
}

/** 'YYYY-MM-DD' → '2026.09.06' */
export function fmtDay(d: string | null | undefined) {
  return d ? d.replaceAll("-", ".") : "";
}

/** 대회 기간 표기: 하루면 한 날짜, 이틀 이상이면 시작–끝 */
export function fmtRange(start: string | null, end: string | null) {
  if (!start) return "";
  return end && end !== start ? `${fmtDay(start)} – ${fmtDay(end)}` : fmtDay(start);
}

/** 한 번에 1000행을 넘는 조회를 이어 붙여 가져온다 (Supabase API 기본 상한 1000행) */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data } = await build(from, from + 999);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
