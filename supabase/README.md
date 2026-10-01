# Supabase 설정 기록

DB 스키마는 Supabase 프로젝트(`hocesfgcueioartmvbcp`)에 마이그레이션으로 적용되어 있습니다.
적용된 마이그레이션(이름 순서):

1. `youfen_initial_schema` — `profiles`, `game_records`, `feedback_notes` 테이블, RLS 정책, 닉네임/점수 검증, 수락·거절·취소·만료 함수
2. `harden_function_grants` — 함수 실행 권한 정리, search_path 고정
3. `public_read_and_hide_private_columns` — 비로그인 읽기 허용, `email`/`birth_date` 컬럼 비공개, `get_my_profile()`
4. `email_available_rpc` — 가입 시 이메일 중복 확인

전체 SQL은 Supabase 대시보드의 Database → Migrations 에서 확인하거나
`supabase db pull` 로 이 폴더(`supabase/migrations`)에 내려받을 수 있습니다.
