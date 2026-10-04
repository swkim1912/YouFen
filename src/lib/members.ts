// 연결된 선수 ↔ 유펜 회원을 화면에서 하나로 합치는 규칙과 조회 헬퍼.
// 합치는 조건: 선수에 연결된 회원이 있고, 그 회원의 신분이 '학부모'가 아닐 것.
//   (학부모는 자녀 여러 명을 연결할 수 있어 회원 전적이 어느 자녀의 것인지 알 수 없으므로 합치지 않고, 닉네임은 회원 프로필로 따로 보인다.)
// 합쳐진 선수는 실명(선수 페이지)으로도 닉네임으로도 검색되고, 같은 선수 페이지(/athletes/[id])로 연결된다.
import { supabase } from "./supabase";

export interface MemberBrief {
  id: string;
  nickname: string;
  role: string | null;
}
export interface LinkedAthleteBrief {
  id: number;
  name: string;
  is_registered: boolean;
  linked_profile_id: string | null;
  club: { name: string } | null;
}

/** 이 회원 정보로 선수 페이지와 합칠 수 있는가 */
export const isMergeable = (m: { role: string | null } | null | undefined) => !!m && m.role !== "학부모";

/** 선수 id → 연결된 회원(합칠 수 있는 회원만) */
export async function membersOfAthletes(athletes: { id: number; linked_profile_id: string | null }[]): Promise<Map<number, MemberBrief>> {
  const out = new Map<number, MemberBrief>();
  const ids = [...new Set(athletes.map((a) => a.linked_profile_id).filter((x): x is string => !!x))];
  if (!ids.length) return out;
  const { data } = await supabase.from("profiles").select("id,nickname,role").in("id", ids);
  const byId = new Map(((data ?? []) as MemberBrief[]).map((m) => [m.id, m]));
  for (const a of athletes) {
    const m = a.linked_profile_id ? byId.get(a.linked_profile_id) : undefined;
    if (m && isMergeable(m)) out.set(a.id, m);
  }
  return out;
}

/** 회원 id → 그 회원에 연결된 선수들 */
export async function athletesOfMembers(profileIds: string[]): Promise<Map<string, LinkedAthleteBrief[]>> {
  const out = new Map<string, LinkedAthleteBrief[]>();
  if (!profileIds.length) return out;
  const { data } = await supabase
    .from("athletes")
    .select("id,name,is_registered,linked_profile_id,club:clubs(name)")
    .in("linked_profile_id", profileIds);
  for (const a of (data ?? []) as unknown as LinkedAthleteBrief[]) {
    const k = a.linked_profile_id!;
    out.set(k, [...(out.get(k) ?? []), a]);
  }
  return out;
}

/** 통합 전적 한 줄: 회원이 입력한 전적(오픈·대회·프라이빗)과 협회 대회 경기를 같은 모양으로 */
export interface FeedRow {
  key: string;
  win: boolean;
  oppName: string;
  oppIsMember: boolean; // 상대가 유펜 회원(녹색 점)
  mine: number | null;
  theirs: number | null;
  kind: "OPEN" | "TOURNAMENT" | "PRIVATE"; // 협회 대회 경기는 TOURNAMENT
  kindLabel: string; // 화면에 보일 기록 종류 (예: 오픈 / 대회 / 대회 · ED 8강)
  date: string; // 정렬용 (ISO 또는 YYYY-MM-DD)
  dateText: string;
  pending: boolean; // 수락 대기(본인에게만 보임, 추이 계산에서 제외)
  official: boolean; // 협회 대회 경기인가
  rec?: import("./records").RecordView; // 회원 전적이면 원본 (본인이 눌러서 수정할 때 사용)
}
