-- 커뮤니티 3단계 장터 + 1:1 채팅 (마이그레이션 35 `community_market_dm` + `community_dm_send_fix`(dm_send 변수 이름 link→v_link: 알림 표 열 이름과 겹쳐 오류) + `community_board_upload_kind`(게시판 함수가 장터·채팅 사진을 붙이지 못하게 — 2단계 파일에 반영), 2026-10-08, 브랜치 feature/community)
-- 기획: docs/COMMUNITY.md 3장. 1·2단계(카드·알림·신고·차단·정지·사진 기록·월말 정리) 위에 올린다.
-- 표: market_listings(판매·구매 글) / dm_threads(장터 글 하나당 문의자 1명과의 대화방) / dm_messages(메시지)
-- 원칙
--  · 장터 글쓰기·1:1 채팅은 선수를 연결한 회원(학부모·지도자 포함 = athlete_links 1건 이상)만. 둘러보기는 로그인 회원 누구나.
--  · 표시는 커뮤니티 프로필(쓸 때·대화를 시작할 때의 얼굴 y/c 를 저장). 장터·채팅에는 익명이 없다.
--  · 표는 RPC 전용 → 상대 회원 id 는 화면에 나가지 않는다(전용 프로필 보호). 메시지에도 보낸 사람 id 대신 '내 것인지'만 준다.
--  · 판매 글 6개월·구매 글 30일 노출, 만료 7일·3일 전 알림, 연장 2회. 만료 후 30일이 지나면 삭제 처리 → 다음 달 1일 완전 삭제(사진도 정리).
--  · 메시지는 1달 보관 후 삭제. 사진은 검사 없이(신고로 처리) 용량만 제한.

-- ───────────────────────── 사진 기록 확장 ─────────────────────────
-- 2단계 community_uploads 에 종류(kind)와 장터 글·메시지 연결을 더한다. 셋 다 비어 있고 하루 지난 사진은 사진 API 가 지운다.
alter table public.community_uploads add column kind text not null default 'post' check (kind in ('post','market','dm'));

-- ───────────────────────── 장터 글 ─────────────────────────
create table public.market_listings (
  id bigint generated always as identity primary key,
  author_id uuid references public.profiles(id) on delete set null,
  persona text not null check (persona in ('y','c')),
  kind text not null check (kind in ('sell','buy')),
  title text not null check (char_length(btrim(title)) between 1 and 60),                -- 물품명
  category text not null check (category in ('검·부품','마스크','도복','장갑','신발','가방','바디코드·전자장비','기타')),
  weapon text check (weapon in ('에페','플뢰레','사브르','공용')),
  price int check (price between 0 and 100000000),                                       -- 판매가(0 = 나눔)
  price_min int check (price_min between 0 and 100000000),                               -- 구매 희망가
  price_max int check (price_max between 0 and 100000000),
  price_nego boolean not null default false,                                             -- 구매: 가격 협의
  usage_period text check (usage_period in ('미사용','1개월 이하','1~6개월','6~12개월','1~2년','2년 이상')),
  condition text check (condition in ('새상품','거의 새것','사용감 적음','사용감 많음','수리 필요','새것','상관없음')),
  hand text check (hand in ('오른손','왼손','양손')),
  size text check (char_length(size) <= 20),
  regions text check (char_length(regions) <= 60),
  delivery boolean not null default false,
  body text not null default '' check (char_length(body) <= 3000),
  images jsonb not null default '[]' check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 10), -- 첫 장 = 대표 사진
  trade_status text not null check (trade_status in ('판매중','예약중','거래완료','구하는 중','구했어요')),
  status text not null default 'active' check (status in ('active','hidden','expired','deleted')),
  status_reason text,
  status_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  expires_at timestamptz not null,
  extend_count int not null default 0,
  expiry_notified boolean not null default false,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  check ((kind = 'sell' and price is not null) or (kind = 'buy' and (price_nego or (price_min is not null and price_max is not null and price_min <= price_max))))
);
create index market_listings_list_idx on public.market_listings (status, created_at desc);
create index market_listings_author_idx on public.market_listings (author_id, created_at desc);
create index market_listings_expiry_idx on public.market_listings (expires_at) where status in ('active','expired');
alter table public.market_listings enable row level security;
revoke all on public.market_listings from anon, authenticated;

alter table public.community_uploads add column listing_id bigint references public.market_listings(id) on delete set null;
create index community_uploads_listing_idx on public.community_uploads (listing_id);

-- ───────────────────────── 1:1 채팅 ─────────────────────────
-- 대화방 = 장터 글 하나 × 문의자 한 명. a = 문의한 회원, b = 글쓴이. 각자의 얼굴은 대화방을 만들 때 정해져 바뀌지 않는다.
create table public.dm_threads (
  id bigint generated always as identity primary key,
  listing_id bigint references public.market_listings(id) on delete set null,
  listing_title text not null,                      -- 글이 지워져도 대화방 제목은 남긴다
  a_id uuid references public.profiles(id) on delete set null,
  b_id uuid references public.profiles(id) on delete set null,
  a_persona text not null check (a_persona in ('y','c')),
  b_persona text not null check (b_persona in ('y','c')),
  a_read_at timestamptz, b_read_at timestamptz,
  a_left boolean not null default false, b_left boolean not null default false,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (listing_id, a_id)
);
create index dm_threads_a_idx on public.dm_threads (a_id, last_message_at desc);
create index dm_threads_b_idx on public.dm_threads (b_id, last_message_at desc);
alter table public.dm_threads enable row level security;
revoke all on public.dm_threads from anon, authenticated;

create table public.dm_messages (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.dm_threads(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null default '' check (char_length(body) <= 1000),
  image jsonb,                                      -- {id, path, thumb, w, h} 또는 null
  status text not null default 'active' check (status in ('active','hidden')),
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or image is not null)
);
create index dm_messages_thread_idx on public.dm_messages (thread_id, id);
create index dm_messages_sender_idx on public.dm_messages (sender_id, created_at desc);
alter table public.dm_messages enable row level security;
revoke all on public.dm_messages from anon, authenticated;

alter table public.community_uploads add column message_id bigint references public.dm_messages(id) on delete set null;
create index community_uploads_message_idx on public.community_uploads (message_id);
drop index if exists public.community_uploads_orphan_idx;
create index community_uploads_orphan_idx on public.community_uploads (created_at) where post_id is null and listing_id is null and message_id is null;

revoke all on sequence public.market_listings_id_seq, public.dm_threads_id_seq, public.dm_messages_id_seq from anon, authenticated;

-- ───────────────────────── 도우미 ─────────────────────────
-- 장터 이용 자격: 선수를 1명 이상 연결한 회원(신분 무관 — 학부모·지도자 포함)
create or replace function private.market_eligible(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.athlete_links where profile_id = p_uid)
$$;

-- 장터 쓰기 공통 검사(로그인·정지·자격·전용 닉네임) → 지금 얼굴(y/c)
create or replace function private.market_persona(p_me uuid)
returns text language plpgsql stable security definer set search_path = public, private as $$
begin
  if p_me is null then raise exception 'login'; end if;
  if not private.market_eligible(p_me) then raise exception 'market_not_eligible'; end if;
  return private.writer_persona(p_me, false);
end $$;

-- 둘 중 한 명이라도 상대를 차단했는지
create or replace function private.blocked_either(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.community_blocks b where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a))
$$;

-- 장터 글의 사진 묶음(올린 순서 = 첫 장이 대표)
create or replace function private.listing_images(p_listing bigint, p_ids bigint[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'thumb', u.thumb, 'w', u.width, 'h', u.height)
                            order by array_position(p_ids, u.id)), '[]'::jsonb)
    from public.community_uploads u where u.listing_id = p_listing and u.id = any (p_ids)
$$;

-- 목록·상세에 쓰는 장터 글 요약(jsonb)
create or replace function private.listing_json(l public.market_listings, p_me uuid)
returns jsonb language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object(
    'id', l.id, 'kind', l.kind, 'title', l.title, 'category', l.category, 'weapon', l.weapon,
    'price', l.price, 'price_min', l.price_min, 'price_max', l.price_max, 'price_nego', l.price_nego,
    'usage_period', l.usage_period, 'condition', l.condition, 'hand', l.hand, 'size', l.size,
    'regions', l.regions, 'delivery', l.delivery, 'trade_status', l.trade_status, 'status', l.status,
    'thumb', l.images->0->>'thumb', 'image_count', jsonb_array_length(l.images),
    'created_at', l.created_at, 'edited', l.edited_at is not null, 'expires_at', l.expires_at, 'extend_count', l.extend_count,
    'view_count', l.view_count, 'is_mine', l.author_id = p_me,
    'card', private.content_card(l.author_id, l.persona, ''))
$$;

-- 장터 글 입력값 검사(jsonb → 정리된 값). 잘못되면 'bad_input:<항목>'
create or replace function private.market_clean(p_kind text, d jsonb)
returns jsonb language plpgsql immutable as $$
declare
  t text := btrim(coalesce(d->>'title', ''));
  pr int; pmin int; pmax int; nego boolean := coalesce((d->>'price_nego')::boolean, false);
begin
  if char_length(t) not between 1 and 60 then raise exception 'bad_input:title'; end if;
  if coalesce(d->>'category', '') not in ('검·부품','마스크','도복','장갑','신발','가방','바디코드·전자장비','기타') then raise exception 'bad_input:category'; end if;
  if nullif(d->>'weapon', '') is not null and d->>'weapon' not in ('에페','플뢰레','사브르','공용') then raise exception 'bad_input:weapon'; end if;
  if nullif(d->>'hand', '') is not null and d->>'hand' not in ('오른손','왼손','양손') then raise exception 'bad_input:hand'; end if;
  begin
    pr := nullif(d->>'price', '')::int; pmin := nullif(d->>'price_min', '')::int; pmax := nullif(d->>'price_max', '')::int;
  exception when others then raise exception 'bad_input:price';
  end;
  if p_kind = 'sell' then
    if pr is null or pr not between 0 and 100000000 then raise exception 'bad_input:price'; end if;
    if nullif(d->>'usage_period', '') is not null and d->>'usage_period' not in ('미사용','1개월 이하','1~6개월','6~12개월','1~2년','2년 이상') then raise exception 'bad_input:usage_period'; end if;
    if nullif(d->>'condition', '') is not null and d->>'condition' not in ('새상품','거의 새것','사용감 적음','사용감 많음','수리 필요') then raise exception 'bad_input:condition'; end if;
  else
    if not nego and (pmin is null or pmax is null or pmin < 0 or pmax > 100000000 or pmin > pmax) then raise exception 'bad_input:price'; end if;
    if nullif(d->>'condition', '') is not null and d->>'condition' not in ('새것','사용감 적음','상관없음') then raise exception 'bad_input:condition'; end if;
  end if;
  if char_length(coalesce(d->>'size', '')) > 20 then raise exception 'bad_input:size'; end if;
  if char_length(coalesce(d->>'regions', '')) > 60 then raise exception 'bad_input:regions'; end if;
  if char_length(coalesce(d->>'body', '')) > 3000 then raise exception 'bad_input:body'; end if;
  return jsonb_build_object(
    'title', t, 'category', d->>'category', 'weapon', nullif(d->>'weapon', ''),
    'price', case when p_kind = 'sell' then pr end,
    'price_min', case when p_kind = 'buy' and not nego then pmin end,
    'price_max', case when p_kind = 'buy' and not nego then pmax end,
    'price_nego', p_kind = 'buy' and nego,
    'usage_period', case when p_kind = 'sell' then nullif(d->>'usage_period', '') end,
    'condition', nullif(d->>'condition', ''), 'hand', nullif(d->>'hand', ''),
    'size', nullif(btrim(coalesce(d->>'size', '')), ''), 'regions', nullif(btrim(coalesce(d->>'regions', '')), ''),
    'delivery', coalesce((d->>'delivery')::boolean, false), 'body', btrim(coalesce(d->>'body', '')));
end $$;

-- ───────────────────────── 장터 RPC ─────────────────────────
-- 내 장터 이용 상태: 자격(선수 연결)·정지
create or replace function public.market_status()
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if me is null then return null; end if;
  return jsonb_build_object('eligible', private.market_eligible(me), 'banned', (private.active_ban(me)).id is not null);
end $$;

-- 목록. p_kind: sell|buy|null(전체), p_trade: open(거래 전)|done(거래 완료)|null, p_mine: 내 글(만료·가려진 글 포함)
create or replace function public.market_list(p_kind text default null, p_category text default null, p_weapon text default null,
                                              p_trade text default null, p_q text default null, p_mine boolean default false,
                                              p_offset int default 0, p_limit int default 24)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  me uuid := auth.uid(); q text := nullif(btrim(coalesce(p_q, '')), ''); pat text;
  lim int := least(greatest(coalesce(p_limit, 24), 1), 48); items jsonb;
begin
  if me is null then raise exception 'login'; end if;
  perform private.throttle();
  if q is not null then pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  -- 조건에 맞는 id 를 먼저 고르고(쪽 나누기), 그 행들을 표 형식 그대로 listing_json 에 넘긴다
  select coalesce(jsonb_agg(private.listing_json(m, me) order by m.created_at desc), '[]'::jsonb) into items
    from public.market_listings m
   where m.id in (
    select l.id from public.market_listings l
     where (case when coalesce(p_mine, false) then l.author_id = me and l.status <> 'deleted' else l.status = 'active' end)
       and (coalesce(p_mine, false) or not private.blocked_by(me, l.author_id))
       and (p_kind is null or l.kind = p_kind)
       and (p_category is null or l.category = p_category)
       and (p_weapon is null or l.weapon = p_weapon or l.weapon = '공용')
       and (p_trade is null or (p_trade = 'open' and l.trade_status in ('판매중','예약중','구하는 중'))
                            or (p_trade = 'done' and l.trade_status in ('거래완료','구했어요')))
       and (pat is null or l.title ilike pat or l.body ilike pat)
     order by l.created_at desc offset greatest(coalesce(p_offset, 0), 0) limit lim + 1);
  return jsonb_build_object('items', case when jsonb_array_length(items) > lim then items - lim else items end, 'has_more', jsonb_array_length(items) > lim);
end $$;

-- 상세. 숨김(신고)·만료 글은 작성자·관리자만. my_thread = 내가 이미 이 글로 시작한 대화방 id
create or replace function public.market_get(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); l public.market_listings; v_admin boolean := public.is_admin_user();
begin
  if me is null then raise exception 'login'; end if;
  perform private.throttle();
  select * into l from public.market_listings where id = p_id;
  if l.id is null or l.status = 'deleted' or (l.status in ('hidden','expired') and l.author_id is distinct from me and not v_admin) then raise exception 'not_found'; end if;
  if private.blocked_by(me, l.author_id) and not v_admin then return jsonb_build_object('id', l.id, 'blocked', true); end if;
  return private.listing_json(l, me) || jsonb_build_object(
    'body', l.body, 'images', l.images, 'is_admin', v_admin, 'eligible', private.market_eligible(me),
    'my_thread', (select t.id from public.dm_threads t where t.listing_id = l.id and t.a_id = me));
end $$;

create or replace function public.market_view(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.market_listings set view_count = view_count + 1 where id = p_id and status = 'active' and auth.uid() is not null;
$$;

-- 글쓰기. p_data = 입력값(jsonb), p_uploads = 사진 id(첫 장 = 대표, 판매 10장·구매 1장). 1분 1개·24시간 20개
create or replace function public.market_write(p_kind text, p_data jsonb, p_uploads bigint[] default '{}')
returns bigint language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); per text; d jsonb; ups bigint[] := coalesce(p_uploads, '{}'); new_id bigint;
begin
  per := private.market_persona(me);
  if p_kind not in ('sell','buy') then raise exception 'bad_input:kind'; end if;
  d := private.market_clean(p_kind, p_data);
  perform pg_advisory_xact_lock(hashtext('market-write:' || me::text));
  if exists (select 1 from public.market_listings where author_id = me and created_at > now() - interval '1 minute') then raise exception 'rate_post_min'; end if;
  if (select count(*) from public.market_listings where author_id = me and created_at > now() - interval '24 hours') >= 20 then raise exception 'rate_market_day'; end if;
  if cardinality(ups) > (case when p_kind = 'sell' then 10 else 1 end)
     or cardinality(ups) <> (select count(*) from public.community_uploads where id = any (ups) and user_id = me and kind = 'market'
                              and post_id is null and listing_id is null and message_id is null) then
    raise exception 'uploads_invalid';
  end if;
  insert into public.market_listings (author_id, persona, kind, title, category, weapon, price, price_min, price_max, price_nego,
      usage_period, condition, hand, size, regions, delivery, body, trade_status, expires_at)
  values (me, per, p_kind, d->>'title', d->>'category', d->>'weapon', (d->>'price')::int, (d->>'price_min')::int, (d->>'price_max')::int,
      (d->>'price_nego')::boolean, d->>'usage_period', d->>'condition', d->>'hand', d->>'size', d->>'regions', (d->>'delivery')::boolean,
      d->>'body', case when p_kind = 'sell' then '판매중' else '구하는 중' end,
      now() + case when p_kind = 'sell' then interval '6 months' else interval '30 days' end)
  returning id into new_id;
  update public.community_uploads set listing_id = new_id where id = any (ups);
  update public.market_listings set images = private.listing_images(new_id, ups) where id = new_id;
  return new_id;
end $$;

-- 수정(작성자, 게시 중인 글만). 판매/구매 종류는 바꿀 수 없다
create or replace function public.market_edit(p_id bigint, p_data jsonb, p_uploads bigint[] default '{}')
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); l public.market_listings; d jsonb; ups bigint[] := coalesce(p_uploads, '{}');
begin
  perform private.market_persona(me);
  select * into l from public.market_listings where id = p_id for update;
  if l.id is null or l.status <> 'active' then raise exception 'not_found'; end if;
  if l.author_id is distinct from me then raise exception 'not_mine'; end if;
  d := private.market_clean(l.kind, p_data);
  if cardinality(ups) > (case when l.kind = 'sell' then 10 else 1 end)
     or cardinality(ups) <> (select count(*) from public.community_uploads where id = any (ups) and user_id = me and kind = 'market'
                              and post_id is null and message_id is null and (listing_id is null or listing_id = p_id)) then
    raise exception 'uploads_invalid';
  end if;
  update public.community_uploads set listing_id = null where listing_id = p_id and not (id = any (ups));
  update public.community_uploads set listing_id = p_id where id = any (ups);
  update public.market_listings set
      title = d->>'title', category = d->>'category', weapon = d->>'weapon', price = (d->>'price')::int, price_min = (d->>'price_min')::int,
      price_max = (d->>'price_max')::int, price_nego = (d->>'price_nego')::boolean, usage_period = d->>'usage_period', condition = d->>'condition',
      hand = d->>'hand', size = d->>'size', regions = d->>'regions', delivery = (d->>'delivery')::boolean, body = d->>'body',
      images = private.listing_images(p_id, ups), edited_at = now()
   where id = p_id;
end $$;

-- 거래 상태 바꾸기: 판매 글 = 판매중·예약중·거래완료, 구매 글 = 구하는 중·구했어요
create or replace function public.market_set_trade(p_id bigint, p_trade text)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); l public.market_listings;
begin
  if me is null then raise exception 'login'; end if;
  select * into l from public.market_listings where id = p_id;
  if l.id is null or l.status not in ('active','expired') then raise exception 'not_found'; end if;
  if l.author_id is distinct from me then raise exception 'not_mine'; end if;
  if (l.kind = 'sell' and p_trade not in ('판매중','예약중','거래완료')) or (l.kind = 'buy' and p_trade not in ('구하는 중','구했어요')) then
    raise exception 'bad_input:trade';
  end if;
  update public.market_listings set trade_status = p_trade where id = p_id;
end $$;

-- 연장(2회까지): 만료 7일 전부터(구매 글은 3일 전부터) 또는 만료 후 30일 안. 지금(또는 원래 만료일) 기준으로 6개월/30일 늘린다
create or replace function public.market_extend(p_id bigint)
returns timestamptz language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); l public.market_listings; win interval; u timestamptz;
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  select * into l from public.market_listings where id = p_id for update;
  if l.id is null or l.status not in ('active','expired') then raise exception 'not_found'; end if;
  if l.author_id is distinct from me then raise exception 'not_mine'; end if;
  if l.extend_count >= 2 then raise exception 'extend_limit'; end if;
  win := case when l.kind = 'sell' then interval '7 days' else interval '3 days' end;
  if l.expires_at > now() + win then raise exception 'extend_early'; end if;
  u := greatest(now(), l.expires_at) + case when l.kind = 'sell' then interval '6 months' else interval '30 days' end;
  update public.market_listings set expires_at = u, extend_count = extend_count + 1, expiry_notified = false,
         status = 'active', status_reason = null where id = p_id;
  return u;
end $$;

create or replace function public.market_delete(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  update public.market_listings set status = 'deleted', deleted_at = now(), status_by = me, status_reason = '작성자 삭제'
   where id = p_id and author_id = me and status <> 'deleted';
  if not found then raise exception 'not_found'; end if;
end $$;

-- ───────────────────────── 1:1 채팅 RPC ─────────────────────────
-- 대화 시작: 장터 글에서 '판매자와 채팅하기'(판매 글) / '제 물건 있어요'(구매 글). 이미 있으면 그 대화방. p_first 가 있으면 첫 메시지로 보낸다
create or replace function public.dm_start(p_listing bigint, p_first text default null)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); per text; l public.market_listings; tid bigint;
begin
  per := private.market_persona(me);
  select * into l from public.market_listings where id = p_listing;
  if l.id is null or l.status <> 'active' or l.author_id is null then raise exception 'not_found'; end if;
  if l.author_id = me then raise exception 'dm_own'; end if;
  if private.blocked_either(me, l.author_id) then raise exception 'dm_blocked'; end if;
  select id into tid from public.dm_threads where listing_id = p_listing and a_id = me;
  if tid is null then
    perform pg_advisory_xact_lock(hashtext('dm-start:' || me::text));
    if (select count(*) from public.dm_threads where a_id = me and created_at > now() - interval '24 hours') >= 30 then raise exception 'rate_dm_start'; end if;
    insert into public.dm_threads (listing_id, listing_title, a_id, b_id, a_persona, b_persona)
    values (p_listing, l.title, me, l.author_id, per, l.persona) returning id into tid;
  else
    update public.dm_threads set a_left = false where id = tid;
  end if;
  if nullif(btrim(coalesce(p_first, '')), '') is not null then perform public.dm_send(tid, p_first, null); end if;
  return tid;
end $$;

-- 대화방 목록: 상대 카드, 장터 글 요약, 마지막 메시지, 안 읽음 여부
create or replace function public.dm_list()
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'last_message_at') desc) from (
    select jsonb_build_object(
      'id', t.id, 'listing_id', t.listing_id, 'listing_title', t.listing_title, 'last_message_at', t.last_message_at,
      'listing_thumb', l.images->0->>'thumb', 'listing_kind', l.kind, 'trade_status', l.trade_status,
      'i_am_seller', t.b_id = me,
      'other', case when private.blocked_by(me, case when t.a_id = me then t.b_id else t.a_id end) then jsonb_build_object('kind', 'gone', 'nickname', '차단한 회원')
                    else private.content_card(case when t.a_id = me then t.b_id else t.a_id end, case when t.a_id = me then t.b_persona else t.a_persona end, '') end,
      'last', (select jsonb_build_object('body', left(m.body, 60), 'image', m.image is not null, 'mine', m.sender_id = me)
                 from public.dm_messages m where m.thread_id = t.id and m.status = 'active' order by m.id desc limit 1),
      'unread', exists (select 1 from public.dm_messages m where m.thread_id = t.id and m.status = 'active' and m.sender_id is distinct from me
                        and m.created_at > coalesce(case when t.a_id = me then t.a_read_at else t.b_read_at end, '-infinity'))) x
      from public.dm_threads t left join public.market_listings l on l.id = t.listing_id
     where (t.a_id = me and not t.a_left) or (t.b_id = me and not t.b_left)
     order by t.last_message_at desc limit 100) s), '[]'::jsonb);
end $$;

-- 대화방 열기 + 메시지(p_after 보다 새 것만 — 화면이 몇 초마다 새 메시지를 가져올 때). 연 사람의 읽음 시각을 갱신한다
create or replace function public.dm_thread(p_thread bigint, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); t public.dm_threads; other uuid; other_read timestamptz;
begin
  if me is null then raise exception 'login'; end if;
  select * into t from public.dm_threads where id = p_thread;
  if t.id is null or (t.a_id is distinct from me and t.b_id is distinct from me) then raise exception 'not_found'; end if;
  other := case when t.a_id = me then t.b_id else t.a_id end;
  other_read := case when t.a_id = me then t.b_read_at else t.a_read_at end;
  if t.a_id = me then update public.dm_threads set a_read_at = now() where id = p_thread;
  else update public.dm_threads set b_read_at = now() where id = p_thread; end if;
  return jsonb_build_object(
    'id', t.id, 'listing_id', t.listing_id, 'listing_title', t.listing_title, 'i_am_seller', t.b_id = me,
    'other', private.content_card(other, case when t.a_id = me then t.b_persona else t.a_persona end, ''),
    'blocked', other is not null and private.blocked_either(me, other),
    'other_left', case when t.a_id = me then t.b_left else t.a_left end or other is null,
    'other_read_at', other_read,
    'listing', (select jsonb_build_object('status', l.status, 'trade_status', l.trade_status, 'kind', l.kind, 'thumb', l.images->0->>'thumb',
                                          'price', l.price, 'price_min', l.price_min, 'price_max', l.price_max, 'price_nego', l.price_nego)
                  from public.market_listings l where l.id = t.listing_id),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mine', m.sender_id = me, 'body', case when m.status = 'active' then m.body end,
                                   'image', case when m.status = 'active' then m.image end, 'status', m.status, 'created_at', m.created_at) order by m.id)
                            from public.dm_messages m where m.thread_id = p_thread and m.id > coalesce(p_after, 0)
                              and m.created_at > now() - interval '30 days'), '[]'::jsonb));
end $$;

-- 메시지 보내기(글 1,000자 또는 사진 1장). 차단·정지면 불가, 1분 30개. 상대가 이 대화방의 안 읽은 알림이 없을 때만 알림
create or replace function public.dm_send(p_thread bigint, p_body text, p_upload bigint default null)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); t public.dm_threads; other uuid; img jsonb; mid bigint; v_link text; body text := btrim(coalesce(p_body, ''));
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  select * into t from public.dm_threads where id = p_thread;
  if t.id is null or (t.a_id is distinct from me and t.b_id is distinct from me) then raise exception 'not_found'; end if;
  other := case when t.a_id = me then t.b_id else t.a_id end;
  if other is null then raise exception 'dm_gone'; end if;
  if private.blocked_either(me, other) then raise exception 'dm_blocked'; end if;
  if char_length(body) = 0 and p_upload is null then raise exception 'bad_input:body'; end if;
  if char_length(body) > 1000 then raise exception 'bad_input:body'; end if;
  perform pg_advisory_xact_lock(hashtext('dm-send:' || me::text));
  if (select count(*) from public.dm_messages where sender_id = me and created_at > now() - interval '1 minute') >= 30 then raise exception 'rate_dm'; end if;
  if p_upload is not null then
    select jsonb_build_object('id', u.id, 'path', u.path, 'thumb', u.thumb, 'w', u.width, 'h', u.height) into img
      from public.community_uploads u where u.id = p_upload and u.user_id = me and u.kind = 'dm' and u.message_id is null and u.post_id is null and u.listing_id is null;
    if img is null then raise exception 'uploads_invalid'; end if;
  end if;
  insert into public.dm_messages (thread_id, sender_id, body, image) values (p_thread, me, body, img) returning id into mid;
  if p_upload is not null then update public.community_uploads set message_id = mid where id = p_upload; end if;
  update public.dm_threads set last_message_at = now(), a_left = false, b_left = false,
         a_read_at = case when a_id = me then now() else a_read_at end, b_read_at = case when b_id = me then now() else b_read_at end
   where id = p_thread;
  v_link := '/community/messages/' || p_thread;
  if not exists (select 1 from public.notifications n where n.user_id = other and n.kind = 'dm' and n.link = v_link and n.read_at is null) then
    perform private.notify(other, 'dm', '새 1:1 채팅 메시지가 왔어요', '「' || left(t.listing_title, 30) || '」 ' || case when char_length(body) > 0 then left(body, 60) else '사진' end, v_link, me);
  end if;
  return mid;
end $$;

-- 대화방 나가기(내 목록에서 숨김). 상대가 새 메시지를 보내면 다시 보인다
create or replace function public.dm_leave(p_thread bigint)
returns void language sql security definer set search_path = public as $$
  update public.dm_threads set a_left = case when a_id = auth.uid() then true else a_left end,
                               b_left = case when b_id = auth.uid() then true else b_left end
   where id = p_thread and (a_id = auth.uid() or b_id = auth.uid());
$$;

-- ───────────────────────── 신고·차단 대상 / 자동 숨김 / 관리자 확장 ─────────────────────────
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
    -- 1:1 채팅 신고·차단: 대상 = 신고한 사람의 상대. 사본 = 최근 메시지 30개(누가 보냈는지는 '신고자/상대'로만)
    return query select case when t.a_id = me then t.b_id else t.a_id end,
        coalesce(private.content_card(case when t.a_id = me then t.b_id else t.a_id end, case when t.a_id = me then t.b_persona else t.a_persona end, '')->>'nickname', '회원'),
        jsonb_build_object('persona', case when t.a_id = me then t.b_persona else t.a_persona end, 'thread_id', t.id, 'title', t.listing_title,
          'nickname', private.content_card(case when t.a_id = me then t.b_id else t.a_id end, case when t.a_id = me then t.b_persona else t.a_persona end, '')->>'nickname',
          'messages', (select jsonb_agg(jsonb_build_object('from', case when m.sender_id = me then '신고자' else '상대' end, 'body', m.body,
                                                           'image', m.image->>'path', 'at', m.created_at) order by m.id)
                         from (select * from public.dm_messages where thread_id = t.id order by id desc limit 30) m))
      from public.dm_threads t where t.id = p_ref::bigint and (t.a_id = me or t.b_id = me or public.is_admin_user());
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
  end if;
end $$;

-- 관리자 글 상태 바꾸기: 장터 글(listing)까지
create or replace function public.admin_set_content_status(p_kind text, p_ref text, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); author uuid; pid bigint; what text;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  if p_status not in ('active','hidden','deleted') then raise exception '잘못된 상태입니다'; end if;
  if p_kind = 'post' then
    update public.community_posts
       set status = p_status, status_reason = nullif(btrim(coalesce(p_reason, '')), ''), status_by = me,
           deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning author_id, id into author, pid;
    what := '게시글이';
  elsif p_kind = 'comment' then
    update public.community_comments
       set status = p_status, status_reason = nullif(btrim(coalesce(p_reason, '')), ''), status_by = me,
           deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning author_id, post_id into author, pid;
    if pid is not null then perform private.recount_comments(pid); end if;
    what := '댓글이';
  elsif p_kind = 'listing' then
    update public.market_listings
       set status = case when p_status = 'active' and expires_at < now() then 'expired' else p_status end,
           status_reason = nullif(btrim(coalesce(p_reason, '')), ''), status_by = me,
           deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning author_id, id into author, pid;
    what := '장터 글이';
  else
    raise exception '글·댓글·장터 글만 처리할 수 있습니다';
  end if;
  if pid is null then raise exception '대상을 찾을 수 없습니다'; end if;
  if p_status = 'deleted' then
    perform private.notify(author, 'sanction', '운영 기준에 따라 ' || what || ' 삭제되었어요',
      coalesce('사유: ' || nullif(btrim(coalesce(p_reason, '')), '') || ' · ', '') || '이의가 있으면 고객지원으로 알려 주세요', '/support');
  end if;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (me, 'content_' || p_status, p_kind || ':' || p_ref, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_reveal_author(p_kind text, p_ref text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); uid uuid;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  if p_kind = 'post' and p_ref ~ '^[0-9]{1,18}$' then select author_id into uid from public.community_posts where id = p_ref::bigint;
  elsif p_kind = 'comment' and p_ref ~ '^[0-9]{1,18}$' then select author_id into uid from public.community_comments where id = p_ref::bigint;
  elsif p_kind = 'listing' and p_ref ~ '^[0-9]{1,18}$' then select author_id into uid from public.market_listings where id = p_ref::bigint;
  else select r.user_id into uid from private.resolve_target(p_kind, p_ref) r limit 1;
  end if;
  insert into public.admin_audit (admin_id, action, target) values (me, 'reveal_author', p_kind || ':' || p_ref);
  if uid is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'user_id', uid,
    'nickname', (select nickname from public.profiles where id = uid),
    'community_nickname', (select nickname from public.community_profiles where user_id = uid));
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
           rp.nickname reporter_nickname,
           (select count(*) from public.community_reports x where x.target_kind = r.target_kind and x.target_ref = r.target_ref) same_target_count,
           (select count(*) from public.community_reports x where x.target_user_id = r.target_user_id) target_user_count,
           (select b.until from public.community_bans b where b.user_id = r.target_user_id and b.lifted_at is null and (b.until is null or b.until > now()) order by b.until desc nulls first limit 1) ban_until,
           exists (select 1 from public.community_bans b where b.user_id = r.target_user_id and b.lifted_at is null and b.until is null) ban_permanent,
           case r.target_kind
             when 'post' then (select status from public.community_posts where id = r.target_ref::bigint)
             when 'comment' then (select status from public.community_comments where id = r.target_ref::bigint)
             when 'listing' then (select case when status = 'expired' then 'active' else status end from public.market_listings where id = r.target_ref::bigint)
           end content_status
      from public.community_reports r
      cross join lateral (select coalesce(r.snapshot->>'persona', '') = 'a' anon) a
      left join public.profiles tp on tp.id = r.target_user_id
      left join public.community_profiles tc on tc.user_id = r.target_user_id
      left join public.profiles rp on rp.id = r.reporter_id
     where p_status = 'all' or r.status = p_status
     order by r.created_at desc
     limit 100) t), '[]'::jsonb);
end $$;

-- 삭제 콘텐츠 백업: 장터 글까지
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
      where l.status = 'deleted' and l.deleted_at >= p_from and l.deleted_at < p_to), '[]'::jsonb));
end $$;

-- ───────────────────────── 매일 정리 (2단계 함수 교체) ─────────────────────────
--  · 장터: 만료 알림(판매 7일·구매 3일 전, 한 번) → 만료 처리 → 만료 후 30일 지나면 삭제 처리(다음 달 1일 완전 삭제·사진 정리)
--  · 1:1 채팅: 30일 지난 메시지 삭제(사진 기록은 비워져 사진 API 가 파일 정리), 30일 동안 메시지 없는 대화방 삭제
--  · 말일 하루 전 백업 알림 / 1일 완전 삭제(게시글·댓글·장터 글)
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

  if today + 1 = (date_trunc('month', today::timestamp) + interval '1 month' - interval '1 day')::date then
    perform private.notify_admins('내일이 이달 마지막 날이에요 — 삭제된 커뮤니티 글 백업',
      '다음 달 1일 0시에 이달 삭제된 글·댓글·장터 글이 완전히 지워져요. 관리자 페이지 > 신고 > 삭제 콘텐츠 백업에서 내려받아 주세요', '/admin?tab=reports');
  end if;
  if extract(day from today) = 1 then
    cutoff := date_trunc('month', today::timestamp) at time zone 'Asia/Seoul';
    update public.community_reports r set snapshot = jsonb_build_object('purged', true, 'persona', r.snapshot->>'persona')
     where (r.target_kind = 'post' and r.target_ref in (select id::text from public.community_posts where status = 'deleted' and deleted_at < cutoff))
        or (r.target_kind = 'listing' and r.target_ref in (select id::text from public.market_listings where status = 'deleted' and deleted_at < cutoff))
        or (r.target_kind = 'comment' and r.target_ref in (select c.id::text from public.community_comments c
              where c.status = 'deleted' and c.deleted_at < cutoff and not exists (select 1 from public.community_comments x where x.parent_id = c.id and x.status <> 'deleted')));
    delete from public.community_comments c
     where c.status = 'deleted' and c.deleted_at < cutoff
       and not exists (select 1 from public.community_comments x where x.parent_id = c.id and x.status <> 'deleted');
    delete from public.community_posts where status = 'deleted' and deleted_at < cutoff;
    delete from public.market_listings where status = 'deleted' and deleted_at < cutoff;
  end if;
end $$;

-- ───────────────────────── 권한 (로그인 회원만) ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.market_status()', 'public.market_list(text, text, text, text, text, boolean, int, int)', 'public.market_get(bigint)',
    'public.market_view(bigint)', 'public.market_write(text, jsonb, bigint[])', 'public.market_edit(bigint, jsonb, bigint[])',
    'public.market_set_trade(bigint, text)', 'public.market_extend(bigint)', 'public.market_delete(bigint)',
    'public.dm_start(bigint, text)', 'public.dm_list()', 'public.dm_thread(bigint, bigint)', 'public.dm_send(bigint, text, bigint)', 'public.dm_leave(bigint)',
    'public.admin_set_content_status(text, text, text, text)', 'public.admin_reveal_author(text, text)',
    'public.admin_community_reports(text)', 'public.admin_deleted_content(timestamptz, timestamptz)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
