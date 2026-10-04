-- 점수제도 시뮬레이션 (docs/SCORING.md 의 수치를 재현하는 SQL). 운영 테이블이 아니라 임시 스키마 scoring_sim 에서만 실행한다.
-- 끝나면: drop schema scoring_sim cascade;   (API 에 노출되지 않는 스키마이고, 협회 선수번호는 쓰지 않는다)
-- 기준 시점은 2026-10 (아래 2026*12+10). 다시 돌릴 땐 이 값을 오늘 연·월로 바꾼다.

create schema if not exists scoring_sim;
revoke all on schema scoring_sim from anon, authenticated;

-- 1) 종목별 대회 점수 E (소규모 보정 전). ED 단계 사다리: EDQ(예선 ED) → ED(본선) 순, 큰 라운드 → 작은 라운드. 3·4위전 제외.
--    steps = (선수가 치른 가장 높은 단계 번호) + (그 경기를 이겼으면 1). 부전승은 통과로 인정. 우승 = 사다리 길이 + 1.
drop table if exists scoring_sim.event_scores;
create table scoring_sim.event_scores as
with rung as (
  select event_id, stage, round_size, row_number() over (partition by event_id order by (stage='ED'), round_size desc) idx
  from (select distinct event_id, stage, round_size from public.comp_matches where stage in ('ED','EDQ') and not third_place) d),
p as (select event_id, max(idx) P from rung group by event_id),
last_m as (
  select distinct on (event_id, athlete) event_id, athlete, idx, won from (
    select m.event_id, m.a_athlete athlete, r.idx, (m.winner=m.a_athlete) won from public.comp_matches m join rung r on r.event_id=m.event_id and r.stage=m.stage and r.round_size=m.round_size where m.stage in ('ED','EDQ') and not m.third_place
    union all
    select m.event_id, m.b_athlete, r.idx, (m.winner=m.b_athlete) from public.comp_matches m join rung r on r.event_id=m.event_id and r.stage=m.stage and r.round_size=m.round_size where m.stage in ('ED','EDQ') and not m.third_place) u
  order by event_id, athlete, idx desc, won desc),
n_ev as (select event_id, count(*) filter (where poule_rank is not null) n_poule, count(*) n_all from public.comp_entries group by event_id)
select e.event_id, e.athlete_id, ev.competition_id, c.start_date, c.name comp_name, ev.division, ev.gender, ev.weapon,
  n.n_all n_entrants, n.n_poule, e.poule_rank, e.final_rank,
  case when e.poule_rank is not null and n.n_poule > 1 then 100.0*(n.n_poule - e.poule_rank)/(n.n_poule - 1) end poule_score,
  case when p.P is not null then 100.0*coalesce(lm.idx + case when lm.won then 1 else 0 end, 0)/(p.P+1) end ed_score
from public.comp_entries e
join public.comp_events ev on ev.id=e.event_id join public.competitions c on c.id=ev.competition_id
join n_ev n on n.event_id=e.event_id
left join p on p.event_id=e.event_id
left join last_m lm on lm.event_id=e.event_id and lm.athlete=e.athlete_id;

-- 2) 대회 점수 E = 0.2·뿔 + 0.8·ED (한쪽만 있으면 그 점수), 풀 구분(탭·종별), 대회 월
--    탭: 클럽·동호인 대회의 엘리트부 = 엘리트, 그 외 클럽·동호인 대회 = 동호인, 나머지(협회·연맹 대회) = 전문선수
--    종별: 초등/중등/고등, 고등부 초과(일반·대학·엘리트·오픈·20세이하)는 전부 일반
alter table scoring_sim.event_scores add column event_score numeric, add column tab text, add column age text, add column ym int;
update scoring_sim.event_scores set
  event_score = case when poule_score is not null and ed_score is not null then 0.2*poule_score + 0.8*ed_score else coalesce(ed_score, poule_score) end,
  tab = case when comp_name ~ '생활체육|클럽|동호인' then (case when division='엘리트부' then '엘리트' else '동호인' end) else '전문선수' end,
  age = case when division like '초등부%' or division in ('9세이하부','11세이하부','12세이하부') then '초등'
             when division='중등부' or division in ('13세이하부','15세이하부','16세이하부') then '중등'
             when division='고등부' or division in ('17세이하부','18세이하부') then '고등'
             else '일반' end,
  ym = extract(year from start_date)*12+extract(month from start_date);
create index on scoring_sim.event_scores(athlete_id);

-- 3) 선수×풀 집계: 소규모 보정 f(N)=min(1,log2(N)/4), 12개월 반감 가중평균 m, 유효 대회 수 n_eff, 24개월 출전 수 ev24
drop table if exists scoring_sim.pool_base;
create table scoring_sim.pool_base as
with e as (select s.*, event_score*least(1, ln(greatest(n_entrants,2))/ln(2)/4.0) sc,
   exists(select 1 from private.athlete_keys kk join private.players pl on pl.kff_no=kk.kff_no where kk.athlete_id=s.athlete_id) in_ledger
   from scoring_sim.event_scores s where event_score is not null)
select athlete_id, tab, age, weapon, gender, in_ledger, count(*) n_events,
  count(*) filter (where ym >= 2026*12+10-24) ev24,
  sum(power(0.5,(2026*12+10-ym)/12.0)) n_eff,
  sum(sc*power(0.5,(2026*12+10-ym)/12.0))/sum(power(0.5,(2026*12+10-ym)/12.0)) m
from e group by 1,2,3,4,5,6;

-- 4) 대회 점수 T = 10×[(n·m + 1·20)/(n+1) + 10×(1−0.7^n)] 와 티어 분포
--    배치 = 원장 등록 + 24개월 2회 이상. 챌린저 풀 1~5위, 마스터 6~20위(점수 하한 없음), 그 아래는 컷 450/350/250/150
with y as (select b.*, 10*((b.n_eff*b.m + 20)/(b.n_eff+1) + 10*(1-power(0.7,b.n_eff))) yp from scoring_sim.pool_base b where b.in_ledger and b.ev24>=2),
r as (select *, row_number() over (partition by tab, age, weapon, gender order by yp desc) rk from y),
t as (select case when rk<=5 then '챌린저' when rk<=20 then '마스터' when yp>=450 then '다이아몬드'
                  when yp>=350 then '플래티넘' when yp>=250 then '골드' when yp>=150 then '실버' else '브론즈' end tier from r)
select tier, count(*) n, round(100.0*count(*)/sum(count(*)) over (),1) pct from t group by tier;

-- 5) 눈금 검증: 각 경기 이전 대회 기록만으로 계산한 점수 차이 d 와 승패의 로지스틱 기울기 c 를 격자 탐색 (c ≈ 0.045~0.065 per 점).
--    prior(athlete, competition) = 그 대회 이전 기록의 n_eff, 가중평균. 쿼리가 무거우므로 d 를 정수로 묶어서 센다.
-- 6) Elo 백테스트: 대회 경기를 시간순으로 돌리며 각 경기 직전 점수로 승패를 예측해 평균 손실을 계산(동전 던지기 = 0.693).
--    함수 scoring_sim.elo_backtest(계열, 시작일, K, 득점비율 반영, 나누는 수, 시작점, 신규 K 배수)가 docs/SCORING.md §4.3 의 표를 만들었다.
