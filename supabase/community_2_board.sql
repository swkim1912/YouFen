-- 커뮤니티 2단계 게시판 (마이그레이션 34 `community_board`, 2026-10-08, 브랜치 feature/community)
-- ※ board_write/board_edit 의 사진 조건(kind='post', listing_id·message_id 비어 있음)은 3단계에서 열을 추가한 뒤 `community_board_upload_kind` 로 바꾼 최종본이다.
-- 기획: docs/COMMUNITY.md 2장. 1단계(community_1_foundation.sql)의 카드·알림·신고·차단·정지 위에 올린다.
-- 표: community_posts(글) / community_comments(댓글·답글 1단계) / community_post_likes(좋아요) / community_uploads(사진 파일 기록)
-- 원칙
--  · 표는 RLS 를 켜고 정책 없이 RPC(SECURITY DEFINER)로만 읽고 쓴다 → 작성자 회원 id(author_id)는 절대 화면에 나가지 않는다.
--  · 글·댓글은 쓸 때의 얼굴(persona: y=유펜, c=커뮤니티 전용, a=익명)을 저장한다. 설정을 바꿔도 예전 글 표시가 바뀌지 않는다.
--  · 익명 번호(anon_no)는 글마다 사람별로 고정(익명1, 익명2…). 익명 글을 쓴 사람의 익명 댓글은 0 = '글쓴이'.
--  · 삭제는 숨김(status='deleted') 후 다음 달 1일 0시(KST)에 완전 삭제, 그 전날의 전날(말일 하루 전) 관리자에게 백업 알림.
--  · 서로 다른 3명이 신고하면 자동 숨김(status='hidden') → 관리자가 복구 또는 삭제.
--  · 로그인 회원만 읽고 쓴다. 커뮤니티 정지 중이면 쓰기·좋아요 불가(읽기 가능).

-- ───────────────────────── 표 ─────────────────────────
create table public.community_posts (
  id bigint generated always as identity primary key,
  author_id uuid references public.profiles(id) on delete set null,   -- 탈퇴하면 비워지고 '탈퇴 회원'으로 보인다(글은 남음)
  persona text not null check (persona in ('y','c','a')),
  tags text[] not null default '{자유}'
    check (cardinality(tags) between 1 and 8 and tags <@ array['자유','대회','장비','기술','에페','플뢰레','사브르','학부모']),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  images jsonb not null default '[]' check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 3),
  is_notice boolean not null default false,                            -- 공지(관리자만, 목록 맨 위 고정)
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  status_reason text,
  status_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  like_count int not null default 0,
  comment_count int not null default 0,
  view_count int not null default 0,
  like_milestone int not null default 0,                               -- 이미 알린 좋아요 단계(10·50·100)
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index community_posts_list_idx on public.community_posts (status, created_at desc);
create index community_posts_tags_idx on public.community_posts using gin (tags);
create index community_posts_author_idx on public.community_posts (author_id, created_at desc);
alter table public.community_posts enable row level security;
revoke all on public.community_posts from anon, authenticated;

create table public.community_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.community_posts(id) on delete cascade,
  parent_id bigint references public.community_comments(id) on delete cascade,  -- 답글이면 부모(최상위) 댓글, 답글의 답글은 같은 부모로 붙인다
  author_id uuid references public.profiles(id) on delete set null,
  persona text not null check (persona in ('y','c','a')),
  anon_no int,                                                                    -- persona='a' 일 때만: 0=글쓴이, 1·2…=익명 번호
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  status_reason text,
  status_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index community_comments_post_idx on public.community_comments (post_id, id);
create index community_comments_author_idx on public.community_comments (author_id, created_at desc);
alter table public.community_comments enable row level security;
revoke all on public.community_comments from anon, authenticated;

create table public.community_post_likes (
  post_id bigint not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.community_post_likes enable row level security;
revoke all on public.community_post_likes from anon, authenticated;

-- 올린 사진 기록(서버 API /api/community-image 만 쓴다). 글에 붙지 않은 채 하루가 지나면(글 작성 취소·수정으로 빠짐·글 완전 삭제) API 가 파일과 함께 지운다
create table public.community_uploads (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  path text not null unique,           -- 버킷 community 안 경로(큰 사진)
  thumb text not null,                 -- 목록용 작은 사진 경로
  width int, height int,
  post_id bigint references public.community_posts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index community_uploads_post_idx on public.community_uploads (post_id);
create index community_uploads_orphan_idx on public.community_uploads (created_at) where post_id is null;
create index community_uploads_user_idx on public.community_uploads (user_id, created_at desc);
alter table public.community_uploads enable row level security;
revoke all on public.community_uploads from anon, authenticated;

-- 사진 버킷: 읽기 공개(주소를 아는 사람), 쓰기는 서버 API(서비스 키)만. 파일은 서버가 다시 만든 webp 만(최대 2MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- ───────────────────────── 공용 도우미 ─────────────────────────
-- 글·댓글의 작성자 카드. 익명이면 이름표만(누구인지 정보 없음), 탈퇴 회원이면 'gone'
create or replace function private.content_card(p_author uuid, p_persona text, p_anon_label text)
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
begin
  if p_persona = 'a' then return jsonb_build_object('kind', 'a', 'nickname', p_anon_label); end if;
  if p_author is null then return jsonb_build_object('kind', 'gone', 'nickname', '탈퇴 회원'); end if;
  return private.persona_card(p_author, p_persona);
end $$;

-- viewer 가 author 를 차단했는지
create or replace function private.blocked_by(p_viewer uuid, p_author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_author is not null and exists (select 1 from public.community_blocks b where b.blocker_id = p_viewer and b.blocked_id = p_author)
$$;

-- 쓰기 전 공통 검사: 로그인 + 커뮤니티 정지 아님. 지금 쓸 얼굴(persona)을 돌려준다(익명이면 'a')
create or replace function private.writer_persona(p_me uuid, p_anonymous boolean)
returns text language plpgsql stable security definer set search_path = public, private as $$
declare per text;
begin
  if p_me is null then raise exception 'login'; end if;
  if (private.active_ban(p_me)).id is not null then raise exception 'community_banned'; end if;
  if p_anonymous then return 'a'; end if;
  per := private.my_persona(p_me);
  if per = 'c' and (select nickname from public.community_profiles where user_id = p_me) is null then
    raise exception 'community_need_nick';
  end if;
  return per;
end $$;

-- 사진 묶음(jsonb): 업로드 id 순서대로 {id, path, thumb, w, h}
create or replace function private.post_images(p_post bigint, p_ids bigint[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'thumb', u.thumb, 'w', u.width, 'h', u.height)
                            order by array_position(p_ids, u.id)), '[]'::jsonb)
    from public.community_uploads u where u.post_id = p_post and u.id = any (p_ids)
$$;

-- 글의 댓글 수(보이는 댓글만) 다시 세기
create or replace function private.recount_comments(p_post bigint)
returns void language sql security definer set search_path = public as $$
  update public.community_posts set comment_count = (select count(*) from public.community_comments c where c.post_id = p_post and c.status = 'active')
   where id = p_post;
$$;

-- ───────────────────────── 목록·상세 ─────────────────────────
-- 목록. p_tab: all(최신순, 첫 쪽에 공지) | hot_like(최근 7일 좋아요 많은 20) | hot_comment(최근 7일 댓글 많은 20) | mine(내 글)
-- p_tags: 말머리 합집합 필터, p_q + p_field(title|body|both): 검색. 차단한 회원의 글은 빠진다.
create or replace function public.board_list(p_tab text default 'all', p_tags text[] default null, p_q text default null,
                                             p_field text default 'both', p_offset int default 0, p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  me uuid := auth.uid();
  q text := nullif(btrim(coalesce(p_q, '')), '');
  pat text;
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  tg text[] := nullif(p_tags, '{}');
  items jsonb; notices jsonb := '[]'::jsonb;
begin
  if me is null then raise exception 'login'; end if;
  perform private.throttle();
  if q is not null then pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;

  with base as (
    select p.* from public.community_posts p
     where (case when p_tab = 'mine' then p.author_id = me and p.status <> 'deleted' else p.status = 'active' end)
       and (p_tab = 'mine' or not private.blocked_by(me, p.author_id))
       and (tg is null or p.tags && tg)
       and (pat is null or (p_field in ('title','both') and p.title ilike pat) or (p_field in ('body','both') and p.body ilike pat))
       and (p_tab not in ('hot_like','hot_comment') or p.created_at > now() - interval '7 days')
       and (p_tab <> 'hot_like' or p.like_count > 0)
       and (p_tab <> 'hot_comment' or p.comment_count > 0)
       and (p_tab <> 'all' or not p.is_notice)
  ), page as (
    select * from base
     order by case when p_tab = 'hot_like' then like_count when p_tab = 'hot_comment' then comment_count else 0 end desc, created_at desc
     offset case when p_tab in ('hot_like','hot_comment') then 0 else v_off end
     limit case when p_tab in ('hot_like','hot_comment') then 20 else lim + 1 end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'tags', tags, 'title', title, 'created_at', created_at, 'edited', edited_at is not null,
           'like_count', like_count, 'comment_count', comment_count, 'view_count', view_count,
           'image_count', jsonb_array_length(images), 'thumb', images->0->>'thumb', 'is_notice', is_notice, 'status', status,
           'card', private.content_card(author_id, persona, '익명'))
         order by case when p_tab = 'hot_like' then like_count when p_tab = 'hot_comment' then comment_count else 0 end desc, created_at desc), '[]'::jsonb)
    into items from page;

  if p_tab = 'all' and v_off = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'tags', tags, 'title', title, 'created_at', created_at, 'edited', edited_at is not null,
             'like_count', like_count, 'comment_count', comment_count, 'view_count', view_count,
             'image_count', jsonb_array_length(images), 'thumb', images->0->>'thumb', 'is_notice', true, 'status', status,
             'card', private.content_card(author_id, persona, '익명')) order by created_at desc), '[]'::jsonb)
      into notices from public.community_posts where is_notice and status = 'active';
  end if;

  return jsonb_build_object(
    'notices', notices,
    'items', case when jsonb_array_length(items) > lim and p_tab not in ('hot_like','hot_comment') then items - lim else items end,
    'has_more', p_tab not in ('hot_like','hot_comment') and jsonb_array_length(items) > lim);
end $$;

-- 글 상세 + 댓글 전체. 숨김(신고 누적) 글은 작성자·관리자만, 삭제된 글은 아무도 못 본다.
create or replace function public.board_post(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.community_posts; v_admin boolean := public.is_admin_user(); comments jsonb;
begin
  if me is null then raise exception 'login'; end if;
  perform private.throttle();
  select * into p from public.community_posts where id = p_id;
  if p.id is null or p.status = 'deleted' or (p.status = 'hidden' and p.author_id is distinct from me and not v_admin) then
    raise exception 'not_found';
  end if;
  if private.blocked_by(me, p.author_id) and not v_admin then
    return jsonb_build_object('id', p.id, 'blocked', true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'parent_id', c.parent_id, 'created_at', c.created_at, 'edited', c.edited_at is not null,
           'status', case when c.status <> 'active' then c.status when private.blocked_by(me, c.author_id) then 'blocked' else 'active' end,
           'body', case when c.status = 'active' and not private.blocked_by(me, c.author_id) then c.body end,
           'is_mine', c.author_id = me,
           -- '글쓴이' 표시는 글과 댓글의 얼굴이 같을 때만(익명 글에 실명 댓글을 달아도 둘이 이어지지 않게)
           'is_op', c.author_id is not null and c.author_id = p.author_id and c.persona = p.persona,
           'card', case when c.status = 'active' and not private.blocked_by(me, c.author_id)
                        then private.content_card(c.author_id, c.persona, case when c.anon_no = 0 then '글쓴이' else '익명' || c.anon_no end) end)
         order by coalesce(c.parent_id, c.id), c.id), '[]'::jsonb)
    into comments
    from public.community_comments c
   where c.post_id = p.id
     and (c.status = 'active' or (c.parent_id is null and exists (select 1 from public.community_comments r where r.parent_id = c.id and r.status = 'active')));

  return jsonb_build_object(
    'id', p.id, 'tags', p.tags, 'title', p.title, 'body', p.body, 'images', p.images, 'created_at', p.created_at,
    'edited', p.edited_at is not null, 'like_count', p.like_count, 'comment_count', p.comment_count, 'view_count', p.view_count,
    'is_notice', p.is_notice, 'status', p.status, 'anonymous', p.persona = 'a',
    'liked', exists (select 1 from public.community_post_likes l where l.post_id = p.id and l.user_id = me),
    'is_mine', p.author_id = me, 'is_admin', v_admin,
    'card', private.content_card(p.author_id, p.persona, '익명'),
    'comments', comments);
end $$;

-- 조회수 +1 (화면이 같은 세션에서 한 번만 부른다)
create or replace function public.board_view(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.community_posts set view_count = view_count + 1 where id = p_id and status = 'active' and auth.uid() is not null;
$$;

-- 내가 쓴 댓글 모아보기
create or replace function public.board_my_comments(p_offset int default 0, p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); lim int := least(greatest(coalesce(p_limit, 20), 1), 50); items jsonb;
begin
  if me is null then raise exception 'login'; end if;
  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into items from (
    select c.id, c.post_id, left(c.body, 120) body, c.created_at, c.persona = 'a' anonymous, p.title post_title, p.status post_status
      from public.community_comments c join public.community_posts p on p.id = c.post_id
     where c.author_id = me and c.status = 'active' and p.status <> 'deleted'
     order by c.created_at desc offset greatest(coalesce(p_offset, 0), 0) limit lim + 1) t;
  return jsonb_build_object('items', case when jsonb_array_length(items) > lim then items - lim else items end, 'has_more', jsonb_array_length(items) > lim);
end $$;

-- ───────────────────────── 글 쓰기·수정·삭제·좋아요 ─────────────────────────
-- 오류 코드(화면이 한글로 바꿈): login, community_banned, community_need_nick, rate_post_min, rate_post_day, bad_tags, notice_admin, uploads_invalid, not_found, not_mine
create or replace function public.board_write(p_title text, p_body text, p_tags text[], p_anonymous boolean default false,
                                              p_uploads bigint[] default '{}', p_notice boolean default false)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); per text; tg text[]; ups bigint[] := coalesce(p_uploads, '{}'); new_id bigint;
begin
  per := private.writer_persona(me, coalesce(p_anonymous, false));
  if coalesce(p_notice, false) and (not public.is_admin_user() or per = 'a') then raise exception 'notice_admin'; end if;
  tg := coalesce(nullif(array(select distinct t from unnest(coalesce(p_tags, '{}')) t), '{}'), '{자유}');
  if cardinality(tg) > 8 or not (tg <@ array['자유','대회','장비','기술','에페','플뢰레','사브르','학부모']) then raise exception 'bad_tags'; end if;
  -- 도배 방지(서버 시각 기준): 1분에 1개, 24시간 30개
  perform pg_advisory_xact_lock(hashtext('board-write:' || me::text));
  if exists (select 1 from public.community_posts where author_id = me and created_at > now() - interval '1 minute') then raise exception 'rate_post_min'; end if;
  if (select count(*) from public.community_posts where author_id = me and created_at > now() - interval '24 hours') >= 30 then raise exception 'rate_post_day'; end if;
  -- 사진: 내가 올렸고 아직 글에 붙지 않은 것만, 3장까지
  if cardinality(ups) > 3 or cardinality(ups) <> (select count(*) from public.community_uploads where id = any (ups) and user_id = me and kind = 'post'
                                                  and post_id is null and listing_id is null and message_id is null) then
    raise exception 'uploads_invalid';
  end if;
  insert into public.community_posts (author_id, persona, tags, title, body, is_notice)
  values (me, per, tg, btrim(p_title), btrim(p_body), coalesce(p_notice, false))
  returning id into new_id;
  update public.community_uploads set post_id = new_id where id = any (ups);
  update public.community_posts set images = private.post_images(new_id, ups) where id = new_id;
  return new_id;
end $$;

-- 글 수정(작성자만): 제목·내용·말머리·사진. 얼굴(익명 여부 포함)은 바꿀 수 없다.
create or replace function public.board_edit(p_id bigint, p_title text, p_body text, p_tags text[], p_uploads bigint[] default '{}')
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.community_posts; tg text[]; ups bigint[] := coalesce(p_uploads, '{}');
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  select * into p from public.community_posts where id = p_id for update;
  if p.id is null or p.status <> 'active' then raise exception 'not_found'; end if;
  if p.author_id is distinct from me then raise exception 'not_mine'; end if;
  tg := coalesce(nullif(array(select distinct t from unnest(coalesce(p_tags, '{}')) t), '{}'), '{자유}');
  if cardinality(tg) > 8 or not (tg <@ array['자유','대회','장비','기술','에페','플뢰레','사브르','학부모']) then raise exception 'bad_tags'; end if;
  if cardinality(ups) > 3 or cardinality(ups) <> (select count(*) from public.community_uploads
        where id = any (ups) and user_id = me and kind = 'post' and listing_id is null and message_id is null and (post_id is null or post_id = p_id)) then
    raise exception 'uploads_invalid';
  end if;
  update public.community_uploads set post_id = null where post_id = p_id and not (id = any (ups)); -- 빠진 사진은 하루 뒤 정리
  update public.community_uploads set post_id = p_id where id = any (ups);
  update public.community_posts
     set title = btrim(p_title), body = btrim(p_body), tags = tg, images = private.post_images(p_id, ups), edited_at = now()
   where id = p_id;
end $$;

-- 글 삭제(작성자): 숨김 후 다음 달 1일 완전 삭제
create or replace function public.board_delete(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  update public.community_posts set status = 'deleted', deleted_at = now(), status_by = me, status_reason = '작성자 삭제'
   where id = p_id and author_id = me and status <> 'deleted';
  if not found then raise exception 'not_found'; end if;
end $$;

-- 좋아요 켜기/끄기(내 글은 불가). 10·50·100개를 처음 넘으면 작성자에게 알림
create or replace function public.board_like(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.community_posts; liked boolean; cnt int; m int;
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  select * into p from public.community_posts where id = p_id for update;
  if p.id is null or p.status <> 'active' then raise exception 'not_found'; end if;
  if p.author_id = me then raise exception 'own_like'; end if;
  delete from public.community_post_likes where post_id = p_id and user_id = me;
  liked := not found;
  if liked then insert into public.community_post_likes (post_id, user_id) values (p_id, me); end if;
  select count(*) into cnt from public.community_post_likes where post_id = p_id;
  m := case when cnt >= 100 then 100 when cnt >= 50 then 50 when cnt >= 10 then 10 else 0 end;
  update public.community_posts set like_count = cnt, like_milestone = greatest(like_milestone, m) where id = p_id;
  if m > p.like_milestone then
    perform private.notify(p.author_id, 'like', '내 글의 좋아요가 ' || m || '개를 넘었어요', left(p.title, 60), '/community/' || p_id);
  end if;
  return jsonb_build_object('liked', liked, 'like_count', cnt);
end $$;

-- ───────────────────────── 댓글 ─────────────────────────
-- 댓글·답글 쓰기. p_parent 가 답글이면 그 부모 댓글에 붙인다(1단계까지). 알림: 답글 → 부모 댓글 작성자, 댓글 → 글 작성자, @닉네임 → 언급된 회원(최대 5명)
-- 오류 코드: rate_comment_sec(10초에 1개), rate_comment_day(24시간 200개)
create or replace function public.board_comment(p_post bigint, p_body text, p_parent bigint default null, p_anonymous boolean default false)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare
  me uuid := auth.uid(); per text; p public.community_posts; par public.community_comments; v_parent bigint;
  v_no int; new_id bigint; notified uuid[] := array[me]; target uuid; nm text; link text; excerpt text := left(btrim(p_body), 80);
begin
  per := private.writer_persona(me, coalesce(p_anonymous, false));
  select * into p from public.community_posts where id = p_post;
  if p.id is null or p.status <> 'active' then raise exception 'not_found'; end if;
  if private.blocked_by(me, p.author_id) then raise exception 'not_found'; end if;
  if p_parent is not null then
    select * into par from public.community_comments where id = p_parent and post_id = p_post;
    if par.id is null or par.status <> 'active' then raise exception 'not_found'; end if;
    v_parent := coalesce(par.parent_id, par.id);
  end if;
  perform pg_advisory_xact_lock(hashtext('board-comment:' || me::text));
  if exists (select 1 from public.community_comments where author_id = me and created_at > now() - interval '10 seconds') then raise exception 'rate_comment_sec'; end if;
  if (select count(*) from public.community_comments where author_id = me and created_at > now() - interval '24 hours') >= 200 then raise exception 'rate_comment_day'; end if;
  if per = 'a' then
    -- 익명 번호: 이 글에서 이미 받은 번호가 있으면 그대로, 익명 글의 작성자면 0(글쓴이), 아니면 다음 번호
    perform pg_advisory_xact_lock(hashtext('board-anon:' || p_post::text));
    select c.anon_no into v_no from public.community_comments c where c.post_id = p_post and c.author_id = me and c.persona = 'a' limit 1;
    if v_no is null then
      if p.persona = 'a' and p.author_id = me then v_no := 0;
      else select coalesce(max(c.anon_no), 0) + 1 into v_no from public.community_comments c where c.post_id = p_post and c.persona = 'a';
      end if;
    end if;
  end if;
  insert into public.community_comments (post_id, parent_id, author_id, persona, anon_no, body)
  values (p_post, v_parent, me, per, v_no, btrim(p_body)) returning id into new_id;
  perform private.recount_comments(p_post);

  link := '/community/' || p_post || '#c' || new_id;
  if par.id is not null and par.author_id is not null and not (par.author_id = any (notified)) then
    perform private.notify(par.author_id, 'reply', '내 댓글에 답글이 달렸어요', excerpt, link, me);
    notified := notified || par.author_id;
  end if;
  if p.author_id is not null and not (p.author_id = any (notified)) then
    perform private.notify(p.author_id, 'comment', '내 글에 새 댓글이 달렸어요', '「' || left(p.title, 30) || '」 ' || excerpt, link, me);
    notified := notified || p.author_id;
  end if;
  -- @멘션: 커뮤니티 전용 닉네임(전용 프로필을 쓰는 회원) 또는 유펜 닉네임(유펜 프로필을 쓰는 회원)
  for nm in select distinct m[1] from regexp_matches(p_body, '@([0-9A-Za-z가-힣]{2,12})', 'g') m limit 5 loop
    select cp.user_id into target from public.community_profiles cp where cp.use_separate and lower(cp.nickname) = lower(nm);
    if target is null then
      select pr.id into target from public.profiles pr
       where lower(pr.nickname) = lower(nm)
         and not coalesce((select use_separate from public.community_profiles x where x.user_id = pr.id), false);
    end if;
    if target is not null and not (target = any (notified)) then
      perform private.notify(target, 'mention', '댓글에서 나를 언급했어요', '「' || left(p.title, 30) || '」 ' || excerpt, link, me);
      notified := notified || target;
    end if;
    target := null;
  end loop;
  return new_id;
end $$;

create or replace function public.board_comment_edit(p_id bigint, p_body text)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  update public.community_comments set body = btrim(p_body), edited_at = now() where id = p_id and author_id = me and status = 'active';
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.board_comment_delete(p_id bigint)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); pid bigint;
begin
  if me is null then raise exception 'login'; end if;
  update public.community_comments set status = 'deleted', deleted_at = now(), status_by = me, status_reason = '작성자 삭제'
   where id = p_id and author_id = me and status <> 'deleted' returning post_id into pid;
  if pid is null then raise exception 'not_found'; end if;
  perform private.recount_comments(pid);
end $$;

-- ───────────────────────── 신고·차단 대상 확장 (1단계 함수 교체) ─────────────────────────
create or replace function private.resolve_target(p_kind text, p_ref text)
returns table (user_id uuid, label text, snapshot jsonb) language plpgsql stable security definer set search_path = public, private as $$
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
  end if;
end $$;

-- 신고가 쌓이면(서로 다른 3명) 자동 숨김 + 관리자 알림
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
  end if;
end $$;

-- ───────────────────────── 관리자 ─────────────────────────
-- 글·댓글 상태 바꾸기: active(복구) | hidden(숨김) | deleted(삭제 — 다음 달 1일 완전 삭제). 삭제하면 작성자에게 알림
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
    what := '게시글';
  elsif p_kind = 'comment' then
    update public.community_comments
       set status = p_status, status_reason = nullif(btrim(coalesce(p_reason, '')), ''), status_by = me,
           deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning author_id, post_id into author, pid;
    if pid is not null then perform private.recount_comments(pid); end if;
    what := '댓글';
  else
    raise exception '글·댓글만 처리할 수 있습니다';
  end if;
  if pid is null then raise exception '대상을 찾을 수 없습니다'; end if;
  if p_status = 'deleted' then
    perform private.notify(author, 'sanction', '운영 기준에 따라 ' || what || '이 삭제되었어요',
      coalesce('사유: ' || nullif(btrim(coalesce(p_reason, '')), '') || ' · ', '') || '이의가 있으면 고객지원으로 알려 주세요', '/support');
  end if;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (me, 'content_' || p_status, p_kind || ':' || p_ref, jsonb_build_object('reason', p_reason));
end $$;

-- 익명(또는 전용 프로필) 글·댓글의 실제 작성자 확인 — 문제가 되거나 신고가 들어온 경우에만 쓴다. 조회할 때마다 관리 기록에 남는다
create or replace function public.admin_reveal_author(p_kind text, p_ref text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); uid uuid;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  -- 삭제·숨김된 글·댓글도 확인할 수 있게 표에서 직접 찾는다
  if p_kind = 'post' and p_ref ~ '^[0-9]{1,18}$' then select author_id into uid from public.community_posts where id = p_ref::bigint;
  elsif p_kind = 'comment' and p_ref ~ '^[0-9]{1,18}$' then select author_id into uid from public.community_comments where id = p_ref::bigint;
  else select r.user_id into uid from private.resolve_target(p_kind, p_ref) r limit 1;
  end if;
  insert into public.admin_audit (admin_id, action, target) values (me, 'reveal_author', p_kind || ':' || p_ref);
  if uid is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'user_id', uid,
    'nickname', (select nickname from public.profiles where id = uid),
    'community_nickname', (select nickname from public.community_profiles where user_id = uid));
end $$;

-- 커뮤니티 신고 목록 (1단계 함수 교체): 익명 대상은 작성자 이름을 숨기고(target_anonymous) '작성자 확인'(admin_reveal_author)으로만 본다
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

-- 이번 달(또는 지정 기간) 삭제된 글·댓글 백업용 목록 — 내보내기 기록이 관리 기록에 남는다
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
      where c.status = 'deleted' and c.deleted_at >= p_from and c.deleted_at < p_to), '[]'::jsonb));
end $$;

-- ───────────────────────── 월말 정리 (매일 0시 5분 KST) ─────────────────────────
--  · 말일 하루 전: 관리자에게 백업 알림
--  · 매달 1일: 지난달까지 삭제된 글·댓글을 완전 삭제(답글이 남아 있는 삭제 댓글은 자리만 남김), 그 신고 사본도 비운다.
--    글이 지워지면 붙어 있던 사진 기록은 post_id 가 비워져 사진 API 가 파일을 정리한다.
create or replace function private.community_daily()
returns void language plpgsql security definer set search_path = public, private as $$
declare today date := (now() at time zone 'Asia/Seoul')::date; cutoff timestamptz;
begin
  if today + 1 = (date_trunc('month', today::timestamp) + interval '1 month' - interval '1 day')::date then
    perform private.notify_admins('내일이 이달 마지막 날이에요 — 삭제된 커뮤니티 글 백업',
      '다음 달 1일 0시에 이달 삭제된 글·댓글이 완전히 지워져요. 관리자 페이지 > 신고 > 삭제 콘텐츠 백업에서 내려받아 주세요', '/admin?tab=reports');
  end if;
  if extract(day from today) = 1 then
    cutoff := date_trunc('month', today::timestamp) at time zone 'Asia/Seoul';
    update public.community_reports r set snapshot = jsonb_build_object('purged', true, 'persona', r.snapshot->>'persona')
     where (r.target_kind = 'post' and r.target_ref in (select id::text from public.community_posts where status = 'deleted' and deleted_at < cutoff))
        or (r.target_kind = 'comment' and r.target_ref in (select c.id::text from public.community_comments c
              where c.status = 'deleted' and c.deleted_at < cutoff and not exists (select 1 from public.community_comments x where x.parent_id = c.id and x.status <> 'deleted')));
    delete from public.community_comments c
     where c.status = 'deleted' and c.deleted_at < cutoff
       and not exists (select 1 from public.community_comments x where x.parent_id = c.id and x.status <> 'deleted');
    delete from public.community_posts where status = 'deleted' and deleted_at < cutoff;
  end if;
end $$;
select cron.schedule('community-daily', '5 15 * * *', $$select private.community_daily()$$);

-- ───────────────────────── 권한 (로그인 회원만) ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.board_list(text, text[], text, text, int, int)', 'public.board_post(bigint)', 'public.board_view(bigint)',
    'public.board_my_comments(int, int)', 'public.board_write(text, text, text[], boolean, bigint[], boolean)',
    'public.board_edit(bigint, text, text, text[], bigint[])', 'public.board_delete(bigint)', 'public.board_like(bigint)',
    'public.board_comment(bigint, text, bigint, boolean)', 'public.board_comment_edit(bigint, text)', 'public.board_comment_delete(bigint)',
    'public.admin_set_content_status(text, text, text, text)', 'public.admin_reveal_author(text, text)',
    'public.admin_community_reports(text)', 'public.admin_deleted_content(timestamptz, timestamptz)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ───────────────────────── 번호 생성기 비공개 (마이그레이션 `community_sequences_private`) ─────────────────────────
-- 표를 만들면 시퀀스 읽기 권한이 기본으로 열려 비로그인도 글·신고 개수를 짐작할 수 있다 → 회수(쓰기는 SECURITY DEFINER 함수·서버가 한다)
revoke all on sequence public.community_bans_id_seq, public.community_blocks_id_seq, public.community_comments_id_seq,
  public.community_posts_id_seq, public.community_reports_id_seq, public.community_uploads_id_seq, public.notifications_id_seq
  from anon, authenticated;
