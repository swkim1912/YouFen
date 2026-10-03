-- 협회 선수 목록(https://fencing.sports.or.kr/player/profList) → private.players 갱신 절차
-- 실행은 Supabase SQL 에디터(또는 MCP execute_sql)에서 순서대로. 함수/테이블은 migration
-- create_private_players / enable_http_extension / private_functions_search_path 로 이미 만들어져 있음.
--
-- ※ private 스키마는 API 에 노출되지 않는다. 협회 선수번호·생년월일은 내부 전용이며 화면/API 로 내보내지 않는다.
-- ※ 협회 서버 부담을 줄이기 위해 한 번에 80~100페이지씩 나눠 실행 (요청 사이 0.4초 대기). 전체 448페이지(10명/페이지).

-- 1) 목록 페이지 원문 수집 (페이지 449 이후는 마지막 페이지가 반복되므로 448까지만 사용)
select private.scrape_player_pages(1, 100);
select private.scrape_player_pages(101, 200);
select private.scrape_player_pages(201, 300);
select private.scrape_player_pages(301, 400);
select private.scrape_player_pages(401, 448);

-- 2) 파싱 + 소속팀(clubs) 연결 + 협회 선수번호 기준 upsert
--    · 같은 선수번호가 두 줄로 나오는 경우(실제 중복 등록)는 번호가 작은 줄만 사용
--    · 생년월일 YYMMDD 는 미래 연도면 19xx 로 보정 (private.safe_birth)
--    · 소속 연결: 정규화한 이름이 같은 클럽이 같은 시/도에 1개면 연결, 시/도가 달라도 전체에서 1개면 연결, 여러 개면 ambiguous
with parsed as (
  select m[1]::int list_no, m[2] masked_name, m[3] kff_no, m[4] birth_raw, m[5] gender,
         nullif(trim(m[6]),'-') weapon, trim(m[7]) club_raw, nullif(trim(m[8]),'') sido
  from private.player_raw_pages,
  lateral regexp_matches(html, $re$<td>([0-9]+)</td>\s*<td>([^<]*)</td>\s*<!--\s*<a[^>]*view\('([0-9]+)'\)[^>]*>\s*</a>\s*-->\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td class="border-right">([^<]*)</td>$re$, 'g') m
  where page <= 448
), uniq as (
  select distinct on (kff_no) * from parsed order by kff_no, list_no
), names as (
  select private.core_name(t.raw_name) core, t.club_id, c.sido from public.club_teams t join public.clubs c on c.id = t.club_id
  union
  select private.core_name(c.name), c.id, c.sido from public.clubs c
), matched as (
  select u.*,
    (select array_agg(distinct n.club_id) from names n where n.core = private.core_name(u.club_raw) and n.core <> '' and n.sido = u.sido) same_sido,
    (select array_agg(distinct n.club_id) from names n where n.core = private.core_name(u.club_raw) and n.core <> '') any_sido
  from uniq u
)
insert into private.players (kff_no, masked_name, gender, birth_raw, birth_date, main_weapon, club_raw, club_id, club_match, sido, kff_list_no)
select kff_no, masked_name, gender, birth_raw, private.safe_birth(birth_raw), weapon, club_raw,
  case when cardinality(coalesce(same_sido,'{}'))=1 then same_sido[1]
       when cardinality(coalesce(same_sido,'{}'))=0 and cardinality(coalesce(any_sido,'{}'))=1 then any_sido[1] end,
  case when cardinality(coalesce(same_sido,'{}'))=1 or (cardinality(coalesce(same_sido,'{}'))=0 and cardinality(coalesce(any_sido,'{}'))=1) then 'exact'
       when cardinality(coalesce(same_sido,'{}'))>1 or cardinality(coalesce(any_sido,'{}'))>1 then 'ambiguous' else 'none' end,
  sido, list_no
from matched
on conflict (kff_no) do update set
  masked_name = excluded.masked_name, gender = excluded.gender, birth_raw = excluded.birth_raw, birth_date = excluded.birth_date,
  main_weapon = excluded.main_weapon, club_raw = excluded.club_raw, club_id = excluded.club_id, club_match = excluded.club_match,
  sido = excluded.sido, kff_list_no = excluded.kff_list_no, updated_at = now();

-- 3) 임시 원문 정리
truncate private.player_raw_pages;
