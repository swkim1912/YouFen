# Supabase 설정 기록

DB 스키마는 Supabase 프로젝트(`hocesfgcueioartmvbcp`)에 마이그레이션으로 적용되어 있습니다.
적용된 마이그레이션(이름 순서):

1. `youfen_initial_schema` — `profiles`, `game_records`, `feedback_notes` 테이블, RLS 정책, 닉네임/점수 검증, 수락·거절·취소·만료 함수
2. `harden_function_grants` — 함수 실행 권한 정리, search_path 고정
3. `public_read_and_hide_private_columns` — 비로그인 읽기 허용, `email`/`birth_date` 컬럼 비공개, `get_my_profile()`
4. `email_available_rpc` — 가입 시 이메일 중복 확인
5. `relax_score_valid_allow_below_target` — 승자가 목표 점수에 못 미쳐도 저장 가능
6. `remove_university_division` — 종별에서 대학부 제거
7. `create_clubs_and_club_teams` — 협회 팀 연동용 `clubs`(동일 클럽 묶음) / `club_teams`(협회 등록 팀) 테이블, 읽기 공개 RLS
8. `enable_http_extension` / `create_private_players` / `private_functions_search_path` — 협회 선수 원장(`private.players`) 및 수집·파싱 함수

## 협회 선수 데이터 (private.players) — 내부 전용
- `private` 스키마는 API(PostgREST)에 노출되지 않고, 테이블은 RLS 활성화 + 정책 없음 + 권한 회수 상태. 협회 선수번호(`kff_no`)·생년월일·모자이크 이름은 **어떤 화면/API 로도 사용자에게 내보내지 않는다.**
- 현재 4,477명(남 2,564 / 여 1,913), 전원 `clubs` 에 연결(`club_match='exact'`). 협회 목록의 '주종목'은 전부 '-' 라서 `main_weapon` 은 비어 있음.
- 수집/갱신 절차: `supabase/refresh_players.sql` (DB 의 `http` 확장으로 협회 서버에서 직접 수집 → 파싱 → upsert).
- 선수 데이터는 저장소(JSON 등)에 올리지 않는다.

## 협회 소속팀 데이터 (clubs / club_teams)
- 수집: `python scripts/scrape_kff_teams.py` → `data/kff_teams_raw.json` (1977팀)
- 묶기: `python scripts/cluster_clubs.py` → `data/clubs.json`(779클럽), `data/clubs_review.json`(사람이 확인할 후보)
- 적재: 위 JSON을 SQL `insert ... select ... from unnest(string_to_array($$...$$, E'
'))` 로 DB에 넣었고, 행 수와 내용 md5를 로컬 JSON과 대조해 검증함.
  재적재가 필요하면 `truncate club_teams, clubs cascade` 후 같은 방식으로 다시 넣으면 된다.

전체 SQL은 Supabase 대시보드의 Database → Migrations 에서 확인하거나
`supabase db pull` 로 이 폴더(`supabase/migrations`)에 내려받을 수 있습니다.
