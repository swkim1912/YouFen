-- 점수 재계산 절차 (docs/SCORING.md 의 대회 점수 부분을 DB 에 구현한 것).
-- 테이블/함수는 migration create_score_tables / create_refresh_scores 로 만들어져 있고, refresh_scores 는 이후 두 번 패치됨
-- seasons_in_pool_scores 로 시즌(2년 창)별 계산으로 재작성됨. 최종 정의는 DB 의 private.refresh_scores 가 기준.
-- 결과: public.seasons(시즌 목록), public.pool_scores(시즌·풀별 점수·순위·티어), public.event_scores(종목별 대회 점수).
--
-- ※ 화면(랭킹·대회·선수 프로필)은 이 함수가 채운 public.event_scores / public.pool_scores 와
--   public.comp_events(tab, age, start_date, winner_athlete_id, entrants), public.athletes.is_registered 만 읽는다.
-- ※ 협회 선수번호·생년월일은 이 테이블들에 없다. 원장 등록 여부(is_registered)만 boolean 으로 노출한다.

-- 1) 새 대회를 수집·정규화한 뒤 (supabase/refresh_competitions.sql 의 build_comp) 점수를 다시 만든다. 몇 번 실행해도 같은 결과.
--    인자는 '기준일'(기본 오늘): 날짜 가중치(12개월 반감)와 최근 24개월 배치 판정의 기준이 된다.
select private.refresh_scores();
-- select private.refresh_scores('2026-10-04');

-- 2) 컷·파라미터를 바꾸고 싶으면 score_config 값을 수정한 뒤 1)을 다시 실행한다. 예: 다이아 컷을 500 으로
-- update public.score_config set value = 500 where key = 'cut_diamond';

-- 3) 검증: 현재 시즌 티어 분포 (브론즈+실버가 40% 아래여야 한다. 2025-26 기준 37.3%)
select tier, count(*) n, round(100.0 * count(*) / sum(count(*)) over (), 1) pct
  from public.pool_scores where placed and season = (select season from public.seasons where is_current)
 group by tier order by min(tour_score) desc;
