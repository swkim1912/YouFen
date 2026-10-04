// 약관·방침 공통 상수. 약관 내용을 고치면 CONSENT_VERSION 을 새 날짜로 올린다(가입 시 동의한 버전이 profiles.consent_version 에 기록된다).
// 버전을 올려도 기존 회원에게 재동의를 요구하려면 AppShell 의 ConsentGate 가 비교하는 값(CONSENT_VERSION)이 다르면 다시 묻는 방식으로 확장할 수 있다.
export const CONSENT_VERSION = "2026-10-05.2"; // 10-05: 처리방침에 Cloudflare(자동가입 방지)·Gmail 메일 발송·선수 연결 공개 범위·요청 횟수 제한 추가, 회원 탈퇴 직접 가능 / .2: 클럽 마크 신청·기록지 공동 편집의 수집 항목·보관 기간 추가(기존 회원 재동의)
export const LEGAL_UPDATED = "2026년 10월 5일";
export const SERVICE_NAME = "유펜(YouFen)";
/** 운영자 표기. 실제 운영 주체(개인 또는 사업자) 정보로 바꿔 쓸 것 */
export const OPERATOR = "유펜(YouFen) 운영자";
/** 비밀번호 최소 길이(Supabase 대시보드 Authentication > Password 의 최소 길이도 같은 값으로 맞출 것) */
export const MIN_PASSWORD = 8;
