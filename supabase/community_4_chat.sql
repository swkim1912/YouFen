-- 커뮤니티 4단계 단체 채팅 '자유톡방' (마이그레이션 36 `community_chat` + `community_chat_me_need_nick`, 2026-10-08, 브랜치 feature/community)
-- 기획: docs/COMMUNITY.md 4장. 1~3단계(카드·알림·신고·차단·정지·사진 기록·매일 정리) 위에 올린다.
-- 표: chat_messages(메시지 — 방이 하나뿐이라 방 표는 없다) + community_profiles 에 채팅 설정 열 추가
-- 원칙
--  · 얼굴은 두 가지 중 선택: 커뮤니티 프로필(지금 커뮤니티 설정 = y 또는 c) / 자유톡방 익명 닉네임(n). 메시지마다 보낼 때의 얼굴을 저장한다.
--    익명 닉네임(n) 카드에는 닉네임만 넣는다(사진·티어·회원 id 없음). 표시 이름은 지금 닉네임(바꾸면 예전 메시지도 새 이름 — 바꿔서 숨을 수 없음).
--  · 처음 들어올 때, 그리고 얼굴을 바꾼 뒤에는 이용 규칙에 다시 동의해야 보낼 수 있다(chat_agreed_persona = 지금 얼굴).
--  · 표는 RPC 전용 → 보낸 사람 id 는 화면에 나가지 않는다(내 것인지만).
--  · 실시간: 메시지를 저장하면 DB 가 비공개 Realtime 채널 'community-chat' 으로 "새 메시지 번호"만 알린다(realtime.send).
--    화면은 그 신호를 받으면 chat_feed 로 새 메시지를 가져온다(차단·숨김 처리는 DB 가 한다). 회원은 이 채널에 직접 보낼 수 없다(접속자 수용 presence 만).
--  · 메시지 1달 보관 후 삭제. 사진은 검사 없이(신고로 처리) 용량·하루 30장만 제한.

-- ───────────────────────── 채팅 설정(커뮤니티 프로필 표에 추가) ─────────────────────────
alter table public.community_profiles
  add column chat_use_nickname boolean not null default false,                         -- true = 자유톡방에서 익명 닉네임 사용
  add column chat_nickname_changed_at timestamptz,                                      -- 익명 닉네임은 10분에 1번 바꿀 수 있다
  add column chat_agreed_persona text check (chat_agreed_persona in ('y','c','n')),     -- 이용 규칙에 동의했을 때의 얼굴(바뀌면 다시 동의)
  add column chat_agreed_at timestamptz;

-- ───────────────────────── 메시지 ─────────────────────────
create table public.chat_messages (
  id bigint generated always as identity primary key,
  sender_id uuid references public.profiles(id) on delete set null,
  persona text not null check (persona in ('y','c','n')),
  body text not null default '' check (char_length(body) <= 1000),
  image jsonb,                                         -- {id, path, thumb, w, h} 또는 null
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  status_reason text,
  status_by uuid references public.profiles(id) on delete set null, -- 지운 사람(보낸 사람 = 본인 삭제, 그 외 = 관리자)
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or image is not null or status = 'deleted')
);
create index chat_messages_created_idx on public.chat_messages (created_at);
create index chat_messages_sender_idx on public.chat_messages (sender_id, created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
revoke all on sequence public.chat_messages_id_seq from anon, authenticated;

-- 사진 기록: 종류에 'chat', 메시지 연결 열 추가. 고아(어디에도 안 붙은 사진) 조건에 이 열도 포함
alter table public.community_uploads drop constraint community_uploads_kind_check;
alter table public.community_uploads add constraint community_uploads_kind_check check (kind in ('post','market','dm','chat'));
alter table public.community_uploads add column chat_message_id bigint references public.chat_messages(id) on delete set null;
create index community_uploads_chat_idx on public.community_uploads (chat_message_id);
drop index if exists public.community_uploads_orphan_idx;
create index community_uploads_orphan_idx on public.community_uploads (created_at)
  where post_id is null and listing_id is null and message_id is null and chat_message_id is null;

-- ───────────────────────── 실시간 채널 권한 ─────────────────────────
-- 로그인 회원은 'community-chat' 의 신호(broadcast)와 접속자(presence)를 받을 수 있고, 보낼 수 있는 것은 presence 뿐이다.
-- (신호는 DB 함수만 realtime.send 로 보낸다 → 가짜 신호로 다른 회원 화면을 흔들 수 없음)
create policy "community chat receive" on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'community-chat' and realtime.messages.extension in ('broadcast', 'presence'));
create policy "community chat presence" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'community-chat' and realtime.messages.extension = 'presence');

-- ───────────────────────── 도우미 ─────────────────────────
-- 지금 자유톡방에서 쓰는 얼굴: 익명 닉네임이면 'n', 아니면 커뮤니티 설정(y/c)
create or replace function private.chat_persona(p_uid uuid)
returns text language sql stable security definer set search_path = public, private as $$
  select case when coalesce((select chat_use_nickname from public.community_profiles where user_id = p_uid), false) then 'n'
              else private.my_persona(p_uid) end
$$;

-- 채팅 카드: 익명 닉네임(n)은 이름표만(kind 'a' — 사진·티어·회원 id 없음), 그 외는 커뮤니티 카드
create or replace function private.chat_card(p_uid uuid, p_persona text)
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
begin
  if p_uid is null then return jsonb_build_object('kind', 'gone', 'nickname', '탈퇴 회원'); end if;
  if p_persona = 'n' then
    return jsonb_build_object('kind', 'a', 'nickname', coalesce((select chat_nickname from public.community_profiles where user_id = p_uid), '익명'));
  end if;
  return private.persona_card(p_uid, p_persona);
end $$;

-- 화면에 보낼 메시지 한 건. 숨김(신고) 메시지의 내용은 보낸 사람·관리자만, 삭제된 메시지는 내용 없음
create or replace function private.chat_msg_json(m public.chat_messages, p_me uuid, p_admin boolean)
returns jsonb language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object(
    'id', m.id, 'mine', coalesce(m.sender_id = p_me, false), 'created_at', m.created_at, 'status', m.status,
    'by_admin', m.status = 'deleted' and m.status_by is distinct from m.sender_id,
    'body', case when m.status = 'active' or (m.status = 'hidden' and (m.sender_id = p_me or p_admin)) then m.body end,
    'image', case when m.status = 'active' or (m.status = 'hidden' and (m.sender_id = p_me or p_admin)) then m.image end,
    'card', private.chat_card(m.sender_id, m.persona))
$$;

-- 실시간 신호 보내기(새 메시지 'new' / 상태가 바뀐 메시지 'update'). 실패해도 메시지 저장에는 영향 없음 — 화면이 주기적으로도 확인한다
create or replace function private.chat_ping(p_event text, p_id bigint)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform realtime.send(jsonb_build_object('id', p_id), p_event, 'community-chat', true);
exception when others then
  null;
end $$;

-- ───────────────────────── 자유톡방 RPC ─────────────────────────
-- 내 자유톡방 상태: 지금 얼굴·카드, 규칙 동의 여부, 정지, 관리자 여부
create or replace function public.chat_me()
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare me uuid := auth.uid(); c public.community_profiles; per text; b public.community_bans;
begin
  if me is null then return null; end if;
  select * into c from public.community_profiles where user_id = me;
  per := private.chat_persona(me);
  b := private.active_ban(me);
  return jsonb_build_object(
    'persona', per,
    'use_nickname', coalesce(c.chat_use_nickname, false),
    'chat_nickname', c.chat_nickname,
    'agreed', c.chat_agreed_persona is not null and c.chat_agreed_persona = per,
    'ever_agreed', c.chat_agreed_at is not null,
    'card', private.chat_card(me, per),
    'profile_card', private.persona_card(me, private.my_persona(me)),
    'need_nick', private.my_persona(me) = 'c' and c.nickname is null, -- '커뮤니티 프로필' 쪽이 닉네임 없는 전용 프로필(마이그레이션 community_chat_me_need_nick)
    'banned', b.id is not null, 'ban_until', b.until, 'ban_permanent', b.id is not null and b.until is null,
    'is_admin', public.is_admin_user());
end $$;

-- 익명 닉네임 추천(저장하지 않음): '날쌘검객123' 같은 이름 중 아무도 안 쓰는 것
create or replace function public.chat_random_nickname()
returns text language plpgsql volatile security definer set search_path = public, private as $$
declare
  a text[] := array['날쌘','재빠른','침착한','용감한','든든한','조용한','씩씩한','단단한','가벼운','날렵한','반짝이는','부드러운'];
  n text[] := array['검객','펜서','피스트','마스크','에페','사브르','플뢰레','런지','패리','리포스트','아롱지'];
  v_name text;
begin
  if auth.uid() is null then raise exception 'login'; end if;
  for i in 1..30 loop
    v_name := a[1 + floor(random() * array_length(a, 1))::int] || n[1 + floor(random() * array_length(n, 1))::int] || (1 + floor(random() * 999))::int;
    if char_length(v_name) <= 12 and private.community_name_conflict(v_name, auth.uid()) is null then return v_name; end if;
  end loop;
  return null;
end $$;

-- 얼굴 정하기: p_use_nickname = 익명 닉네임 사용 여부, p_nickname = 새 익명 닉네임(null 이면 그대로).
-- 닉네임 중복 규칙은 커뮤니티 닉네임과 같다(트리거 community_profiles_guard). 얼굴이 바뀌면 chat_me().agreed 가 false 가 되어 다시 동의해야 한다.
create or replace function public.chat_set_identity(p_use_nickname boolean, p_nickname text default null)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); v_nick text := nullif(btrim(coalesce(p_nickname, '')), ''); cur public.community_profiles;
begin
  if me is null then raise exception 'login'; end if;
  if v_nick is not null and v_nick !~ '^[0-9A-Za-z가-힣]{2,12}$' then raise exception 'community_name:format'; end if;
  insert into public.community_profiles (user_id) values (me) on conflict (user_id) do nothing;
  select * into cur from public.community_profiles where user_id = me;
  if v_nick is not null and v_nick is distinct from cur.chat_nickname then
    if cur.chat_nickname is not null and cur.chat_nickname_changed_at > now() - interval '10 minutes' then raise exception 'chat_nick_wait'; end if;
    update public.community_profiles set chat_nickname = v_nick, chat_nickname_changed_at = now() where user_id = me;
  end if;
  if coalesce(p_use_nickname, false) and (select chat_nickname from public.community_profiles where user_id = me) is null then
    raise exception 'chat_need_nick';
  end if;
  update public.community_profiles set chat_use_nickname = coalesce(p_use_nickname, false) where user_id = me;
  return public.chat_me();
end $$;

-- 이용 규칙 동의(지금 얼굴 기준)
create or replace function public.chat_agree()
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  insert into public.community_profiles (user_id) values (me) on conflict (user_id) do nothing;
  update public.community_profiles set chat_agreed_persona = private.chat_persona(me), chat_agreed_at = now() where user_id = me;
  return public.chat_me();
end $$;

-- 메시지 읽기(1달 이내, 내가 차단한 회원 것 제외)
--  · p_ids     : 그 메시지들만 다시(상태가 바뀌었다는 신호를 받았을 때)
--  · p_after   : 그 번호보다 새 메시지(최대 100개, 오래된 순)
--  · 둘 다 없음: p_before 보다 오래된 최근 50개(없으면 가장 최근 50개). has_more = 더 오래된 메시지가 있음
create or replace function public.chat_feed(p_after bigint default null, p_before bigint default null, p_ids bigint[] default null)
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare me uuid := auth.uid(); v_admin boolean := public.is_admin_user(); items jsonb; v_more boolean := false;
begin
  if me is null then raise exception 'login'; end if;
  if p_ids is not null then
    select coalesce(jsonb_agg(private.chat_msg_json(m, me, v_admin) order by m.id), '[]'::jsonb) into items
      from public.chat_messages m where m.id = any (p_ids[1:100]) and not private.blocked_by(me, m.sender_id);
  elsif p_after is not null then
    select coalesce(jsonb_agg(private.chat_msg_json(m, me, v_admin) order by m.id), '[]'::jsonb) into items
      from public.chat_messages m
     where m.id in (select x.id from public.chat_messages x
                     where x.id > p_after and x.created_at > now() - interval '30 days' and not private.blocked_by(me, x.sender_id)
                     order by x.id limit 100);
    v_more := jsonb_array_length(items) >= 100;
  else
    select coalesce(jsonb_agg(private.chat_msg_json(m, me, v_admin) order by m.id), '[]'::jsonb) into items
      from public.chat_messages m
     where m.id in (select x.id from public.chat_messages x
                     where (p_before is null or x.id < p_before) and x.created_at > now() - interval '30 days' and not private.blocked_by(me, x.sender_id)
                     order by x.id desc limit 51);
    if jsonb_array_length(items) > 50 then items := items - 0; v_more := true; end if; -- 51개면 가장 오래된 것을 빼고 '더 있음'
  end if;
  return jsonb_build_object('messages', items, 'has_more', v_more);
end $$;

-- 메시지 보내기(글 1,000자 또는 사진 1장). 정지·규칙 미동의면 불가.
-- 도배 방지: 1초 1개·1분 20개·24시간 1,000개, 30초 안에 같은 내용 반복 금지. @닉네임(최대 5명)은 그 이름을 지금 자유톡방에서 쓰는 회원에게 알림
create or replace function public.chat_send(p_body text, p_upload bigint default null)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare
  me uuid := auth.uid(); per text; v_body text := btrim(coalesce(p_body, '')); img jsonb; mid bigint; c public.community_profiles;
  v_names text[]; v_name text; v_target uuid; v_sender text;
begin
  if me is null then raise exception 'login'; end if;
  per := private.chat_persona(me);
  if per = 'n' then
    if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  else
    perform private.writer_persona(me, false); -- 정지·전용 닉네임 없음 검사
  end if;
  select * into c from public.community_profiles where user_id = me;
  if c.chat_agreed_persona is distinct from per then raise exception 'chat_need_agree'; end if;
  if per = 'n' and c.chat_nickname is null then raise exception 'chat_need_nick'; end if;
  if (char_length(v_body) = 0 and p_upload is null) or char_length(v_body) > 1000 then raise exception 'bad_input:body'; end if;

  perform pg_advisory_xact_lock(hashtext('chat-send:' || me::text));
  if exists (select 1 from public.chat_messages where sender_id = me and created_at > now() - interval '1 second')
     or (select count(*) from public.chat_messages where sender_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_chat_fast';
  end if;
  if (select count(*) from public.chat_messages where sender_id = me and created_at > now() - interval '24 hours') >= 1000 then raise exception 'rate_chat_day'; end if;
  if char_length(v_body) > 0 and exists (
       select 1 from (select x.body from public.chat_messages x where x.sender_id = me and x.created_at > now() - interval '30 seconds' order by x.id desc limit 1) l
        where l.body = v_body) then
    raise exception 'rate_chat_same';
  end if;

  if p_upload is not null then
    select jsonb_build_object('id', u.id, 'path', u.path, 'thumb', u.thumb, 'w', u.width, 'h', u.height) into img
      from public.community_uploads u
     where u.id = p_upload and u.user_id = me and u.kind = 'chat'
       and u.chat_message_id is null and u.message_id is null and u.post_id is null and u.listing_id is null;
    if img is null then raise exception 'uploads_invalid'; end if;
  end if;
  insert into public.chat_messages (sender_id, persona, body, image) values (me, per, v_body, img) returning id into mid;
  if p_upload is not null then update public.community_uploads set chat_message_id = mid where id = p_upload; end if;
  perform private.chat_ping('new', mid);

  -- @멘션: 이름은 대소문자 무시. 대상이 이 방의 안 읽은 멘션 알림을 이미 갖고 있으면 더 보내지 않는다(도배 방지)
  if position('@' in v_body) > 0 then
    select array_agg(distinct lower(r[1])) into v_names from regexp_matches(v_body, '@([0-9A-Za-z가-힣]{2,12})', 'g') r;
    if v_names is not null then
      v_sender := private.chat_card(me, per)->>'nickname';
      foreach v_name in array v_names[1:5] loop
        v_target := null;
        select u.uid into v_target from (
          select c2.user_id uid from public.community_profiles c2
           where c2.chat_agreed_at is not null and (lower(c2.chat_nickname) = v_name or lower(c2.nickname) = v_name)
          union
          select p.id from public.profiles p join public.community_profiles c3 on c3.user_id = p.id
           where c3.chat_agreed_at is not null and lower(p.nickname) = v_name) u
         where u.uid <> me and lower(private.chat_card(u.uid, private.chat_persona(u.uid))->>'nickname') = v_name
         limit 1;
        if v_target is not null and not exists (select 1 from public.notifications n where n.user_id = v_target and n.kind = 'mention'
                                                  and n.link = '/community/chat' and n.read_at is null) then
          perform private.notify(v_target, 'mention', '자유톡방에서 나를 불렀어요', left(v_sender || ': ' || v_body, 120), '/community/chat', me);
        end if;
      end loop;
    end if;
  end if;
  return mid;
end $$;

-- 내 메시지 지우기('삭제된 메시지'). 사진은 연결을 끊어 사진 API 가 하루 뒤 파일을 지운다
create or replace function public.chat_delete(p_id bigint)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  update public.chat_messages set status = 'deleted', deleted_at = now(), status_by = me, status_reason = '작성자 삭제', image = null
   where id = p_id and sender_id = me and status <> 'deleted';
  if not found then raise exception 'not_found'; end if;
  update public.community_uploads set chat_message_id = null where chat_message_id = p_id;
  perform private.chat_ping('update', p_id);
end $$;

-- ───────────────────────── 신고·차단 대상 / 자동 숨김 / 관리자 확장 ─────────────────────────
-- 채팅 메시지('chat', 메시지 번호): 대상 = 보낸 사람, 사본 = 그 메시지와 바로 앞 10개(보낸 이름 포함)
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
  elsif p_kind = 'chat' and p_ref ~ '^[0-9]{1,18}$' then
    return query select m.sender_id, coalesce(private.chat_card(m.sender_id, m.persona)->>'nickname', '회원'),
        jsonb_build_object('persona', m.persona, 'message_id', m.id, 'body', left(m.body, 500), 'image', m.image->>'path',
          'nickname', private.chat_card(m.sender_id, m.persona)->>'nickname',
          'messages', (select jsonb_agg(jsonb_build_object('from', private.chat_card(x.sender_id, x.persona)->>'nickname', 'body', x.body,
                                                           'image', x.image->>'path', 'at', x.created_at, 'target', x.id = m.id) order by x.id)
                         from (select * from public.chat_messages y where y.id <= m.id order by y.id desc limit 11) x))
      from public.chat_messages m where m.id = p_ref::bigint and m.status <> 'deleted';
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
  end if;
end $$;

-- 관리자 글 상태 바꾸기: 채팅 메시지(chat)까지. 채팅 메시지 삭제는 화면에 '관리자에 의해 삭제된 메시지'로 보인다
create or replace function public.admin_set_content_status(p_kind text, p_ref text, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); author uuid; pid bigint; what text;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  if p_status not in ('active','hidden','deleted') then raise exception '잘못된 상태입니다'; end if;
  if p_ref !~ '^[0-9]{1,18}$' then raise exception '대상을 찾을 수 없습니다'; end if;
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
  elsif p_kind = 'chat' then
    update public.chat_messages
       set status = p_status, status_reason = nullif(btrim(coalesce(p_reason, '')), ''), status_by = me,
           deleted_at = case when p_status = 'deleted' then now() end
     where id = p_ref::bigint returning sender_id, id into author, pid;
    if pid is not null then perform private.chat_ping('update', pid); end if;
    what := '채팅 메시지가';
  else
    raise exception '글·댓글·장터 글·채팅 메시지만 처리할 수 있습니다';
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
  elsif p_kind = 'chat' and p_ref ~ '^[0-9]{1,18}$' then select sender_id into uid from public.chat_messages where id = p_ref::bigint;
  else select r.user_id into uid from private.resolve_target(p_kind, p_ref) r limit 1;
  end if;
  insert into public.admin_audit (admin_id, action, target) values (me, 'reveal_author', p_kind || ':' || p_ref);
  if uid is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'user_id', uid,
    'nickname', (select nickname from public.profiles where id = uid),
    'community_nickname', (select nickname from public.community_profiles where user_id = uid),
    'chat_nickname', (select chat_nickname from public.community_profiles where user_id = uid));
end $$;

-- 신고 목록: 채팅 익명 닉네임(n) 메시지도 익명처럼 대상 이름을 숨긴다(작성자 확인으로만)
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

-- 관리자: 부적절한 자유톡방 익명 닉네임 지우기. 회원은 다음에 들어올 때 얼굴을 다시 고르고 규칙에 다시 동의한다
create or replace function public.admin_clear_chat_nickname(p_target uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); old text;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  select chat_nickname into old from public.community_profiles where user_id = p_target;
  update public.community_profiles set chat_nickname = null, chat_use_nickname = false, chat_agreed_persona = null where user_id = p_target;
  perform private.notify(p_target, 'sanction', '자유톡방 닉네임이 운영 기준에 맞지 않아 지워졌어요', '자유톡방에 들어가면 새 닉네임을 정할 수 있어요', '/community/chat');
  insert into public.admin_audit (admin_id, action, target, detail) values (me, 'chat_nick_clear', p_target::text, jsonb_build_object('nickname', old));
end $$;

-- 삭제 콘텐츠 백업: 채팅 메시지(삭제 처리된 것)까지
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
      where m.status = 'deleted' and m.deleted_at >= p_from and m.deleted_at < p_to), '[]'::jsonb));
end $$;

-- 관리자 현황: 자유톡방 최근 24시간 메시지 수·보낸 사람 수 추가 (Realtime 무료 한도 관리용 — docs/COMMUNITY.md 9장)
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

-- ───────────────────────── 매일 정리 (3단계 함수 교체: 자유톡방 1달 보관 추가) ─────────────────────────
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

  -- 자유톡방 1달 보관(사진 기록은 연결이 비워져 사진 API 가 파일 정리)
  delete from public.chat_messages where created_at < now() - interval '30 days';

  if today + 1 = (date_trunc('month', today::timestamp) + interval '1 month' - interval '1 day')::date then
    perform private.notify_admins('내일이 이달 마지막 날이에요 — 삭제된 커뮤니티 글 백업',
      '다음 달 1일 0시에 이달 삭제된 글·댓글·장터 글이 완전히 지워져요(채팅은 1달 뒤 삭제). 관리자 페이지 > 신고 > 삭제 콘텐츠 백업에서 내려받아 주세요', '/admin?tab=reports');
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
    'public.chat_me()', 'public.chat_random_nickname()', 'public.chat_set_identity(boolean, text)', 'public.chat_agree()',
    'public.chat_feed(bigint, bigint, bigint[])', 'public.chat_send(text, bigint)', 'public.chat_delete(bigint)',
    'public.admin_set_content_status(text, text, text, text)', 'public.admin_reveal_author(text, text)',
    'public.admin_community_reports(text)', 'public.admin_clear_chat_nickname(uuid)',
    'public.admin_deleted_content(timestamptz, timestamptz)', 'public.admin_overview()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- 내부 도우미는 아무도 직접 부르지 못하게(private 스키마는 원래 노출되지 않지만 명시)
revoke execute on function private.chat_persona(uuid), private.chat_card(uuid, text), private.chat_msg_json(public.chat_messages, uuid, boolean),
  private.chat_ping(text, bigint) from public, anon, authenticated;
