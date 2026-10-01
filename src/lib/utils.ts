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

/** 다른 사람이 읽을 수 있는 profiles 공개 컬럼 (이메일·생년월일 제외 → select("*") 대신 사용) */
export const PUBLIC_COLS =
  "id,nickname,gender,weapon,region,role,division,affiliation,avatar_url,use_frame,use_badge,hide_records,is_admin,onboarded,nickname_changed_at";

export const WEAPONS = ["플뢰레", "에페", "사브르"] as const;
export const ROLES = ["동호인", "엘리트", "전문선수", "학부모", "지도자"] as const;
export const DIVISIONS = ["초등부", "중등부", "고등부", "대학부", "일반부"] as const;
export const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;
