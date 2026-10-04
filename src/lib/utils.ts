import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind 클래스 병합 헬퍼 (shadcn/ui 관례) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ISO 문자열 → "2026.10.02" */
export function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 닉네임 형식 검사: 2~12자, 한글/영문/숫자만 (공백·특수문자 불가). 오류 메시지 또는 null */
export function validateNickname(n: string): string | null {
  if (n.length < 2 || n.length > 12) return "닉네임은 2~12자여야 합니다";
  if (!/^[0-9A-Za-z가-힣]+$/.test(n)) return "공백 및 특수문자는 사용할 수 없습니다";
  return null;
}

/** 다른 사람이 읽을 수 있는 profiles 공개 컬럼 (select("*") 대신 사용)
 *  - 이메일·생년월일·관리자 여부(is_admin)·사진 제한(avatar_locked)·동의 기록은 비공개 → 내 정보는 get_my_profile() 로만 읽는다.
 *  - 여기에 열을 추가하면 DB 에서도 grant select (열) on public.profiles to anon, authenticated 를 해야 한다(안 하면 조회 전체가 실패). */
export const PUBLIC_COLS =
  "id,nickname,gender,weapon,region,role,leader_status,division,affiliation,club_id,avatar_url,use_frame,use_badge,hide_records,onboarded,nickname_changed_at";

/** 피드백 노트 글자 수 상한 (DB 제약 feedback_notes_len 과 같은 값 — 한쪽만 바꾸지 말 것). 제목은 50자 */
export const NOTE_MAX = 300;
export const NOTE_TITLE_MAX = 50;

export const WEAPONS = ["플뢰레", "에페", "사브르"] as const;
export const ROLES = ["동호인", "엘리트", "전문선수", "학부모", "지도자"] as const;

/** 화면에 보일 신분 문구: 지도자는 관리자 승인을 받아야 '지도자'로 보인다 */
export function roleLabel(p: { role: string | null; leader_status?: string | null } | null | undefined): string {
  if (!p?.role) return "";
  if (p.role !== "지도자") return p.role;
  if (p.leader_status === "approved") return "지도자";
  return p.leader_status === "rejected" ? "지도자(승인 반려)" : "지도자(승인 대기)";
}
export const DIVISIONS = ["초등부", "중등부", "고등부", "일반부"] as const;
export const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;
