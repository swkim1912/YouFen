-- 보안 강화 2단계 (배포 후 적용) — 브랜치 security/hardening 의 화면 코드가 Vercel 에 배포된 "뒤에" 실행한다.
-- 먼저 실행하면 아직 옛 코드로 도는 사이트의 랭킹·대회·선수 화면과 회원 검색이 실패한다.
--
-- ① 대회·선수·랭킹 표를 API 로 직접 읽지 못하게 한다 → 화면은 data_* 조회 함수(정해진 범위 + 접속 IP 별 요청 제한)로만 읽는다.
--    (누군가 공개 키로 표 전체를 1000행씩 긁어 가는 것을 막음. 서버 함수·관리자 RPC 는 소유자 권한이라 영향 없음)
-- ② profiles 의 is_admin(관리자 계정 노출)·avatar_locked(제재 여부 노출)를 다른 사람이 못 읽게 한다.
--    내 값은 get_my_profile() 로 읽고, 관리자 확인은 is_admin_user() 가 한다.

revoke select on public.athletes, public.competitions, public.comp_events, public.comp_entries, public.comp_matches,
  public.event_scores, public.pool_scores from anon, authenticated;

revoke select (is_admin, avatar_locked) on public.profiles from anon, authenticated;

-- 확인(둘 다 false 여야 함):
-- select has_table_privilege('anon', 'public.comp_matches', 'select'), has_column_privilege('anon', 'public.profiles', 'is_admin', 'select');
