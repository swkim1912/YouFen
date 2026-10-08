-- 커뮤니티 1단계 기반 (마이그레이션 33 `community_foundation`, 2026-10-08, 브랜치 feature/community)
-- 기획: docs/COMMUNITY.md 0장·1장
--   ① 커뮤니티 프로필(community_profiles) + 닉네임 교차 중복 검사(유펜 닉네임·커뮤니티 닉네임·채팅 익명 닉네임·선수 실명)
--   ② 공용 알림(notifications) + 종류별 켜기/끄기(notification_settings)
--   ③ 차단(community_blocks) ④ 신고(community_reports) ⑤ 커뮤니티 이용 정지(community_bans)
-- 모든 표는 RLS 를 켜고, 알림 '내 것 읽기' 외에는 정책 없이 RPC(SECURITY DEFINER)로만 다룬다.
-- 운영 중인 DB 에 적용되므로 기존 표·함수는 '추가·확장'만 한다(유펜 닉네임 검사에 커뮤니티 닉네임 확인 추가, 관리자 목록에 항목 추가).

-- ───────────────────────── ① 커뮤니티 프로필 ─────────────────────────
create table public.community_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- 화면에 내보내는 커뮤니티 전용 id. 회원 id(user_id)는 절대 내보내지 않는다(내보내면 유펜 프로필과 이어짐)
  public_id uuid not null unique default gen_random_uuid(),
  use_separate boolean not null default false,          -- false = 유펜 프로필 그대로, true = 커뮤니티 전용 프로필
  nickname text check (nickname ~ '^[0-9A-Za-z가-힣]{2,12}$'),
  nickname_changed_at timestamptz,                      -- 30일 1회 변경 제한용
  avatar_url text,                                      -- null(사진 없음) | 'default:1' | 서버 API 가 올린 https 주소
  chat_nickname text check (chat_nickname ~ '^[0-9A-Za-z가-힣]{2,12}$'), -- 자유톡방 익명 닉네임(4단계에서 사용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index community_profiles_nick_uidx on public.community_profiles (lower(nickname)) where nickname is not null;
create unique index community_profiles_chat_uidx on public.community_profiles (lower(chat_nickname)) where chat_nickname is not null;
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from anon, authenticated;

-- 이름 n 을 회원 me 가 커뮤니티/채팅 닉네임으로 쓸 수 있는지. null = 가능, 아니면 이유 코드
--  'youfen'    : 어떤 회원(본인 포함)의 유펜 닉네임과 같음
--  'community' : 다른 회원의 커뮤니티 닉네임 또는 채팅 익명 닉네임과 같음
--  'realname'  : 협회 선수 실명과 같음(실명 노출·사칭 방지)
create or replace function private.community_name_conflict(n text, me uuid)
returns text language sql stable security definer set search_path = public, private as $$
  select case
    when exists (select 1 from public.profiles p where lower(p.nickname) = lower(n)) then 'youfen'
    when exists (select 1 from public.community_profiles c
                  where c.user_id is distinct from me and (lower(c.nickname) = lower(n) or lower(c.chat_nickname) = lower(n))) then 'community'
    when exists (select 1 from public.athletes a where a.name = n) then 'realname'
  end
$$;

-- 커뮤니티 프로필 저장 전 검사: 닉네임 형식·중복·30일 제한, 전용 프로필은 닉네임 필수
create or replace function public.community_profiles_guard()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare why text;
begin
  -- 닉네임 검사를 동시에 두 건 하면 둘 다 통과할 수 있으므로 같은 잠금으로 줄 세운다(유펜 닉네임 트리거와 같은 키)
  perform pg_advisory_xact_lock(hashtext('youfen-names'));
  if new.nickname is not null and (tg_op = 'INSERT' or lower(new.nickname) is distinct from lower(old.nickname)) then
    why := private.community_name_conflict(new.nickname, new.user_id);
    if why is not null then raise exception 'community_name:%', why; end if;
  end if;
  if new.chat_nickname is not null and (tg_op = 'INSERT' or lower(new.chat_nickname) is distinct from lower(old.chat_nickname)) then
    why := private.community_name_conflict(new.chat_nickname, new.user_id);
    if why is not null then raise exception 'community_name:%', why; end if;
  end if;
  if lower(new.nickname) = lower(new.chat_nickname) then raise exception 'community_name:community'; end if;
  if tg_op = 'UPDATE' and new.nickname is distinct from old.nickname then
    -- 처음 정할 때(이전 값 없음)는 제한 없음, 바꿀 때는 30일에 1번
    if old.nickname is not null and new.nickname is not null and old.nickname_changed_at > now() - interval '30 days' then
      raise exception 'community_nick_30days';
    end if;
    if new.nickname is not null then new.nickname_changed_at := now(); end if;
  elsif tg_op = 'INSERT' and new.nickname is not null then
    new.nickname_changed_at := now();
  end if;
  if tg_op = 'UPDATE' then new.public_id := old.public_id; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger community_profiles_guard before insert or update on public.community_profiles
  for each row execute function public.community_profiles_guard();
revoke execute on function public.community_profiles_guard() from public, anon, authenticated;

-- 반대 방향: 유펜 닉네임을 정하거나 바꿀 때 커뮤니티·채팅 닉네임(본인 것 포함)과 겹치면 막는다
create or replace function public.profiles_nick_cross_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nickname is not null and (tg_op = 'INSERT' or lower(new.nickname) is distinct from lower(old.nickname)) then
    perform pg_advisory_xact_lock(hashtext('youfen-names'));
    if exists (select 1 from public.community_profiles c where lower(c.nickname) = lower(new.nickname) or lower(c.chat_nickname) = lower(new.nickname)) then
      raise exception '이미 사용 중인 닉네임입니다';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_nick_cross_guard before insert or update of nickname on public.profiles
  for each row execute function public.profiles_nick_cross_guard();
revoke execute on function public.profiles_nick_cross_guard() from public, anon, authenticated;

-- 유펜 닉네임 중복 확인(가입·설정 화면)에도 커뮤니티·채팅 닉네임을 포함한다 (기존 함수 확장)
create or replace function public.nickname_available(n text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform private.throttle();
  return not exists (select 1 from public.profiles where lower(nickname) = lower(n) and id is distinct from auth.uid())
     and not exists (select 1 from public.community_profiles c where lower(c.nickname) = lower(n) or lower(c.chat_nickname) = lower(n));
end $$;

-- 커뮤니티 닉네임 사용 가능 여부(화면 실시간 확인용). null = 가능, 'format' | 'youfen' | 'community' | 'realname'
create or replace function public.community_name_available(n text)
returns text language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); cur public.community_profiles;
begin
  if me is null then return 'login'; end if;
  perform private.throttle();
  if n is null or n !~ '^[0-9A-Za-z가-힣]{2,12}$' then return 'format'; end if;
  select * into cur from public.community_profiles where user_id = me;
  if lower(cur.nickname) = lower(n) or lower(cur.chat_nickname) = lower(n) then return null; end if; -- 지금 내 이름
  return private.community_name_conflict(n, me);
end $$;
revoke execute on function public.community_name_available(text) from anon;

-- 회원의 대표 티어: 연결된 선수(학부모 신분은 제외 — 자녀 선수의 티어를 본인 것으로 쓰지 않음)의 현재 시즌 배치 완료 티어 중 가장 높은 것
create or replace function private.member_tier(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select ps.tier
    from public.athlete_links al
    join public.profiles p on p.id = al.profile_id and p.role is distinct from '학부모'
    join public.pool_scores ps on ps.athlete_id = al.athlete_id
   where al.profile_id = p_uid and ps.placed and ps.tier is not null
     and ps.season = (select s.season from public.seasons s where s.is_current limit 1)
   order by array_position(array['챌린저','마스터','다이아몬드','플래티넘','골드','실버','브론즈'], ps.tier)
   limit 1
$$;

-- 커뮤니티 카드(화면에 보일 얼굴). persona: 'y' = 유펜 프로필, 'c' = 커뮤니티 전용 프로필
--  'y' 카드에는 회원 id·소속이 들어가고(누르면 유펜 프로필로), 'c' 카드에는 public_id 와 닉네임·사진만 들어간다(소속도 숨김).
--  테두리(frame)·뱃지(badge)는 회원이 켜 두었고 티어가 있을 때만 티어 이름을 넣는다. 등수는 넣지 않는다.
create or replace function private.persona_card(p_uid uuid, p_persona text)
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare p public.profiles; c public.community_profiles; t text;
begin
  select * into p from public.profiles where id = p_uid;
  if not found then return jsonb_build_object('kind', 'gone', 'nickname', '탈퇴 회원'); end if;
  select * into c from public.community_profiles where user_id = p_uid;
  t := private.member_tier(p_uid);
  if p_persona = 'c' then
    return jsonb_build_object('kind', 'c', 'pid', c.public_id, 'nickname', coalesce(c.nickname, '커뮤니티 회원'), 'avatar_url', c.avatar_url,
      'frame', case when p.use_frame then t end, 'badge', case when p.use_badge then t end);
  end if;
  return jsonb_build_object('kind', 'y', 'id', p.id, 'nickname', p.nickname, 'avatar_url', p.avatar_url, 'club_id', p.club_id, 'affiliation', p.affiliation,
    'frame', case when p.use_frame then t end, 'badge', case when p.use_badge then t end);
end $$;

-- 지금 내가 커뮤니티에 쓰는 얼굴의 persona 기호
create or replace function private.my_persona(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when coalesce((select use_separate from public.community_profiles where user_id = p_uid), false) then 'c' else 'y' end
$$;

-- 내 커뮤니티 설정 읽기(행이 없으면 기본값). card = 지금 설정으로 보이는 미리보기 카드
create or replace function public.get_my_community()
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare me uuid := auth.uid(); c public.community_profiles;
begin
  if me is null then return null; end if;
  select * into c from public.community_profiles where user_id = me;
  return jsonb_build_object(
    'use_separate', coalesce(c.use_separate, false),
    'nickname', c.nickname,
    'nickname_changed_at', c.nickname_changed_at,
    'avatar_url', c.avatar_url,
    'chat_nickname', c.chat_nickname,
    'tier', private.member_tier(me),
    'card', private.persona_card(me, private.my_persona(me)),
    'card_c', private.persona_card(me, 'c'),
    'card_y', private.persona_card(me, 'y'));
end $$;
revoke execute on function public.get_my_community() from anon;

-- 커뮤니티 프로필 저장: 쓸 얼굴(use_separate) + 커뮤니티 닉네임(null 이면 그대로 둠)
-- 오류 코드(화면이 한글로 바꿔 보여 줌): community_name:<이유>, community_nick_30days, community_need_nick
create or replace function public.save_community_profile(p_use_separate boolean, p_nickname text default null)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); n text := nullif(btrim(coalesce(p_nickname, '')), ''); cur public.community_profiles;
begin
  if me is null then raise exception 'login'; end if;
  if n is not null and n !~ '^[0-9A-Za-z가-힣]{2,12}$' then raise exception 'community_name:format'; end if;
  insert into public.community_profiles (user_id) values (me) on conflict (user_id) do nothing;
  select * into cur from public.community_profiles where user_id = me;
  if n is not null and n is distinct from cur.nickname then
    update public.community_profiles set nickname = n where user_id = me;
  end if;
  if p_use_separate and (select nickname from public.community_profiles where user_id = me) is null then
    raise exception 'community_need_nick';
  end if;
  update public.community_profiles set use_separate = coalesce(p_use_separate, false) where user_id = me;
  return public.get_my_community();
end $$;
revoke execute on function public.save_community_profile(boolean, text) from anon;

-- ───────────────────────── ② 공용 알림 ─────────────────────────
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,                                         -- comment|reply|like|mention|dm|market|openpiste|sanction|admin|system
  title text not null check (char_length(title) <= 100),
  body text check (char_length(body) <= 300),
  link text check (link ~ '^/[^/\\]'),                        -- 사이트 안 경로만(다른 사이트로 보내는 주소 금지)
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- 종류별 끄기 목록(없으면 모두 켜짐). 오픈피스트 종목·지역 필터는 5단계에서 열을 추가한다
create table public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  off text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon, authenticated;

-- 회원이 끌 수 있는 종류(sanction·admin·system 은 끌 수 없음)
create or replace function private.notify_toggleable() returns text[] language sql immutable as $$
  select array['comment','reply','like','mention','dm','market','openpiste']
$$;

-- 알림 보내기(서버 함수 전용). p_actor = 알림을 일으킨 회원(본인에게는 보내지 않고, 받는 사람이 차단한 회원이면 보내지 않음)
create or replace function private.notify(p_uid uuid, p_kind text, p_title text, p_body text default null, p_link text default null, p_actor uuid default null)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if p_uid is null or p_uid = p_actor then return; end if;
  if p_kind = any (private.notify_toggleable())
     and exists (select 1 from public.notification_settings s where s.user_id = p_uid and p_kind = any (s.off)) then return; end if;
  if p_actor is not null and exists (select 1 from public.community_blocks b where b.blocker_id = p_uid and b.blocked_id = p_actor) then return; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_uid, p_kind, left(p_title, 100), left(p_body, 300), p_link);
end $$;

-- 모든 관리자에게 운영 알림
create or replace function private.notify_admins(p_title text, p_body text default null, p_link text default '/admin')
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'admin', left(p_title, 100), left(p_body, 300), p_link from public.profiles p where p.is_admin;
$$;

-- 알림 읽음 처리: p_ids 가 null 이면 내 알림 전체
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;
revoke execute on function public.mark_notifications_read(bigint[]) from anon;

-- 내 알림 설정 읽기: 켜기/끄기 가능한 종류와 꺼진 목록
create or replace function public.get_notification_settings()
returns jsonb language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object('kinds', to_jsonb(private.notify_toggleable()),
    'off', coalesce((select to_jsonb(s.off) from public.notification_settings s where s.user_id = auth.uid()), '[]'::jsonb))
$$;
revoke execute on function public.get_notification_settings() from anon;

create or replace function public.set_notification_pref(p_kind text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'login'; end if;
  if not (p_kind = any (private.notify_toggleable())) then raise exception '바꿀 수 없는 알림입니다'; end if;
  insert into public.notification_settings (user_id) values (me) on conflict (user_id) do nothing;
  update public.notification_settings
     set off = case when p_on then array_remove(off, p_kind) else array_append(array_remove(off, p_kind), p_kind) end,
         updated_at = now()
   where user_id = me;
  return public.get_notification_settings();
end $$;
revoke execute on function public.set_notification_pref(text, boolean) from anon;

-- ───────────────────────── ③ 차단 ─────────────────────────
create table public.community_blocks (
  id bigint generated always as identity primary key,
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,                 -- 차단할 때 보이던 이름(익명 글이면 '익명 (글 제목)'). 상대 id 는 화면에 내보내지 않는다
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.community_blocks enable row level security;
revoke all on public.community_blocks from anon, authenticated;

-- 신고·차단 대상 풀이: (종류, 참조값) → 실제 회원, 화면 이름, 신고 당시 내용 사본
--  1단계 종류: 'cprofile'(커뮤니티 전용 프로필 public_id) / 'yprofile'(유펜 프로필 회원 id)
--  2단계부터 'post'·'comment'·'chat'·'market'·'dm' 을 이 함수에 추가한다(create or replace)
create or replace function private.resolve_target(p_kind text, p_ref text)
returns table (user_id uuid, label text, snapshot jsonb) language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'cprofile' and p_ref ~ '^[0-9a-fA-F-]{36}$' then
    return query select c.user_id, coalesce(c.nickname, '커뮤니티 회원'), jsonb_build_object('nickname', c.nickname, 'avatar_url', c.avatar_url)
      from public.community_profiles c where c.public_id = p_ref::uuid;
  elsif p_kind = 'yprofile' and p_ref ~ '^[0-9a-fA-F-]{36}$' then
    return query select p.id, coalesce(p.nickname, '회원'), jsonb_build_object('nickname', p.nickname, 'avatar_url', p.avatar_url)
      from public.profiles p where p.id = p_ref::uuid;
  end if;
end $$;

create or replace function public.block_target(p_kind text, p_ref text)
returns text language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); t record;
begin
  if me is null then raise exception 'login'; end if;
  select * into t from private.resolve_target(p_kind, p_ref) limit 1;
  if t.user_id is null then raise exception '대상을 찾을 수 없어요'; end if;
  if t.user_id = me then raise exception '나 자신은 차단할 수 없어요'; end if;
  perform pg_advisory_xact_lock(hashtext('blocks:' || me::text));
  if (select count(*) from public.community_blocks where blocker_id = me) >= 300 then raise exception '차단은 300명까지 할 수 있어요'; end if;
  insert into public.community_blocks (blocker_id, blocked_id, label) values (me, t.user_id, left(t.label, 80))
  on conflict (blocker_id, blocked_id) do nothing;
  return t.label;
end $$;
revoke execute on function public.block_target(text, text) from anon;

create or replace function public.my_blocks()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'label', b.label, 'created_at', b.created_at) order by b.created_at desc), '[]'::jsonb)
    from public.community_blocks b where b.blocker_id = auth.uid()
$$;
revoke execute on function public.my_blocks() from anon;

create or replace function public.unblock(p_id bigint)
returns void language sql security definer set search_path = public as $$
  delete from public.community_blocks where id = p_id and blocker_id = auth.uid();
$$;
revoke execute on function public.unblock(bigint) from anon;

-- ───────────────────────── ④ 신고 ─────────────────────────
create table public.community_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references public.profiles(id) on delete set null,
  target_kind text not null,
  target_ref text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in ('욕설·비하','실명·개인정보 노출','음란·선정','광고·도배','사기·거래 문제','사칭','기타')),
  detail text check (char_length(detail) <= 500),
  snapshot jsonb,                       -- 신고 당시 내용 사본(이후 수정·삭제돼도 관리자가 확인)
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  unique (reporter_id, target_kind, target_ref)
);
create index community_reports_target_idx on public.community_reports (target_kind, target_ref);
create index community_reports_status_idx on public.community_reports (status, created_at desc);
alter table public.community_reports enable row level security;
revoke all on public.community_reports from anon, authenticated;

-- 신고가 쌓이면 자동 임시 숨김(서로 다른 신고자 수 기준). 1단계(프로필)는 숨길 내용이 없어 아무것도 하지 않는다 — 2단계부터 채운다
create or replace function private.auto_hide(p_kind text, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
begin
  return;
end $$;

create or replace function public.report_target(p_kind text, p_ref text, p_reason text, p_detail text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); t record; n int;
begin
  if me is null then raise exception 'login'; end if;
  select * into t from private.resolve_target(p_kind, p_ref) limit 1;
  if t.user_id is null then raise exception '대상을 찾을 수 없어요'; end if;
  if t.user_id = me then raise exception '내 글이나 프로필은 신고할 수 없어요'; end if;
  perform pg_advisory_xact_lock(hashtext('creports:' || me::text));
  if (select count(*) from public.community_reports where reporter_id = me and created_at > now() - interval '24 hours') >= 20 then
    raise exception '신고는 하루 20건까지 할 수 있어요';
  end if;
  begin
    insert into public.community_reports (reporter_id, target_kind, target_ref, target_user_id, reason, detail, snapshot)
    values (me, p_kind, p_ref, t.user_id, p_reason, nullif(btrim(coalesce(p_detail, '')), ''), t.snapshot);
  exception when unique_violation then
    raise exception '이미 신고했어요';
  end;
  select count(distinct reporter_id) into n from public.community_reports where target_kind = p_kind and target_ref = p_ref and status = 'open';
  if n = 1 then
    perform private.notify_admins('새 커뮤니티 신고가 들어왔어요', p_reason || ' · ' || left(t.label, 30), '/admin?tab=reports');
  end if;
  if n >= 3 then perform private.auto_hide(p_kind, p_ref); end if;
end $$;
revoke execute on function public.report_target(text, text, text, text) from anon;

-- ───────────────────────── ⑤ 커뮤니티 이용 정지 ─────────────────────────
create table public.community_bans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 300),
  until timestamptz,                    -- null = 영구 정지
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,                -- 관리자가 일찍 해제한 시각
  lifted_by uuid references public.profiles(id) on delete set null
);
create index community_bans_user_idx on public.community_bans (user_id) where lifted_at is null;
alter table public.community_bans enable row level security;
revoke all on public.community_bans from anon, authenticated;

-- 지금 효력이 있는 정지(없으면 null). 2단계부터 글쓰기·채팅 등 모든 쓰기 함수가 이것으로 막는다
create or replace function private.active_ban(p_uid uuid)
returns public.community_bans language sql stable security definer set search_path = public as $$
  select * from public.community_bans
   where user_id = p_uid and lifted_at is null and (until is null or until > now())
   order by until desc nulls first limit 1
$$;

-- 내 커뮤니티 이용 상태(정지 안내 화면용)
create or replace function public.my_community_status()
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare b public.community_bans;
begin
  if auth.uid() is null then return null; end if;
  b := private.active_ban(auth.uid());
  if b.id is null then return jsonb_build_object('banned', false); end if;
  return jsonb_build_object('banned', true, 'reason', b.reason, 'until', b.until, 'permanent', b.until is null, 'since', b.created_at);
end $$;
revoke execute on function public.my_community_status() from anon;

-- 관리자: 커뮤니티 정지(p_days 1·7·30, null = 영구). 기존 정지는 해제하고 새로 건다
create or replace function public.admin_community_ban(p_target uuid, p_days int, p_reason text)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); u timestamptz;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  if p_days is not null and p_days not in (1, 7, 30) then raise exception '기간은 1·7·30일 또는 영구만 가능합니다'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 2 then raise exception '정지 사유를 적어 주세요'; end if;
  if (select is_admin from public.profiles where id = p_target) then raise exception '관리자는 정지할 수 없습니다'; end if;
  u := case when p_days is null then null else now() + make_interval(days => p_days) end;
  update public.community_bans set lifted_at = now(), lifted_by = me where user_id = p_target and lifted_at is null;
  insert into public.community_bans (user_id, reason, until, created_by) values (p_target, btrim(p_reason), u, me);
  perform private.notify(p_target, 'sanction', '커뮤니티 이용이 제한되었어요',
    '사유: ' || btrim(p_reason) || ' · 기간: ' || coalesce(to_char(u at time zone 'Asia/Seoul', 'YYYY.MM.DD HH24:MI') || '까지', '영구')
      || ' · 이의가 있으면 고객지원으로 알려 주세요', '/?tab=community');
  insert into public.admin_audit (admin_id, action, target, detail)
  values (me, 'community_ban', p_target::text, jsonb_build_object('days', p_days, 'reason', btrim(p_reason)));
end $$;
revoke execute on function public.admin_community_ban(uuid, int, text) from anon;

create or replace function public.admin_community_unban(p_target uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid();
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  update public.community_bans set lifted_at = now(), lifted_by = me where user_id = p_target and lifted_at is null;
  perform private.notify(p_target, 'sanction', '커뮤니티 이용 제한이 해제되었어요', null, '/?tab=community');
  insert into public.admin_audit (admin_id, action, target) values (me, 'community_unban', p_target::text);
end $$;
revoke execute on function public.admin_community_unban(uuid) from anon;

-- ───────────────────────── 관리자: 커뮤니티 신고 ─────────────────────────
-- 대상 회원의 유펜 닉네임·커뮤니티 닉네임·정지 상태와 같은 대상 신고 수를 함께 돌려준다
create or replace function public.admin_community_reports(p_status text default 'open')
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin_user() then return null; end if;
  return coalesce((select jsonb_agg(t order by t.created_at desc) from (
    select r.id, r.target_kind, r.target_ref, r.reason, r.detail, r.snapshot, r.status, r.created_at, r.handled_at,
           r.target_user_id, tp.nickname target_nickname, tc.nickname target_community_nickname, tc.avatar_url target_community_avatar,
           rp.nickname reporter_nickname,
           (select count(*) from public.community_reports x where x.target_kind = r.target_kind and x.target_ref = r.target_ref) same_target_count,
           (select count(*) from public.community_reports x where x.target_user_id = r.target_user_id) target_user_count,
           (select b.until from public.community_bans b where b.user_id = r.target_user_id and b.lifted_at is null and (b.until is null or b.until > now()) order by b.until desc nulls first limit 1) ban_until,
           exists (select 1 from public.community_bans b where b.user_id = r.target_user_id and b.lifted_at is null and b.until is null) ban_permanent
      from public.community_reports r
      left join public.profiles tp on tp.id = r.target_user_id
      left join public.community_profiles tc on tc.user_id = r.target_user_id
      left join public.profiles rp on rp.id = r.reporter_id
     where p_status = 'all' or r.status = p_status
     order by r.created_at desc
     limit 100) t), '[]'::jsonb);
end $$;
revoke execute on function public.admin_community_reports(text) from anon;

-- 신고 처리: 같은 대상의 열린 신고를 한꺼번에 같은 상태로
create or replace function public.admin_resolve_community_report(p_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.community_reports;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  if p_status not in ('open','resolved','dismissed') then raise exception '잘못된 상태입니다'; end if;
  select * into r from public.community_reports where id = p_id;
  if r.id is null then raise exception '신고를 찾을 수 없습니다'; end if;
  update public.community_reports set status = p_status, handled_by = me, handled_at = now()
   where target_kind = r.target_kind and target_ref = r.target_ref and (status = 'open' or id = p_id);
  insert into public.admin_audit (admin_id, action, target, detail)
  values (me, 'creport_' || p_status, r.target_kind || ':' || r.target_ref, jsonb_build_object('report', p_id));
end $$;
revoke execute on function public.admin_resolve_community_report(bigint, text) from anon;

-- 관리자: 부적절한 커뮤니티 닉네임 지우기(회원은 다음에 새 닉네임을 정한다 — 처음 정하는 것으로 보아 30일 제한 없음)
create or replace function public.admin_clear_community_nickname(p_target uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); old text;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  select nickname into old from public.community_profiles where user_id = p_target;
  update public.community_profiles set nickname = null where user_id = p_target;
  perform private.notify(p_target, 'sanction', '커뮤니티 닉네임이 운영 기준에 맞지 않아 지워졌어요', '마이 펜싱 > 커뮤니티 설정에서 새 닉네임을 정해 주세요', '/?tab=community');
  insert into public.admin_audit (admin_id, action, target, detail) values (me, 'community_nick_clear', p_target::text, jsonb_build_object('nickname', old));
end $$;
revoke execute on function public.admin_clear_community_nickname(uuid) from anon;

-- 관리자 회원 목록에 커뮤니티 정지 정보 추가 (기존 함수 확장: 항목만 늘어남)
create or replace function public.admin_members(p_q text default ''::text, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare q text := btrim(coalesce(p_q, ''));
begin
  if not public.is_admin_user() then return null; end if;
  return coalesce((select jsonb_agg(t) from (
    select p.id, p.nickname, u.email, p.role, p.leader_status, p.weapon, p.region, p.affiliation, p.club_id, p.avatar_locked, p.is_admin,
           p.consent_version, p.onboarded, u.created_at, u.last_sign_in_at, u.banned_until,
           (select count(*) from public.athlete_links l where l.profile_id = p.id) linked,
           (select count(*) from public.support_tickets s where s.profile_id = p.id) tickets,
           cp.nickname community_nickname,
           (select jsonb_build_object('until', b.until, 'reason', b.reason) from public.community_bans b
             where b.user_id = p.id and b.lifted_at is null and (b.until is null or b.until > now())
             order by b.until desc nulls first limit 1) community_ban
      from public.profiles p join auth.users u on u.id = p.id
      left join public.community_profiles cp on cp.user_id = p.id
     where q = '' or p.nickname ilike '%' || q || '%' or u.email ilike '%' || q || '%' or cp.nickname ilike '%' || q || '%'
     order by u.created_at desc limit least(greatest(p_limit, 1), 100)) t), '[]'::jsonb);
end $$;

-- 관리자 현황 숫자에 '미처리 커뮤니티 신고' 추가 (기존 함수 확장)
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

-- ───────────────────────── 정리 작업 ─────────────────────────
-- 알림은 60일 뒤 삭제 (매일 새벽 4시 KST = 19:00 UTC)
select cron.schedule('notifications-cleanup', '10 19 * * *', $$delete from public.notifications where created_at < now() - interval '60 days'$$);

-- ───────────────────────── 권한 정리 (마이그레이션 `community_foundation_grants`) ─────────────────────────
-- 함수 실행 권한은 기본으로 PUBLIC(=비로그인 anon 포함)에 열려 있어 위의 'revoke … from anon' 만으로는 막히지 않는다.
-- 로그인 전용 함수는 PUBLIC·anon 에서 회수하고 authenticated 에만 준다(함수 안에서도 auth.uid()/is_admin_user() 로 다시 확인).
do $$
declare f text;
begin
  foreach f in array array[
    'public.community_name_available(text)', 'public.get_my_community()', 'public.save_community_profile(boolean, text)',
    'public.mark_notifications_read(bigint[])', 'public.get_notification_settings()', 'public.set_notification_pref(text, boolean)',
    'public.block_target(text, text)', 'public.my_blocks()', 'public.unblock(bigint)', 'public.report_target(text, text, text, text)',
    'public.my_community_status()', 'public.admin_community_ban(uuid, int, text)', 'public.admin_community_unban(uuid)',
    'public.admin_community_reports(text)', 'public.admin_resolve_community_report(bigint, text)', 'public.admin_clear_community_nickname(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
alter function private.notify_toggleable() set search_path = public;
