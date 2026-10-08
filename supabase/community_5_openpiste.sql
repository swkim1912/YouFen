-- 커뮤니티 5단계 오픈피스트 (마이그레이션 37 `community_openpiste` + `community_openpiste_admin`(신고·관리자 확장부터 뒷부분), 2026-10-09, 브랜치 feature/community)
-- 기획: docs/COMMUNITY.md 5장. 1~4단계(카드·알림·신고·차단·정지·매일 정리) 위에 올린다.
-- 표: openpiste_posts(모집글) / openpiste_participants(참가 신청) / openpiste_messages(참가자 방 메시지) / openpiste_alerts(새 모집 알림 종목·지역)
-- 원칙
--  · 모집글은 선수를 연결한 회원(학부모·지도자 포함)만 쓸 수 있고, 관리자 승인 후 게시된다. 게시 중인 글의 수정도 승인이 필요하며
--    승인 전까지는 기존 내용이 그대로 보인다(수정안은 pending_edit 에 따로 둔다).
--  · 오프라인 모임이라 주최자·참가자는 **유펜 프로필**로 보인다(기획서 0-1 예외 — 화면에서 미리 안내).
--  · 참가 신청은 로그인 회원 누구나(정지 중 제외). 정원 = 신청 인원(주최자 제외). 오픈채팅방 링크는 주최자·참가자에게만 보인다.
--  · 모집 마감·취소·종료(시작 + 진행 시간이 지남)된 글은 목록에서 빠진다(주최자·참가자는 '내 오픈피스트'에서 계속 본다).
--  · 표는 RPC 전용(RLS 켜고 정책 없음). 참가자 방은 주최자·참가자만, 화면이 열려 있는 동안 몇 초마다 새 메시지를 가져온다(Realtime 미사용).

-- ───────────────────────── 표 ─────────────────────────
create table public.openpiste_posts (
  id bigint generated always as identity primary key,
  host_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 50),
  weapon text not null check (weapon in ('에페','플뢰레','사브르')),
  levels text[] not null check (cardinality(levels) between 1 and 4 and levels <@ array['입문','초급','중급','상급']),
  place text not null check (char_length(btrim(place)) between 2 and 60),
  region text not null check (region in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주')),
  starts_at timestamptz not null,
  duration_h int not null check (duration_h between 1 and 6),          -- 진행 시간(시간). 6 = '6시간 이상'
  ends_at timestamptz not null,                                         -- starts_at + duration_h 시간(자동 종료 기준)
  capacity int not null check (capacity between 1 and 100),             -- 정원(주최자 제외 신청 인원)
  fee int not null default 0 check (fee between 0 and 1000000),         -- 참가비(원, 0 = 무료)
  body text not null default '' check (char_length(body) <= 2000),
  chat_url text check (char_length(chat_url) <= 200 and chat_url ~ '^https://open\.kakao\.com/[A-Za-z0-9/_?=&.-]+$'), -- 카카오톡 오픈채팅 링크만
  status text not null default 'pending'
    check (status in ('pending','open','rejected','closed','cancelled','ended','hidden','deleted')),
  status_reason text,
  status_by uuid references public.profiles(id) on delete set null,
  pending_edit jsonb,                                                   -- 승인 대기 중인 수정안(정리된 값)
  edit_submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index openpiste_posts_list_idx on public.openpiste_posts (status, starts_at);
create index openpiste_posts_host_idx on public.openpiste_posts (host_id, created_at desc);
alter table public.openpiste_posts enable row level security;
revoke all on public.openpiste_posts from anon, authenticated;

create table public.openpiste_participants (
  post_id bigint not null references public.openpiste_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index openpiste_participants_user_idx on public.openpiste_participants (user_id, created_at desc);
alter table public.openpiste_participants enable row level security;
revoke all on public.openpiste_participants from anon, authenticated;

create table public.openpiste_messages (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.openpiste_posts(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  status_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index openpiste_messages_post_idx on public.openpiste_messages (post_id, id);
create index openpiste_messages_sender_idx on public.openpiste_messages (sender_id, created_at desc);
alter table public.openpiste_messages enable row level security;
revoke all on public.openpiste_messages from anon, authenticated;

-- 새 모집 알림: 고른 종목의 모집이 승인되면 알림(지역을 하나도 안 고르면 전국). 행이 없으면 알림 없음
create table public.openpiste_alerts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  weapons text[] not null default '{}' check (weapons <@ array['에페','플뢰레','사브르']),
  regions text[] not null default '{}' check (cardinality(regions) <= 17),
  updated_at timestamptz not null default now()
);
alter table public.openpiste_alerts enable row level security;
revoke all on public.openpiste_alerts from anon, authenticated;

revoke all on sequence public.openpiste_posts_id_seq, public.openpiste_messages_id_seq from anon, authenticated;

-- ───────────────────────── 도우미 ─────────────────────────
-- 입력값 검사(jsonb → 정리된 값). 잘못되면 'bad_input:<항목>'. 시작 시각은 30분 뒤 ~ 90일 안
create or replace function private.op_clean(d jsonb)
returns jsonb language plpgsql stable as $$
declare
  v_title text := btrim(coalesce(d->>'title', '')); v_place text := btrim(coalesce(d->>'place', ''));
  v_levels text[]; v_start timestamptz; v_dur int; v_cap int; v_fee int; v_url text := nullif(btrim(coalesce(d->>'chat_url', '')), '');
begin
  if char_length(v_title) not between 2 and 50 then raise exception 'bad_input:title'; end if;
  if coalesce(d->>'weapon', '') not in ('에페','플뢰레','사브르') then raise exception 'bad_input:weapon'; end if;
  begin
    select array_agg(distinct x order by x) into v_levels from jsonb_array_elements_text(d->'levels') x;
  exception when others then raise exception 'bad_input:levels';
  end;
  if v_levels is null or not (v_levels <@ array['입문','초급','중급','상급']) then raise exception 'bad_input:levels'; end if;
  if char_length(v_place) not between 2 and 60 then raise exception 'bad_input:place'; end if;
  if coalesce(d->>'region', '') not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') then
    raise exception 'bad_input:region';
  end if;
  begin
    v_start := (d->>'starts_at')::timestamptz; v_dur := (d->>'duration_h')::int; v_cap := (d->>'capacity')::int; v_fee := coalesce(nullif(d->>'fee', '')::int, 0);
  exception when others then raise exception 'bad_input:number';
  end;
  if v_start is null or v_start < now() + interval '30 minutes' or v_start > now() + interval '90 days' then raise exception 'bad_input:starts_at'; end if;
  if v_dur is null or v_dur not between 1 and 6 then raise exception 'bad_input:duration'; end if;
  if v_cap is null or v_cap not between 1 and 100 then raise exception 'bad_input:capacity'; end if;
  if v_fee not between 0 and 1000000 then raise exception 'bad_input:fee'; end if;
  if char_length(coalesce(d->>'body', '')) > 2000 then raise exception 'bad_input:body'; end if;
  if v_url is not null and (char_length(v_url) > 200 or v_url !~ '^https://open\.kakao\.com/[A-Za-z0-9/_?=&.-]+$') then raise exception 'bad_input:chat_url'; end if;
  return jsonb_build_object('title', v_title, 'weapon', d->>'weapon', 'levels', to_jsonb(v_levels), 'place', v_place, 'region', d->>'region',
    'starts_at', v_start, 'duration_h', v_dur, 'capacity', v_cap, 'fee', v_fee, 'body', btrim(coalesce(d->>'body', '')), 'chat_url', v_url);
end $$;

-- 신청 인원(주최자 제외)
create or replace function private.op_count(p_post bigint)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.openpiste_participants where post_id = p_post
$$;

-- 회원이 그 모집의 주최자 또는 참가자인지
create or replace function private.op_member(p_post bigint, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null and (exists (select 1 from public.openpiste_posts where id = p_post and host_id = p_uid)
                                or exists (select 1 from public.openpiste_participants where post_id = p_post and user_id = p_uid))
$$;

-- 목록·상세 공통 요약(jsonb). 진행 상태 phase: upcoming(시작 전) | live(진행 중) | over(끝남)
create or replace function private.op_json(p public.openpiste_posts, p_me uuid)
returns jsonb language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'weapon', p.weapon, 'levels', p.levels, 'place', p.place, 'region', p.region,
    'starts_at', p.starts_at, 'duration_h', p.duration_h, 'ends_at', p.ends_at, 'capacity', p.capacity, 'fee', p.fee,
    'count', private.op_count(p.id), 'status', p.status, 'created_at', p.created_at,
    'phase', case when now() < p.starts_at then 'upcoming' when now() < p.ends_at then 'live' else 'over' end,
    'is_mine', p.host_id = p_me,
    'joined', exists (select 1 from public.openpiste_participants x where x.post_id = p.id and x.user_id = p_me),
    'has_pending_edit', p.pending_edit is not null and p.host_id = p_me,
    'host', private.content_card(p.host_id, 'y', ''))
$$;

-- 새 모집 알림 보내기(승인될 때): 고른 종목 + (지역을 안 골랐거나 고른 지역)인 회원에게. 알림 끔·차단은 private.notify 가 거른다
create or replace function private.op_announce(p_post bigint)
returns void language plpgsql security definer set search_path = public, private as $$
declare p public.openpiste_posts; r record;
begin
  select * into p from public.openpiste_posts where id = p_post;
  if p.id is null or p.status <> 'open' or p.starts_at < now() then return; end if;
  for r in select a.user_id from public.openpiste_alerts a
            where p.weapon = any (a.weapons) and (cardinality(a.regions) = 0 or p.region = any (a.regions))
              and a.user_id is distinct from p.host_id loop
    perform private.notify(r.user_id, 'openpiste', '새 오픈피스트 모집: ' || left(p.title, 40),
      p.weapon || ' · ' || p.region || ' · ' || to_char(p.starts_at at time zone 'Asia/Seoul', 'MM.DD HH24:MI'), '/openpiste/' || p.id, p.host_id);
  end loop;
end $$;

-- 참가자 전원(+주최자 제외 여부)에게 알림
create or replace function private.op_notify_members(p_post bigint, p_kind text, p_title text, p_body text, p_except uuid default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare r record;
begin
  for r in select user_id from public.openpiste_participants where post_id = p_post and user_id is distinct from p_except loop
    perform private.notify(r.user_id, p_kind, p_title, p_body, '/openpiste/' || p_post);
  end loop;
end $$;

-- ───────────────────────── 회원 RPC ─────────────────────────
-- 내 오픈피스트 상태: 모집글 자격(선수 연결)·정지·가입 때 고른 종목(기본 탭)
create or replace function public.op_status()
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if me is null then return null; end if;
  return jsonb_build_object('eligible', private.market_eligible(me), 'banned', (private.active_ban(me)).id is not null,
    'weapon', (select weapon from public.profiles where id = me), 'is_admin', public.is_admin_user());
end $$;

-- 목록. p_weapon: 종목(null = 전체), p_week: 앞으로 7일 안에 시작, p_region: 지역, p_mine: 내가 연 모집 + 신청한 모집(지난 것 포함)
create or replace function public.op_list(p_weapon text default null, p_week boolean default false, p_region text default null,
                                          p_mine boolean default false, p_offset int default 0, p_limit int default 30)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); lim int := least(greatest(coalesce(p_limit, 30), 1), 60); items jsonb;
begin
  if me is null then raise exception 'login'; end if;
  perform private.throttle();
  if coalesce(p_mine, false) then
    select coalesce(jsonb_agg(private.op_json(p, me) order by p.starts_at desc), '[]'::jsonb) into items
      from public.openpiste_posts p
     where p.id in (select x.id from public.openpiste_posts x
                     where x.status <> 'deleted'
                       and (x.host_id = me or exists (select 1 from public.openpiste_participants y where y.post_id = x.id and y.user_id = me))
                     order by x.starts_at desc offset greatest(coalesce(p_offset, 0), 0) limit lim + 1);
  else
    select coalesce(jsonb_agg(private.op_json(p, me) order by p.starts_at), '[]'::jsonb) into items
      from public.openpiste_posts p
     where p.id in (select x.id from public.openpiste_posts x
                     where x.status = 'open' and x.ends_at > now()
                       and not private.blocked_by(me, x.host_id)
                       and (p_weapon is null or x.weapon = p_weapon)
                       and (p_region is null or x.region = p_region)
                       and (not coalesce(p_week, false) or x.starts_at < now() + interval '7 days')
                     order by x.starts_at offset greatest(coalesce(p_offset, 0), 0) limit lim + 1);
  end if;
  return jsonb_build_object('items', case when jsonb_array_length(items) > lim then items - lim else items end, 'has_more', jsonb_array_length(items) > lim);
end $$;

-- 상세. 게시 중(open)은 로그인 회원 누구나, 그 밖의 상태는 주최자·참가자·관리자만(승인 대기·반려·숨김은 주최자·관리자만).
-- 오픈채팅 링크는 주최자·참가자·관리자에게만, 수정안(pending_edit)·사유는 주최자·관리자에게만
create or replace function public.op_get(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts; v_admin boolean := public.is_admin_user(); v_member boolean; v_host boolean;
begin
  if me is null then raise exception 'login'; end if;
  perform private.throttle();
  select * into p from public.openpiste_posts where id = p_id;
  if p.id is null or p.status = 'deleted' then raise exception 'not_found'; end if;
  v_host := p.host_id = me;
  v_member := private.op_member(p.id, me);
  if not v_admin and (
       (p.status in ('pending','rejected','hidden') and not v_host)
    or (p.status in ('closed','cancelled','ended') and not v_member)) then
    raise exception 'not_found';
  end if;
  if private.blocked_by(me, p.host_id) and not v_member and not v_admin then return jsonb_build_object('id', p.id, 'blocked', true); end if;
  return private.op_json(p, me) || jsonb_build_object(
    'body', p.body,
    'chat_url', case when v_member or v_admin then p.chat_url end,
    'has_chat_url', p.chat_url is not null,
    'pending_edit', case when v_host or v_admin then p.pending_edit end,
    'status_reason', case when v_host or v_admin then p.status_reason end,
    'edited', p.edited_at is not null,
    'is_admin', v_admin,
    'can_report', not v_host and p.host_id is not null,
    'host_blocked_me', not v_host and p.host_id is not null and private.blocked_either(me, p.host_id));
end $$;

create or replace function public.op_view(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.openpiste_posts set view_count = view_count + 1 where id = p_id and status = 'open' and auth.uid() is not null;
$$;

-- 모집글 쓰기(승인 대기로 저장 → 관리자 알림). 선수 연결 회원만, 정지 중 불가. 10분 1개·하루 5개, 진행 예정 모집 최대 10개
create or replace function public.op_write(p_data jsonb)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); d jsonb; new_id bigint;
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  if not private.market_eligible(me) then raise exception 'op_not_eligible'; end if;
  d := private.op_clean(p_data);
  perform pg_advisory_xact_lock(hashtext('op-write:' || me::text));
  if exists (select 1 from public.openpiste_posts where host_id = me and created_at > now() - interval '10 minutes') then raise exception 'rate_op_min'; end if;
  if (select count(*) from public.openpiste_posts where host_id = me and created_at > now() - interval '24 hours') >= 5 then raise exception 'rate_op_day'; end if;
  if (select count(*) from public.openpiste_posts where host_id = me and status in ('pending','open','closed') and ends_at > now()) >= 10 then raise exception 'op_too_many'; end if;
  insert into public.openpiste_posts (host_id, title, weapon, levels, place, region, starts_at, duration_h, ends_at, capacity, fee, body, chat_url)
  values (me, d->>'title', d->>'weapon', array(select jsonb_array_elements_text(d->'levels')), d->>'place', d->>'region',
          (d->>'starts_at')::timestamptz, (d->>'duration_h')::int, (d->>'starts_at')::timestamptz + make_interval(hours => (d->>'duration_h')::int),
          (d->>'capacity')::int, (d->>'fee')::int, d->>'body', d->>'chat_url')
  returning id into new_id;
  perform private.notify_admins('오픈피스트 모집 승인 요청', left(d->>'title', 40) || ' · ' || (d->>'weapon') || ' · ' || (d->>'region'), '/admin?tab=openpiste');
  return new_id;
end $$;

-- 수정. 승인 대기·반려 글은 바로 고쳐서 (다시) 승인 대기로, 게시 중·마감 글은 수정안을 따로 저장해 승인을 기다린다(그동안 기존 내용 유지)
create or replace function public.op_edit(p_id bigint, p_data jsonb)
returns text language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts; d jsonb;
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  select * into p from public.openpiste_posts where id = p_id for update;
  if p.id is null or p.status = 'deleted' then raise exception 'not_found'; end if;
  if p.host_id is distinct from me then raise exception 'not_mine'; end if;
  d := private.op_clean(p_data);
  if p.status in ('pending','rejected') then
    update public.openpiste_posts set
        title = d->>'title', weapon = d->>'weapon', levels = array(select jsonb_array_elements_text(d->'levels')), place = d->>'place', region = d->>'region',
        starts_at = (d->>'starts_at')::timestamptz, duration_h = (d->>'duration_h')::int,
        ends_at = (d->>'starts_at')::timestamptz + make_interval(hours => (d->>'duration_h')::int),
        capacity = (d->>'capacity')::int, fee = (d->>'fee')::int, body = d->>'body', chat_url = d->>'chat_url',
        status = 'pending', status_reason = null, edited_at = now()
     where id = p_id;
    if p.status = 'rejected' then
      perform private.notify_admins('오픈피스트 모집 재승인 요청', left(d->>'title', 40), '/admin?tab=openpiste');
    end if;
    return 'pending';
  elsif p.status in ('open','closed') and p.ends_at > now() then
    if (d->>'capacity')::int < private.op_count(p_id) then raise exception 'bad_input:capacity_below'; end if;
    perform pg_advisory_xact_lock(hashtext('op-edit:' || me::text));
    if p.edit_submitted_at > now() - interval '10 minutes' and p.pending_edit is not null then raise exception 'rate_op_min'; end if;
    update public.openpiste_posts set pending_edit = d, edit_submitted_at = now() where id = p_id;
    perform private.notify_admins('오픈피스트 모집 수정 승인 요청', left(p.title, 40), '/admin?tab=openpiste');
    return 'edit_pending';
  end if;
  raise exception 'op_not_editable';
end $$;

-- 승인 대기 중인 수정안 거두기
create or replace function public.op_withdraw_edit(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.openpiste_posts set pending_edit = null, edit_submitted_at = null where id = p_id and host_id = auth.uid();
$$;

-- 모집 마감(목록에서 빠짐, 새 신청 불가) / 다시 열기(시작 전만)
create or replace function public.op_set_recruiting(p_id bigint, p_open boolean)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  if p_open then
    if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
    update public.openpiste_posts set status = 'open' where id = p_id and host_id = me and status = 'closed' and starts_at > now();
  else
    update public.openpiste_posts set status = 'closed' where id = p_id and host_id = me and status = 'open';
  end if;
  if not found then raise exception 'op_not_editable'; end if;
end $$;

-- 모집 취소(시작 전·진행 중): 참가자에게 알림. 승인 대기 글은 그냥 삭제 처리
create or replace function public.op_cancel(p_id bigint, p_reason text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then raise exception 'login'; end if;
  select * into p from public.openpiste_posts where id = p_id for update;
  if p.id is null or p.host_id is distinct from me then raise exception 'not_found'; end if;
  if p.status in ('pending','rejected') then
    update public.openpiste_posts set status = 'deleted', deleted_at = now(), status_by = me, status_reason = '주최자 삭제' where id = p_id;
    return;
  end if;
  if p.status not in ('open','closed') or p.ends_at < now() then raise exception 'op_not_editable'; end if;
  if char_length(coalesce(v_reason, '')) > 200 then raise exception 'bad_input:reason'; end if;
  update public.openpiste_posts set status = 'cancelled', status_reason = coalesce(v_reason, '주최자 취소'), status_by = me, pending_edit = null where id = p_id;
  perform private.op_notify_members(p_id, 'system', '참가 신청한 오픈피스트가 취소됐어요',
    '「' || left(p.title, 30) || '」 ' || coalesce('사유: ' || v_reason, '주최자가 모집을 취소했어요'), me);
end $$;

-- 끝난·취소된 모집 지우기(내 목록에서). 게시 중·마감(시작 전) 글은 먼저 취소해야 한다
create or replace function public.op_delete(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  update public.openpiste_posts set status = 'deleted', deleted_at = now(), status_by = me, status_reason = '주최자 삭제'
   where id = p_id and host_id = me and (status in ('pending','rejected','cancelled','ended') or ends_at < now()) and status <> 'deleted';
  if not found then raise exception 'op_not_editable'; end if;
end $$;

-- 참가 신청: 게시 중·시작 전·정원 안·차단 관계 아님. 주최자에게 알림. 하루 20건
create or replace function public.op_apply(p_id bigint)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts;
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  select * into p from public.openpiste_posts where id = p_id for update; -- 같은 글 신청을 줄 세워 정원 초과를 막는다
  if p.id is null or p.status <> 'open' then raise exception 'op_closed'; end if;
  if p.starts_at <= now() then raise exception 'op_started'; end if;
  if p.host_id = me then raise exception 'op_own'; end if;
  if p.host_id is not null and private.blocked_either(me, p.host_id) then raise exception 'op_blocked'; end if;
  if exists (select 1 from public.openpiste_participants where post_id = p_id and user_id = me) then return; end if;
  if private.op_count(p_id) >= p.capacity then raise exception 'op_full'; end if;
  if (select count(*) from public.openpiste_participants where user_id = me and created_at > now() - interval '24 hours') >= 20 then raise exception 'rate_op_apply'; end if;
  insert into public.openpiste_participants (post_id, user_id) values (p_id, me);
  perform private.notify(p.host_id, 'openpiste', '내 오픈피스트에 참가 신청이 왔어요',
    '「' || left(p.title, 30) || '」 ' || private.op_count(p_id) || '/' || p.capacity || '명', '/openpiste/' || p_id, me);
end $$;

-- 신청 취소(시작 전만). 주최자에게 알림
create or replace function public.op_leave(p_id bigint)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts;
begin
  if me is null then raise exception 'login'; end if;
  select * into p from public.openpiste_posts where id = p_id;
  if p.id is null then raise exception 'not_found'; end if;
  if p.starts_at <= now() and p.status not in ('cancelled') then raise exception 'op_started'; end if;
  delete from public.openpiste_participants where post_id = p_id and user_id = me;
  if found and p.status in ('open','closed') then
    perform private.notify(p.host_id, 'openpiste', '오픈피스트 참가 신청이 취소됐어요',
      '「' || left(p.title, 30) || '」 ' || private.op_count(p_id) || '/' || p.capacity || '명', '/openpiste/' || p_id, me);
  end if;
end $$;

-- 참가자 방: 주최자·참가자(+관리자)만. 참가자 목록(유펜 프로필)과 p_after 보다 새 메시지
create or replace function public.op_room(p_id bigint, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts; v_admin boolean := public.is_admin_user();
begin
  if me is null then raise exception 'login'; end if;
  select * into p from public.openpiste_posts where id = p_id;
  if p.id is null or p.status in ('deleted','pending','rejected') then raise exception 'not_found'; end if;
  if not private.op_member(p_id, me) and not v_admin then raise exception 'op_not_member'; end if;
  return jsonb_build_object(
    'post', private.op_json(p, me) || jsonb_build_object('chat_url', p.chat_url),
    'members', (select coalesce(jsonb_agg(m.card order by m.ord, m.joined_at), '[]'::jsonb) from (
        select 0 as ord, p.created_at as joined_at, private.content_card(p.host_id, 'y', '') || jsonb_build_object('host', true, 'me', p.host_id = me) as card
         where p.host_id is not null
        union all
        select 1, x.created_at, private.content_card(x.user_id, 'y', '') || jsonb_build_object('host', false, 'me', x.user_id = me)
          from public.openpiste_participants x where x.post_id = p_id) m),
    'can_send', private.op_member(p_id, me) and (private.active_ban(me)).id is null,
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', coalesce(m.sender_id = me, false), 'created_at', m.created_at, 'status', m.status,
          'by_admin', m.status = 'deleted' and m.status_by is distinct from m.sender_id,
          'body', case when m.status = 'active' or (m.status = 'hidden' and (m.sender_id = me or v_admin)) then m.body end,
          'is_host', m.sender_id = p.host_id,
          'card', private.content_card(m.sender_id, 'y', '')) order by m.id)
        from public.openpiste_messages m
       where m.post_id = p_id and m.id > coalesce(p_after, 0) and m.created_at > now() - interval '30 days'
         and not private.blocked_by(me, m.sender_id)), '[]'::jsonb));
end $$;

-- 참가자 방 메시지 보내기(1,000자). 1초 1개·1분 20개
create or replace function public.op_send(p_id bigint, p_body text)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); v_body text := btrim(coalesce(p_body, '')); p public.openpiste_posts; mid bigint;
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  select * into p from public.openpiste_posts where id = p_id;
  if p.id is null or p.status in ('deleted','pending','rejected','hidden') then raise exception 'not_found'; end if;
  if not private.op_member(p_id, me) then raise exception 'op_not_member'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'bad_input:body'; end if;
  perform pg_advisory_xact_lock(hashtext('op-send:' || me::text));
  if exists (select 1 from public.openpiste_messages where sender_id = me and created_at > now() - interval '1 second')
     or (select count(*) from public.openpiste_messages where sender_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_chat_fast';
  end if;
  insert into public.openpiste_messages (post_id, sender_id, body) values (p_id, me, v_body) returning id into mid;
  return mid;
end $$;

create or replace function public.op_message_delete(p_msg bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  update public.openpiste_messages set status = 'deleted', status_by = me where id = p_msg and sender_id = me and status <> 'deleted';
  if not found then raise exception 'not_found'; end if;
end $$;

-- 새 모집 알림 설정(종목·지역). 종목을 하나도 안 고르면 알림 없음, 지역을 안 고르면 전국
create or replace function public.op_get_alerts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('weapons', weapons, 'regions', regions) from public.openpiste_alerts where user_id = auth.uid()),
                  jsonb_build_object('weapons', '[]'::jsonb, 'regions', '[]'::jsonb))
$$;

create or replace function public.op_set_alerts(p_weapons text[], p_regions text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  if not (coalesce(p_weapons, '{}') <@ array['에페','플뢰레','사브르'])
     or not (coalesce(p_regions, '{}') <@ array['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주']) then
    raise exception 'bad_input';
  end if;
  insert into public.openpiste_alerts (user_id, weapons, regions) values (me, coalesce(p_weapons, '{}'), coalesce(p_regions, '{}'))
  on conflict (user_id) do update set weapons = excluded.weapons, regions = excluded.regions, updated_at = now();
  return public.op_get_alerts();
end $$;

-- ───────────────────────── 관리자: 승인 ─────────────────────────
-- 승인 대기 목록: 새 모집(pending) + 수정 요청(pending_edit). 주최자 유펜 닉네임 포함
create or replace function public.admin_op_queue()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin_user() then return null; end if;
  return coalesce((select jsonb_agg(t order by t.submitted_at) from (
    select p.id, p.status, p.title, p.weapon, p.levels, p.place, p.region, p.starts_at, p.duration_h, p.capacity, p.fee, p.body, p.chat_url,
           p.pending_edit, p.created_at, p.edited_at, private.op_count(p.id) count,
           case when p.status = 'pending' then 'new' else 'edit' end kind,
           coalesce(case when p.status = 'pending' then coalesce(p.edited_at, p.created_at) end, p.edit_submitted_at) submitted_at,
           pr.nickname host_nickname, p.host_id,
           (select count(*) from public.openpiste_posts x where x.host_id = p.host_id and x.status in ('open','closed','ended')) host_hosted
      from public.openpiste_posts p left join public.profiles pr on pr.id = p.host_id
     where p.status = 'pending' or (p.pending_edit is not null and p.status in ('open','closed'))
     order by 1 limit 100) t), '[]'::jsonb);
end $$;

-- 승인/반려. 새 모집 승인 → 게시 + 주최자 알림 + 새 모집 알림, 수정 승인 → 반영 + 주최자·참가자 알림.
-- 반려 → 새 모집은 'rejected'(사유), 수정은 수정안만 버림. 모두 주최자에게 알림(끌 수 없는 system)
create or replace function public.admin_op_review(p_id bigint, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts; d jsonb; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  select * into p from public.openpiste_posts where id = p_id for update;
  if p.id is null then raise exception '대상을 찾을 수 없습니다'; end if;
  if p.status = 'pending' then
    if p_approve then
      if p.starts_at <= now() then raise exception '시작 시각이 이미 지났어요. 반려해 주세요'; end if;
      update public.openpiste_posts set status = 'open', approved_at = now(), approved_by = me, status_reason = null where id = p_id;
      perform private.notify(p.host_id, 'system', '오픈피스트 모집이 승인되어 게시됐어요', '「' || left(p.title, 30) || '」', '/openpiste/' || p_id);
      perform private.op_announce(p_id);
    else
      update public.openpiste_posts set status = 'rejected', status_reason = coalesce(v_reason, '운영 기준에 맞지 않음'), status_by = me where id = p_id;
      perform private.notify(p.host_id, 'system', '오픈피스트 모집이 반려됐어요',
        '「' || left(p.title, 30) || '」 사유: ' || coalesce(v_reason, '운영 기준에 맞지 않음') || ' · 고쳐서 다시 신청할 수 있어요', '/openpiste/' || p_id);
    end if;
  elsif p.pending_edit is not null and p.status in ('open','closed') then
    d := p.pending_edit;
    if p_approve then
      if (d->>'starts_at')::timestamptz <= now() then raise exception '수정안의 시작 시각이 이미 지났어요. 반려해 주세요'; end if;
      if (d->>'capacity')::int < private.op_count(p_id) then raise exception '수정안의 정원이 지금 신청 인원보다 적어요. 반려해 주세요'; end if;
      update public.openpiste_posts set
          title = d->>'title', weapon = d->>'weapon', levels = array(select jsonb_array_elements_text(d->'levels')), place = d->>'place', region = d->>'region',
          starts_at = (d->>'starts_at')::timestamptz, duration_h = (d->>'duration_h')::int,
          ends_at = (d->>'starts_at')::timestamptz + make_interval(hours => (d->>'duration_h')::int),
          capacity = (d->>'capacity')::int, fee = (d->>'fee')::int, body = d->>'body', chat_url = d->>'chat_url',
          pending_edit = null, edit_submitted_at = null, edited_at = now(), approved_at = now(), approved_by = me
       where id = p_id;
      perform private.notify(p.host_id, 'system', '오픈피스트 수정 내용이 승인됐어요', '「' || left(d->>'title', 30) || '」', '/openpiste/' || p_id);
      perform private.op_notify_members(p_id, 'system', '참가 신청한 오픈피스트의 내용이 바뀌었어요',
        '「' || left(d->>'title', 30) || '」 일시·장소 등을 다시 확인해 주세요', p.host_id);
    else
      update public.openpiste_posts set pending_edit = null, edit_submitted_at = null where id = p_id;
      perform private.notify(p.host_id, 'system', '오픈피스트 수정 요청이 반려됐어요',
        '「' || left(p.title, 30) || '」 사유: ' || coalesce(v_reason, '운영 기준에 맞지 않음') || ' · 기존 내용은 그대로 게시돼요', '/openpiste/' || p_id);
    end if;
  else
    raise exception '승인할 내용이 없어요(이미 처리됨)';
  end if;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (me, case when p_approve then 'op_approve' else 'op_reject' end, 'openpiste:' || p_id,
          jsonb_build_object('kind', case when p.status = 'pending' then 'new' else 'edit' end, 'reason', v_reason));
end $$;

-- ───────────────────────── 신고·차단 대상 / 자동 숨김 / 관리자 확장 ─────────────────────────
-- 'openpiste' = 모집글(대상 = 주최자), 'opmsg' = 참가자 방 메시지(대상 = 보낸 사람, 사본 = 그 메시지와 앞 10개)
create or replace function private.resolve_target(p_kind text, p_ref text)
returns table (user_id uuid, label text, snapshot jsonb) language plpgsql stable security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if p_kind = 'cprofile' and p_ref ~ '^[0-9a-fA-F-]{36}$' then
    return query select c.user_id, coalesce(c.nickname, '커뮤니티 회원'), jsonb_build_object('nickname', c.nickname, 'avatar_url', c.avatar_url)
      from public.community_profiles c where c.public_id = p_ref::uuid;
  elsif p_kind = 'yprofile' and p_ref ~ '^[0-9a-fA-F-]{36}$' then
    return query select p.id, coalesce(p.nickname, '회원'), jsonb_build_object('nickname', p.nickname, 'avatar_url', p.avatar_url)
      from public.profiles p where p.id = p_ref::uuid;
  elsif p_kind = 'post' and p_ref ~ '^[0-9]{1,18}$' then
    return query select p.author_id,
        case when p.persona = 'a' then '익명 (글: ' || left(p.title, 20) || ')' else coalesce(private.content_card(p.author_id, p.persona, '')->>'nickname', '회원') end,
        jsonb_build_object('persona', p.persona, 'post_id', p.id, 'title', p.title, 'body', left(p.body, 500), 'images', p.images,
                           'nickname', case when p.persona = 'a' then '익명' else private.content_card(p.author_id, p.persona, '')->>'nickname' end)
      from public.community_posts p where p.id = p_ref::bigint and p.status <> 'deleted';
  elsif p_kind = 'comment' and p_ref ~ '^[0-9]{1,18}$' then
    return query select c.author_id,
        case when c.persona = 'a' then '익명 (댓글: ' || left(c.body, 20) || ')' else coalesce(private.content_card(c.author_id, c.persona, '')->>'nickname', '회원') end,
        jsonb_build_object('persona', c.persona, 'post_id', c.post_id, 'body', left(c.body, 500),
                           'nickname', case when c.persona = 'a' then (case when c.anon_no = 0 then '글쓴이' else '익명' || c.anon_no end)
                                            else private.content_card(c.author_id, c.persona, '')->>'nickname' end)
      from public.community_comments c where c.id = p_ref::bigint and c.status <> 'deleted';
  elsif p_kind = 'listing' and p_ref ~ '^[0-9]{1,18}$' then
    return query select l.author_id, coalesce(private.content_card(l.author_id, l.persona, '')->>'nickname', '회원'),
        jsonb_build_object('persona', l.persona, 'listing_id', l.id, 'title', l.title, 'body', left(l.body, 500), 'images', l.images,
                           'kind', l.kind, 'price', l.price, 'nickname', private.content_card(l.author_id, l.persona, '')->>'nickname')
      from public.market_listings l where l.id = p_ref::bigint and l.status <> 'deleted';
  elsif p_kind = 'dmthread' and p_ref ~ '^[0-9]{1,18}$' then
    return query select case when t.a_id = me then t.b_id else t.a_id end,
        coalesce(private.content_card(case when t.a_id = me then t.b_id else t.a_id end, case when t.a_id = me then t.b_persona else t.a_persona end, '')->>'nickname', '회원'),
        jsonb_build_object('persona', case when t.a_id = me then t.b_persona else t.a_persona end, 'thread_id', t.id, 'title', t.listing_title,
          'nickname', private.content_card(case when t.a_id = me then t.b_id else t.a_id end, case when t.a_id = me then t.b_persona else t.a_persona end, '')->>'nickname',
          'messages', (select jsonb_agg(jsonb_build_object('from', case when m.sender_id = me then '신고자' else '상대' end, 'body', m.body,
                                                           'image', m.image->>'path', 'at', m.created_at) order by m.id)
                         from (select * from public.dm_messages where thread_id = t.id order by id desc limit 30) m))
      from public.dm_threads t where t.id = p_ref::bigint and (t.a_id = me or t.b_id = me or public.is_admin_user());
  elsif p_kind = 'chat' and p_ref ~ '^[0-9]{1,18}$' then
    return query select m.sender_id, coalesce(private.chat_card(m.sender_id, m.persona)->>'nickname', '회원'),
        jsonb_build_object('persona', m.persona, 'message_id', m.id, 'body', left(m.body, 500), 'image', m.image->>'path',
          'nickname', private.chat_card(m.sender_id, m.persona)->>'nickname',
          'messages', (select jsonb_agg(jsonb_build_object('from', private.chat_card(x.sender_id, x.persona)->>'nickname', 'body', x.body,
                                                           'image', x.image->>'path', 'at', x.created_at, 'target', x.id = m.id) order by x.id)
                         from (select * from public.chat_messages y where y.id <= m.id order by y.id desc limit 11) x))
      from public.chat_messages m where m.id = p_ref::bigint and m.status <> 'deleted';
  elsif p_kind = 'openpiste' and p_ref ~ '^[0-9]{1,18}$' then
    return query select p.host_id, coalesce((select nickname from public.profiles where id = p.host_id), '회원'),
        jsonb_build_object('persona', 'y', 'op_id', p.id, 'title', p.title, 'body', left(p.body, 500),
          'detail', p.weapon || ' · ' || p.region || ' · ' || p.place || ' · ' || to_char(p.starts_at at time zone 'Asia/Seoul', 'YYYY.MM.DD HH24:MI'),
          'nickname', (select nickname from public.profiles where id = p.host_id))
      from public.openpiste_posts p where p.id = p_ref::bigint and p.status not in ('deleted','pending','rejected');
  elsif p_kind = 'opmsg' and p_ref ~ '^[0-9]{1,18}$' then
    return query select m.sender_id, coalesce((select nickname from public.profiles where id = m.sender_id), '회원'),
        jsonb_build_object('persona', 'y', 'op_id', m.post_id, 'message_id', m.id, 'body', left(m.body, 500),
          'nickname', (select nickname from public.profiles where id = m.sender_id),
          'messages', (select jsonb_agg(jsonb_build_object('from', coalesce(pr.nickname, '탈퇴 회원'), 'body', x.body, 'at', x.created_at, 'target', x.id = m.id) order by x.id)
                         from (select * from public.openpiste_messages y where y.post_id = m.post_id and y.id <= m.id order by y.id desc limit 11) x
                         left join public.profiles pr on pr.id = x.sender_id))
      from public.openpiste_messages m
     where m.id = p_ref::bigint and m.status <> 'deleted' and (private.op_member(m.post_id, me) or public.is_admin_user());
  end if;
end $$;

create or replace function private.auto_hide(p_kind text, p_ref text)
returns void language plpgsql security definer set search_path = public, private as $$
declare pid bigint;
begin
  if p_kind = 'post' then
    update public.community_posts set status = 'hidden', status_reason = '신고 누적 자동 숨김' where id = p_ref::bigint and status = 'active';
    if found then perform private.notify_admins('신고가 쌓여 게시글을 자동으로 가렸어요', '관리자 페이지 > 신고에서 복구하거나 삭제해 주세요', '/admin?tab=reports'); end if;
  elsif p_kind = 'comment' then
    update public.community_comments set status = 'hidden', status_reason = '신고 누적 자동 숨김' where id = p_ref::bigint and status = 'active'
    returning post_id into pid;
    if pid is not null then
      perform private.recount_comments(pid);
      perform private.notify_admins('신고가 쌓여 댓글을 자동으로 가렸어요', '관리자 페이지 > 신고에서 복구하거나 삭제해 주세요', '/admin?tab=reports');
    end if;
  elsif p_kind = 'listing' then
    update public.market_listings set status = 'hidden', status_reason = '신고 누적 자동 숨김' where id = p_ref::bigint and status = 'active';
    if found then perform private.notify_admins('신고가 쌓여 장터 글을 자동으로 가렸어요', '관리자 페이지 > 신고에서 복구하거나 삭제해 주세요', '/admin?tab=reports'); end if;
  elsif p_kind = 'chat' then
    update public.chat_messages set status = 'hidden', status_reason = '신고 누적 자동 숨김' where id = p_ref::bigint and status = 'active';
    if found then
      perform private.chat_ping('update', p_ref::bigint);
      perform private.notify_admins('신고가 쌓여 채팅 메시지를 자동으로 가렸어요', '관리자 페이지 > 신고에서 복구하거나 삭제해 주세요', '/admin?tab=reports');
    end if;
  elsif p_kind = 'openpiste' then
    update public.openpiste_posts set status = 'hidden', status_reason = '신고 누적 자동 숨김' where id = p_ref::bigint and status in ('open','closed');
    if found then perform private.notify_admins('신고가 쌓여 오픈피스트 모집을 자동으로 가렸어요', '관리자 페이지 > 신고에서 복구하거나 삭제해 주세요', '/admin?tab=reports'); end if;
  elsif p_kind = 'opmsg' then
    update public.openpiste_messages set status = 'hidden' where id = p_ref::bigint and status = 'active';
    if found then perform private.notify_admins('신고가 쌓여 오픈피스트 참가자 방 메시지를 자동으로 가렸어요', '관리자 페이지 > 신고에서 복구하거나 삭제해 주세요', '/admin?tab=reports'); end if;
  end if;
end $$;

-- 관리자 글 상태 바꾸기: 오픈피스트 모집(openpiste)·참가자 방 메시지(opmsg)까지.
-- 모집글 복구(active)는 끝났으면 'ended', 아니면 'open'. 모집글 삭제는 참가자에게도 알림
create or replace function public.admin_set_content_status(p_kind text, p_ref text, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); author uuid; pid bigint; what text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  if p_status not in ('active','hidden','deleted') then raise exception '잘못된 상태입니다'; end if;
  if p_ref !~ '^[0-9]{1,18}$' then raise exception '대상을 찾을 수 없습니다'; end if;
  if p_kind = 'post' then
    update public.community_posts
       set status = p_status, status_reason = v_reason, status_by = me, deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning author_id, id into author, pid;
    what := '게시글이';
  elsif p_kind = 'comment' then
    update public.community_comments
       set status = p_status, status_reason = v_reason, status_by = me, deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning author_id, post_id into author, pid;
    if pid is not null then perform private.recount_comments(pid); end if;
    what := '댓글이';
  elsif p_kind = 'listing' then
    update public.market_listings
       set status = case when p_status = 'active' and expires_at < now() then 'expired' else p_status end,
           status_reason = v_reason, status_by = me, deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning author_id, id into author, pid;
    what := '장터 글이';
  elsif p_kind = 'chat' then
    update public.chat_messages
       set status = p_status, status_reason = v_reason, status_by = me, deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning sender_id, id into author, pid;
    if pid is not null then perform private.chat_ping('update', pid); end if;
    what := '채팅 메시지가';
  elsif p_kind = 'openpiste' then
    update public.openpiste_posts
       set status = case when p_status = 'active' then (case when ends_at < now() then 'ended' else 'open' end) else p_status end,
           status_reason = v_reason, status_by = me, deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint and status not in ('pending','rejected') returning host_id, id into author, pid;
    if pid is not null and p_status = 'deleted' then
      perform private.op_notify_members(pid, 'system', '참가 신청한 오픈피스트가 운영 기준에 따라 삭제됐어요', coalesce('사유: ' || v_reason, null), author);
    end if;
    what := '오픈피스트 모집이';
  elsif p_kind = 'opmsg' then
    update public.openpiste_messages set status = p_status, status_by = me where id = p_ref::bigint returning sender_id, id into author, pid;
    what := '오픈피스트 참가자 방 메시지가';
  else
    raise exception '처리할 수 없는 종류입니다';
  end if;
  if pid is null then raise exception '대상을 찾을 수 없습니다'; end if;
  if p_status = 'deleted' then
    perform private.notify(author, 'sanction', '운영 기준에 따라 ' || what || ' 삭제되었어요',
      coalesce('사유: ' || v_reason || ' · ', '') || '이의가 있으면 고객지원으로 알려 주세요', '/support');
  end if;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (me, 'content_' || p_status, p_kind || ':' || p_ref, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_community_reports(p_status text default 'open')
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin_user() then return null; end if;
  return coalesce((select jsonb_agg(t order by t.created_at desc) from (
    select r.id, r.target_kind, r.target_ref, r.reason, r.detail, r.snapshot, r.status, r.created_at, r.handled_at, r.target_user_id,
           anon target_anonymous,
           case when anon then null else tp.nickname end target_nickname,
           case when anon then null else tc.nickname end target_community_nickname,
           tc.avatar_url target_community_avatar,
           tc.chat_nickname is not null target_has_chat_nickname,
           rp.nickname reporter_nickname,
           (select count(*) from public.community_reports x where x.target_kind = r.target_kind and x.target_ref = r.target_ref) same_target_count,
           (select count(*) from public.community_reports x where x.target_user_id = r.target_user_id) target_user_count,
           (select b.until from public.community_bans b where b.user_id = r.target_user_id and b.lifted_at is null and (b.until is null or b.until > now()) order by b.until desc nulls first limit 1) ban_until,
           exists (select 1 from public.community_bans b where b.user_id = r.target_user_id and b.lifted_at is null and b.until is null) ban_permanent,
           case r.target_kind
             when 'post' then (select status from public.community_posts where id = r.target_ref::bigint)
             when 'comment' then (select status from public.community_comments where id = r.target_ref::bigint)
             when 'listing' then (select case when status = 'expired' then 'active' else status end from public.market_listings where id = r.target_ref::bigint)
             when 'chat' then (select status from public.chat_messages where id = r.target_ref::bigint)
             when 'openpiste' then (select case when status in ('hidden','deleted') then status else 'active' end from public.openpiste_posts where id = r.target_ref::bigint)
             when 'opmsg' then (select status from public.openpiste_messages where id = r.target_ref::bigint)
           end content_status
      from public.community_reports r
      cross join lateral (select coalesce(r.snapshot->>'persona', '') in ('a','n') anon) a
      left join public.profiles tp on tp.id = r.target_user_id
      left join public.community_profiles tc on tc.user_id = r.target_user_id
      left join public.profiles rp on rp.id = r.reporter_id
     where p_status = 'all' or r.status = p_status
     order by r.created_at desc
     limit 100) t), '[]'::jsonb);
end $$;

-- 삭제 콘텐츠 백업: 오픈피스트 모집까지
create or replace function public.admin_deleted_content(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  insert into public.admin_audit (admin_id, action, target, detail) values (me, 'backup_export', 'community', jsonb_build_object('from', p_from, 'to', p_to));
  return jsonb_build_object(
    'exported_at', now(),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'author_nickname', pr.nickname, 'persona', p.persona, 'tags', p.tags,
        'title', p.title, 'body', p.body, 'images', p.images, 'created_at', p.created_at, 'deleted_at', p.deleted_at, 'reason', p.status_reason) order by p.deleted_at)
      from public.community_posts p left join public.profiles pr on pr.id = p.author_id
      where p.status = 'deleted' and p.deleted_at >= p_from and p.deleted_at < p_to), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'post_id', c.post_id, 'author_nickname', pr.nickname, 'persona', c.persona,
        'body', c.body, 'created_at', c.created_at, 'deleted_at', c.deleted_at, 'reason', c.status_reason) order by c.deleted_at)
      from public.community_comments c left join public.profiles pr on pr.id = c.author_id
      where c.status = 'deleted' and c.deleted_at >= p_from and c.deleted_at < p_to), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'author_nickname', pr.nickname, 'persona', l.persona, 'kind', l.kind,
        'title', l.title, 'category', l.category, 'price', l.price, 'body', l.body, 'images', l.images, 'created_at', l.created_at,
        'deleted_at', l.deleted_at, 'reason', l.status_reason) order by l.deleted_at)
      from public.market_listings l left join public.profiles pr on pr.id = l.author_id
      where l.status = 'deleted' and l.deleted_at >= p_from and l.deleted_at < p_to), '[]'::jsonb),
    'chat', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author_nickname', pr.nickname, 'persona', m.persona,
        'chat_nickname', case when m.persona = 'n' then cp.chat_nickname end, 'body', m.body, 'image', m.image, 'created_at', m.created_at,
        'deleted_at', m.deleted_at, 'reason', m.status_reason) order by m.deleted_at)
      from public.chat_messages m left join public.profiles pr on pr.id = m.sender_id left join public.community_profiles cp on cp.user_id = m.sender_id
      where m.status = 'deleted' and m.deleted_at >= p_from and m.deleted_at < p_to), '[]'::jsonb),
    'openpiste', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'host_nickname', pr.nickname, 'title', o.title, 'weapon', o.weapon,
        'place', o.place, 'region', o.region, 'starts_at', o.starts_at, 'body', o.body, 'chat_url', o.chat_url, 'participants', private.op_count(o.id),
        'created_at', o.created_at, 'deleted_at', o.deleted_at, 'reason', o.status_reason) order by o.deleted_at)
      from public.openpiste_posts o left join public.profiles pr on pr.id = o.host_id
      where o.status = 'deleted' and o.deleted_at >= p_from and o.deleted_at < p_to), '[]'::jsonb));
end $$;

-- 관리자 현황: 오픈피스트 승인 대기(새 모집 + 수정 요청) 수 추가
create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin_user() then return null; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'linked_athletes', (select count(*) from public.athlete_links),
    'claims', (select count(*) from public.athlete_claim_requests where status = 'open'),
    'support_new', (select count(*) from public.support_tickets where status = 'new'),
    'avatar_reports', (select count(*) from public.avatar_reports where status = 'open'),
    'community_reports', (select count(distinct (target_kind, target_ref)) from public.community_reports where status = 'open'),
    'chat_today', (select count(*) from public.chat_messages where created_at > now() - interval '24 hours'),
    'chat_senders_today', (select count(distinct sender_id) from public.chat_messages where created_at > now() - interval '24 hours'),
    'openpiste_pending', (select count(*) from public.openpiste_posts where status = 'pending' or (pending_edit is not null and status in ('open','closed'))),
    'club_requests', (select count(*) from public.club_image_requests where status = 'pending'),
    'leaders_pending', (select count(*) from public.profiles where role = '지도자' and leader_status = 'pending'),
    'clubs_review', (select count(*) from public.clubs where confidence = 'medium'),
    'teams', (select count(*) from public.club_teams),
    'clubs', (select count(*) from public.clubs),
    'players', (select count(*) from private.players),
    'competitions', (select count(*) from public.competitions),
    'last_competition', (select max(start_date) from public.competitions),
    'events', (select count(*) from public.comp_events),
    'last_done', (select coalesce(jsonb_object_agg(kind, finished_at), '{}'::jsonb) from (select kind, max(finished_at) finished_at from public.admin_jobs where status = 'done' group by kind) s)
  );
end $$;

-- ───────────────────────── 매일 정리 (4단계 함수 교체: 오픈피스트 추가) ─────────────────────────
--  · 오픈피스트: 끝난 모집(게시 중·마감) → 'ended'. 끝나거나 취소·반려된 지 30일 → 삭제 처리 → 다음 달 1일 완전 삭제(참가 기록·방 메시지 함께).
--    참가자 방 메시지는 1달 보관. 승인 대기 중에 시작 시각이 지난 글은 반려 처리
create or replace function private.community_daily()
returns void language plpgsql security definer set search_path = public, private as $$
declare today date := (now() at time zone 'Asia/Seoul')::date; cutoff timestamptz; r record;
begin
  -- 장터 만료 알림
  for r in select id, author_id, kind, title, expires_at from public.market_listings
            where status = 'active' and not expiry_notified
              and expires_at < now() + case when kind = 'sell' then interval '7 days' else interval '3 days' end loop
    perform private.notify(r.author_id, 'market', '장터 글이 곧 자동으로 정리돼요',
      '「' || left(r.title, 30) || '」 ' || to_char(r.expires_at at time zone 'Asia/Seoul', 'MM.DD') || ' 이후 숨겨져요. 연장하려면 글에서 [연장]을 눌러 주세요',
      '/community/market/' || r.id);
    update public.market_listings set expiry_notified = true where id = r.id;
  end loop;
  update public.market_listings set status = 'expired', status_reason = '노출 기간 만료' where status = 'active' and expires_at < now();
  update public.market_listings set status = 'deleted', deleted_at = now(), status_reason = '만료 후 30일 경과'
   where status = 'expired' and expires_at < now() - interval '30 days';

  -- 1:1 채팅 1달 보관
  delete from public.dm_messages where created_at < now() - interval '30 days';
  delete from public.dm_threads t where t.last_message_at < now() - interval '30 days'
     and not exists (select 1 from public.dm_messages m where m.thread_id = t.id);

  -- 자유톡방 1달 보관
  delete from public.chat_messages where created_at < now() - interval '30 days';

  -- 오픈피스트
  update public.openpiste_posts set status = 'ended' where status in ('open','closed') and ends_at < now();
  update public.openpiste_posts set status = 'rejected', status_reason = '승인 전에 시작 시각이 지남' where status = 'pending' and starts_at < now();
  update public.openpiste_posts set status = 'deleted', deleted_at = now(), status_reason = coalesce(status_reason, '종료 후 30일 경과')
   where status in ('ended','cancelled','rejected') and greatest(ends_at, coalesce(edited_at, created_at)) < now() - interval '30 days';
  delete from public.openpiste_messages where created_at < now() - interval '30 days';

  if today + 1 = (date_trunc('month', today::timestamp) + interval '1 month' - interval '1 day')::date then
    perform private.notify_admins('내일이 이달 마지막 날이에요 — 삭제된 커뮤니티 글 백업',
      '다음 달 1일 0시에 이달 삭제된 글·댓글·장터 글·오픈피스트 모집이 완전히 지워져요(채팅은 1달 뒤 삭제). 관리자 페이지 > 신고 > 삭제 콘텐츠 백업에서 내려받아 주세요', '/admin?tab=reports');
  end if;
  if extract(day from today) = 1 then
    cutoff := date_trunc('month', today::timestamp) at time zone 'Asia/Seoul';
    update public.community_reports r set snapshot = jsonb_build_object('purged', true, 'persona', r.snapshot->>'persona')
     where (r.target_kind = 'post' and r.target_ref in (select id::text from public.community_posts where status = 'deleted' and deleted_at < cutoff))
        or (r.target_kind = 'listing' and r.target_ref in (select id::text from public.market_listings where status = 'deleted' and deleted_at < cutoff))
        or (r.target_kind = 'openpiste' and r.target_ref in (select id::text from public.openpiste_posts where status = 'deleted' and deleted_at < cutoff))
        or (r.target_kind = 'comment' and r.target_ref in (select c.id::text from public.community_comments c
              where c.status = 'deleted' and c.deleted_at < cutoff and not exists (select 1 from public.community_comments x where x.parent_id = c.id and x.status <> 'deleted')));
    delete from public.community_comments c
     where c.status = 'deleted' and c.deleted_at < cutoff
       and not exists (select 1 from public.community_comments x where x.parent_id = c.id and x.status <> 'deleted');
    delete from public.community_posts where status = 'deleted' and deleted_at < cutoff;
    delete from public.market_listings where status = 'deleted' and deleted_at < cutoff;
    delete from public.openpiste_posts where status = 'deleted' and deleted_at < cutoff;
  end if;
end $$;

-- ───────────────────────── 권한 (로그인 회원만) ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.op_status()', 'public.op_list(text, boolean, text, boolean, int, int)', 'public.op_get(bigint)', 'public.op_view(bigint)',
    'public.op_write(jsonb)', 'public.op_edit(bigint, jsonb)', 'public.op_withdraw_edit(bigint)', 'public.op_set_recruiting(bigint, boolean)',
    'public.op_cancel(bigint, text)', 'public.op_delete(bigint)', 'public.op_apply(bigint)', 'public.op_leave(bigint)',
    'public.op_room(bigint, bigint)', 'public.op_send(bigint, text)', 'public.op_message_delete(bigint)',
    'public.op_get_alerts()', 'public.op_set_alerts(text[], text[])',
    'public.admin_op_queue()', 'public.admin_op_review(bigint, boolean, text)',
    'public.admin_set_content_status(text, text, text, text)', 'public.admin_community_reports(text)',
    'public.admin_deleted_content(timestamptz, timestamptz)', 'public.admin_overview()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function private.op_clean(jsonb), private.op_count(bigint), private.op_member(bigint, uuid),
  private.op_json(public.openpiste_posts, uuid), private.op_announce(bigint), private.op_notify_members(bigint, text, text, text, uuid)
  from public, anon, authenticated;
