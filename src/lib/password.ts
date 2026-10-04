// 비밀번호 규칙(가입·변경·재설정 공통). 서버(Supabase)의 최소 길이 설정도 MIN_PASSWORD 와 같게 맞춘다.
import { MIN_PASSWORD } from "./legal";

/** 규칙에 맞으면 null, 아니면 이유 문장. email 을 주면 이메일 아이디가 그대로 들어간 비밀번호를 막는다 */
export function validatePassword(pw: string, email?: string | null): string | null {
  if (pw.length < MIN_PASSWORD) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다`;
  if (pw.length > 72) return "비밀번호는 72자 이하여야 합니다";
  // 사용 가능 문자: 영문·숫자·특수문자(공백·한글 제외, 키보드의 일반 기호)
  if (!/^[!-~]+$/.test(pw)) return "비밀번호는 영문, 숫자, 특수문자(!@#$% 등)만 쓸 수 있어요 (공백·한글 제외)";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "비밀번호에 영문과 숫자를 모두 포함해 주세요";
  if (/(.)\1{3,}/.test(pw)) return "같은 문자를 4번 이상 연속해서 쓸 수 없어요";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && pw.toLowerCase().includes(local)) return "이메일 아이디가 포함된 비밀번호는 쓸 수 없어요";
  return null;
}

/** 생년월일(YYYY-MM-DD) 기준 만 나이 (만 14세 이상 확인용) */
export function ageOf(birth: string, today = new Date()): number {
  const [y, m, d] = birth.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}
