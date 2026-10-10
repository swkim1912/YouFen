-- 보안 강화 4차 (2026-10-10, 브랜치 security/hardening-2) — 두 부분으로 나눠 적용한다.
--
-- ── ① 바로 적용 (마이그레이션 39 `fix_clean_functions_search_path`) ──────────────────────────────
-- 입력값 검사 함수 두 개에 검색 경로(search_path)를 고정한다(Supabase 보안 점검 '검색 경로 고정 누락').
-- 검색 경로가 정해져 있지 않으면, 함수를 부른 쪽의 설정에 따라 같은 이름의 다른 함수가 대신 불릴 여지가 있다.
-- 두 함수는 기본 내장 함수(btrim·char_length·jsonb_* 등)만 써서 빈 경로('')여도 그대로 동작한다(내장 함수는 항상 찾음).
alter function private.market_clean(text, jsonb) set search_path = '';
alter function private.op_clean(jsonb) set search_path = '';

-- ── ② 배포 "뒤에" 적용 (마이그레이션 40 `revoke_email_available`) ─────────────────────────────────
-- 이메일 가입 여부 확인 함수를 비로그인·로그인 회원 모두 못 부르게 한다(누구나 특정 이메일이 유펜 회원인지 알아낼 수 있던 문제).
-- 가입 화면은 이제 이 함수를 쓰지 않고, 가입 요청(봇 확인 필요) 결과로 중복을 알아낸다(src/components/auth/SignupForm.tsx).
-- 먼저 실행하면 아직 옛 코드로 도는 운영 사이트의 가입 2단계가 '중복 확인에 실패했습니다'로 막히므로
-- 이 브랜치가 main 에 합쳐져 Vercel 배포가 끝난 뒤 실행한다.
--
-- revoke execute on function public.email_available(text) from public, anon, authenticated;
--
-- 확인(false 여야 함):
-- select has_function_privilege('anon', 'public.email_available(text)', 'execute'),
--        has_function_privilege('authenticated', 'public.email_available(text)', 'execute');
