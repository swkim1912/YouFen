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
9. `create_competition_tables` / `create_comp_scrape_functions` / `create_build_comp_function` — 대회 결과 테이블(`competitions`, `comp_events`, `athletes`, `comp_entries`, `comp_matches`, 읽기 공개 RLS)과 내부 테이블(`private.athlete_keys`, `private.comp_raw`), 수집·변환 함수 (`build_comp` 는 이후 패치 2회 — 최종 정의는 DB 기준)

10. `comp_scrape_list_and_types` / `comp_scrape_list_rowwise` / `create_club_core_lookup` / `comp_ed_groups_and_bronze` — 대회 목록 수집, 개인전 종목 등록, 클럽 이름 조회표(`private.club_core`), ED 그룹(`EDQ`) 및 3·4위전(`third_place`) 컬럼
11. `create_score_tables` / `create_refresh_scores` — 점수 결과 테이블(`score_config`, `event_scores`, `pool_scores`, `comp_events.tab/age/start_date/winner_athlete_id`, `athletes.is_registered`)과 계산 함수 `private.refresh_scores()` (절차: `supabase/refresh_scores.sql`). 읽기 전용 공개 RLS.
12. `season_rankings` / `refresh_scores_seasons` — 시즌(2년 창) 테이블 `seasons`, `pool_scores.season`(기본키 포함, `ev24` 제거), `refresh_scores` 시즌별 재작성.
13. `player_registrations_by_year` / `scrape_player_year_rowwise` / `athlete_reg_years_and_season_registration` — 연도별 협회 선수등록(`private.player_regs`, `private.scrape_player_year`), `athletes.reg_years`, `private.sync_athlete_registration()`, 시즌 창 안 등록자만 랭킹에 넣도록 `refresh_scores` 패치.
14. `profiles_club_id` — `profiles.club_id`, 가입 트리거가 club_id 수신.
15. `athlete_linking` — `athlete_links`, `private.athlete_sports_no`, `link_attempts`, `athlete_claim_requests`, RPC `link_athlete`/`unlink_athlete`, `athletes.is_linked`.
16. `avatars_moderation_reports_club_image` — 버킷 `avatars`(쓰기 정책 없음), `guard_avatar_url` 트리거, `avatar_reports`/`avatar_uploads`, `profiles.avatar_locked`, `clubs.image_url`, RPC `admin_remove_avatar`.
18. `profiles_public_columns_grant_and_no_example` — `profiles.club_id/avatar_locked` 공개 컬럼 SELECT 권한, 연결 RPC 메시지에서 번호 예시 제거.
19. `athletes_linked_profile_id` — `athletes.linked_profile_id`(연결 회원 id, 트리거 유지).
20. `consent_and_support_tickets` — `profiles.consent_version/consent_at/age14_confirmed`(+`profiles_guard`·`handle_new_user` 갱신, 14세 미만 차단), RPC `record_consent`, `support_tickets`(RLS 본인·관리자) + RPC `submit_support`(속도 제한).
21. `admin_notices_jobs_overview` — `is_admin_user()`, `notices`(RLS), `admin_jobs`(RLS 관리자 읽기), RPC `admin_enqueue_job`/`admin_cancel_job`/`admin_overview`.
22. `admin_refresh_functions` — 증분 갱신 함수(`private.team_page`/`player_page`/`assign_club`/`merge_new_players`/`event_changed`/`job_step`/`advance_job`).
23. `admin_job_cron` — pg_cron 설치, 20초마다 `private.advance_job()` 호출.
24. `admin_management_rpcs` — `admin_audit`, `club_image_requests`, 버킷 `club-images`, RPC `admin_members/reports/claims/clubs/club_image_requests/audit_recent/merge_clubs/unlink_athlete` 등.
25. `admin_overview_open_counts` — 현황 숫자를 '처리할 일' 기준으로.
17. `avatar_vision_calls` — Vision 호출 기록(월·일 한도 계산용, 서버만 접근).
26. `security_hardening_1` (2026-10-05, 출시 전 보안 점검) — 선수 연결은 이메일 인증 계정만, 클럽 연락처(`phone/phones`)·`club_teams` 비공개(관리자는 `admin_clubs`), 쓰지 않는 권한(TRUNCATE·비로그인 쓰기 등) 회수, `profiles` 수정 가능 열 제한(이메일·관리자·동의 열 불가), 관리자 정책을 `is_admin_user()` 로, 전적 비공개를 RLS 로(`records_visible`), 글자 수 제약(소속 60·지역 20·상대 이름 30·대회명 60·라운드 30·노트 300·노트 제목 50), 하루 생성 한도 트리거(경기 기록 50건·수락 대기 30건/같은 상대 10건·노트 50개·연결 문의 대기 3건/하루 5건·사진 신고 하루 20건, 한국 날짜 기준), `reserve_vision_call`(Vision 한도 확인+기록을 잠금 안에서 한 번에), 지도자 승인제(`profiles.leader_status/leader_requested_at`, `profiles_guard`, RPC `admin_leaders`/`admin_set_leader`), `admin_members` 이메일을 `auth.users` 기준으로, 저장소 목록 조회 정책 삭제, 고객지원 접수함 상태 변경 권한(그동안 저장 실패하던 문제).
27. `public_data_rpcs_throttle` / `fix_throttle_ip_ambiguity` — 수집 데이터 조회 함수 `data_ranking`/`data_comp_events`/`data_competition`/`data_event`/`data_athlete`/`data_search_athletes`/`data_athletes_of_members`/`my_linked_athletes` 와 접속 IP 별 요청 제한 `private.throttle()`(분당 120·시간당 2,000회 초과 시 429, 기록 `private.api_hits` 는 10분마다 2시간 지난 것 삭제 — pg_cron `api-hits-cleanup`).
28. `security_hardening_2` (2026-10-05 배포 후 적용 완료) — `supabase/security_hardening_2.sql`. 대회·선수·랭킹 표의 직접 조회 권한 회수(위 조회 함수로만 읽게) + `profiles.is_admin/avatar_locked` 비공개. **새 화면 코드가 배포된 뒤에 실행해야 한다**(먼저 실행하면 옛 화면의 조회가 실패).
29. `search_athletes_exact_first` (2026-10-05) — `data_search_athletes` 정렬을 이름 정확히 일치 → 앞부분 일치 → 포함 순으로(흔한 이름이 결과 한도에 잘리던 문제). 회원 탈퇴는 DB 변경 없이 서버 API `/api/account` 가 처리(연쇄 삭제 규칙 사용).
30. `security_hardening_3_created_at` (2026-10-05 재점검) — 하루 생성 한도 우회 차단: 일반 사용자 요청에서 `game_records`·`feedback_notes`·`athlete_claim_requests`·`avatar_reports` 의 `created_at` 을 만들 때는 지금 시각, 수정할 때는 원래 값으로 고정(트리거 `records_guard`/`notes_guard`(수정에도 실행)/`claims_guard`/`reports_guard`). `email_available`·`nickname_available` 에 접속 IP 별 요청 제한(`private.throttle`, VOLATILE plpgsql 로 변경).
31. `collab_sheets_and_club_mark_requests` (2026-10-05) — ① 기록지 공동 편집: `shared_sheets`(내용 jsonb·버전, 64KB) / `shared_sheet_members`, 참여자만 읽기(RLS, Realtime postgres_changes 도 참여자에게만), 쓰기는 RPC `sheet_create`(하루 20개)·`sheet_join`(참여자 30명)·`sheet_patch`(경로별 설정·삭제를 서버에서 차례로 적용), `supabase_realtime` 발행에 추가, pg_cron `shared-sheets-cleanup`(매일, 5일 동안 수정 없는 기록지 삭제 — 마이그레이션 `shared_sheets_cleanup_5_days` 로 7일→5일). ② 클럽 마크 신청: `club_image_requests.reason`(3~500자)·`consented_at`, `admin_club_image_requests` 가 사유·동의 시각 반환.
32. `link_athlete_one_per_account` (2026-10-05) — 선수 연결 개수: 학부모·지도자만 최대 10명, 그 외 신분은 계정 하나에 1명(이미 여러 명 연결된 계정은 그대로, 새 연결만 막음).

## 대회 결과 데이터
- 수집/갱신 절차: `supabase/refresh_competitions.sql` (대회 목록 → 종목 등록 → 종목별 원문 수집 → `build_comp` 정규화). 현재 2022-01 ~ 2026-09 개인전 96개 대회(95개 결과): 종목 1,607개(결과 있음), 선수 7,993명, 참가 75,066건, 예선 198,884경기, 예선ED 6,840경기, 본선ED 49,629경기. 단체전은 미수집.
- 선수 동일성은 협회 선수번호 기준이며, 번호는 `private.athlete_keys` 에만 있다(public 테이블에는 없음).

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
