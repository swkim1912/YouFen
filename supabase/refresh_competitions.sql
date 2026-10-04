-- 협회 대회 결과(https://fencing.sports.or.kr/game/compListView) → public 대회 테이블 갱신 절차
-- 실행은 Supabase SQL 에디터(또는 MCP execute_sql)에서 순서대로.
-- 테이블/함수는 migration create_competition_tables / create_comp_scrape_functions / create_build_comp_function /
-- comp_scrape_list_and_types / comp_scrape_list_rowwise / create_club_core_lookup / comp_ed_groups_and_bronze 로 만들어져 있다.
-- build_comp / scrape_comp_event / scrape_comp_ed 는 이후 여러 번 패치됨 — 최종 정의는 DB 의 private.* 함수가 기준.
--
-- ※ 협회 선수번호(plyCd = private.players.kff_no)는 private.athlete_keys 에만 둔다. public 으로 내보내지 않는다.
-- ※ 협회 서버 부담을 줄이려고 요청 사이 0.3초 대기. 종목 1개 약 5초 → 한 번에 20~40개씩, 최대 4개 병렬(hashtext(id) % 4)로 호출.
-- ※ 개인전 '(개)' 종목만 수집한다. 단체전 '(단)' 은 경기 형식이 달라 아직 미대응.
--   개인전 결과는 대회 유형과 무관하게 eventTypeCd=KH090102 로 조회해야 한다(소년체전은 대회 유형이 KH090103).

-- 0) 대회 목록 수집: 해당 날짜 이후 대회를 competitions 에 등록 (대회 목록 페이지 1~40, 행 단위 파싱)
select private.scrape_comp_list('2022-01-01');

-- 1) 대회별 세부종목 등록 (개인전만). 대회 유형(event_type_cd)도 저장
select count(*) comps, sum(private.scrape_comp_events(id)) events
from (select id from public.competitions where start_date >= '2022-01-01' order by id) x;

-- 2) 종목별 원문 수집 (최종순위 / 예선 뿔 / 본선 ED). 아직 안 받은 종목만 — 0 이 될 때까지 반복.
--    병렬로 돌릴 땐 abs(hashtext(e.id)) % 4 = 0..3 조건을 추가해 4개 호출로 나눈다.
select count(*) done from (
  select private.scrape_comp_event(competition_id, id)
  from (select e.id, e.competition_id from public.comp_events e
         where not exists (select 1 from private.comp_raw r where r.event_id = e.id and r.kind = 'final')
         order by e.id limit 30) x) y;

-- 3) ED 그룹 재수집: 전문선수 대회는 ED 가 2단계(그룹 A=예선 엘리미나시옹 EDQ, B=본선 ED), 유소년 선발전은 A=본선, B=3·4위전.
--    scrape_comp_event 는 그룹 A 만 받으므로, 종목의 ED 경기 수가 맞지 않으면 아래로 전체 그룹을 다시 받는다.
-- select private.scrape_comp_ed('COMPM00724', 'COMPS000000000004210');

-- 4) 클럽 이름 조회표 갱신 (clubs / club_teams 가 바뀐 뒤에만)
-- select private.refresh_club_core();

-- 5) 정규화: 종목 메타 + 선수 생성(선수번호 기준) + 참가 기록 + 예선/예선ED/본선ED 경기 (몇 번 실행해도 같은 결과)
select count(*) from (select private.build_comp(id) from public.competitions order by id) x;

-- 검증 (모두 0 이어야 함; 결승 없는 종목 2개는 ED 없이 순위만 있는 경우)
-- · 본선 ED 경기 수 = 본선 참가자 수 − 1 (3·4위전 제외)
-- · 챔피언(final_rank=1) = 본선 ED 결승 승자
-- with edm as (select * from public.comp_matches where stage = 'ED' and not third_place),
--      ed as (select event_id, count(*) m from edm group by event_id),
--      pl as (select event_id, count(distinct a) n from (select event_id, a_athlete a from edm union select event_id, b_athlete from edm) u group by event_id)
-- select count(*) from ed join pl using (event_id) where m <> n - 1;
-- select count(*) from public.comp_entries e join edm m on m.event_id = e.event_id and m.round_size = 2 where e.final_rank = 1 and m.winner <> e.athlete_id;
