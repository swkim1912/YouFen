-- 마이그레이션 38 `openpiste_photos_comp_notices` (2026-10-09, 브랜치 feature/community)
--  ① 오픈피스트 모집글 사진(최대 3장, 첫 장 = 대표 사진 — 목록에 보임)
--  ② 다가오는 대회(대회 화면 위쪽, 관리자가 직접 게시): 글 + 사진 5장 + 첨부 파일 5개(파일당 10MB)

-- ───────────────────────── ① 오픈피스트 사진 ─────────────────────────
-- 사진은 커뮤니티 사진 API(/api/community-image?kind=openpiste)로 올리고 community_uploads.op_post_id 로 글에 붙인다.
-- 게시 중인 글의 수정안에 새로 넣은 사진도 승인 전까지 글에 붙여 둔다(하루 지나 고아로 지워지지 않게).
-- 지금 사진(images)에도 수정안에도 없는 사진은 연결을 끊어 사진 API 가 하루 뒤 파일을 지운다(private.op_release_unused).
alter table public.openpiste_posts add column images jsonb not null default '[]'
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 3);

alter table public.community_uploads drop constraint community_uploads_kind_check;
alter table public.community_uploads add constraint community_uploads_kind_check check (kind in ('post','market','dm','chat','openpiste'));
alter table public.community_uploads add column op_post_id bigint references public.openpiste_posts(id) on delete set null;
create index community_uploads_op_idx on public.community_uploads (op_post_id);
drop index if exists public.community_uploads_orphan_idx;
create index community_uploads_orphan_idx on public.community_uploads (created_at)
  where post_id is null and listing_id is null and message_id is null and chat_message_id is null and op_post_id is null;

-- 사진 묶음(jsonb): 업로드 id 순서대로 {id, path, thumb, w, h} (첫 장 = 대표)
create or replace function private.op_images(p_post bigint, p_ids bigint[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'thumb', u.thumb, 'w', u.width, 'h', u.height)
                            order by array_position(p_ids, u.id)), '[]'::jsonb)
    from public.community_uploads u where u.op_post_id = p_post and u.id = any (p_ids)
$$;

-- 지금 사진에도, 승인 대기 중인 수정안에도 없는 사진의 연결을 끊는다(→ 사진 API 가 하루 뒤 파일 정리)
create or replace function private.op_release_unused(p_post bigint)
returns void language sql security definer set search_path = public as $$
  update public.community_uploads u set op_post_id = null
   where u.op_post_id = p_post
     and not exists (select 1 from public.openpiste_posts p where p.id = p_post
                      and (u.id in (select (x->>'id')::bigint from jsonb_array_elements(p.images) x)
                           or u.id in (select y::bigint from jsonb_array_elements_text(coalesce(p.pending_edit->'uploads', '[]'::jsonb)) y)));
$$;

-- 넘겨받은 사진 id 가 쓸 수 있는 것인지(내 것, 오픈피스트용, 다른 글에 안 붙음, 이 글에 붙은 것은 허용)
create or replace function private.op_check_uploads(p_me uuid, p_post bigint, p_ids bigint[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if cardinality(p_ids) > 3 or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
     or cardinality(p_ids) <> (select count(*) from public.community_uploads
                                where id = any (p_ids) and user_id = p_me and kind = 'openpiste'
                                  and post_id is null and listing_id is null and message_id is null and chat_message_id is null
                                  and (op_post_id is null or op_post_id = p_post)) then
    raise exception 'uploads_invalid';
  end if;
end $$;

-- 목록·상세 요약에 대표 사진(thumb)·사진 수 추가
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
    'thumb', p.images->0->>'thumb', 'image_count', jsonb_array_length(p.images),
    'host', private.content_card(p.host_id, 'y', ''))
$$;

-- 상세: 사진 + (주최자·관리자) 수정안의 사진
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
    'images', p.images,
    'chat_url', case when v_member or v_admin then p.chat_url end,
    'has_chat_url', p.chat_url is not null,
    'pending_edit', case when v_host or v_admin then p.pending_edit end,
    'pending_images', case when (v_host or v_admin) and p.pending_edit is not null
                           then private.op_images(p.id, array(select y::bigint from jsonb_array_elements_text(coalesce(p.pending_edit->'uploads', '[]'::jsonb)) y)) end,
    'status_reason', case when v_host or v_admin then p.status_reason end,
    'edited', p.edited_at is not null,
    'is_admin', v_admin,
    'can_report', not v_host and p.host_id is not null,
    'host_blocked_me', not v_host and p.host_id is not null and private.blocked_either(me, p.host_id));
end $$;

-- 쓰기·수정에 사진(p_uploads, 첫 장 = 대표, 최대 3장) 추가 — 인자가 바뀌므로 예전 함수는 지운다
drop function public.op_write(jsonb);
drop function public.op_edit(bigint, jsonb);

create or replace function public.op_write(p_data jsonb, p_uploads bigint[] default '{}')
returns bigint language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); d jsonb; new_id bigint; ups bigint[] := coalesce(p_uploads, '{}');
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  if not private.market_eligible(me) then raise exception 'op_not_eligible'; end if;
  d := private.op_clean(p_data);
  perform private.op_check_uploads(me, null, ups);
  perform pg_advisory_xact_lock(hashtext('op-write:' || me::text));
  if exists (select 1 from public.openpiste_posts where host_id = me and created_at > now() - interval '10 minutes') then raise exception 'rate_op_min'; end if;
  if (select count(*) from public.openpiste_posts where host_id = me and created_at > now() - interval '24 hours') >= 5 then raise exception 'rate_op_day'; end if;
  if (select count(*) from public.openpiste_posts where host_id = me and status in ('pending','open','closed') and ends_at > now()) >= 10 then raise exception 'op_too_many'; end if;
  insert into public.openpiste_posts (host_id, title, weapon, levels, place, region, starts_at, duration_h, ends_at, capacity, fee, body, chat_url)
  values (me, d->>'title', d->>'weapon', array(select jsonb_array_elements_text(d->'levels')), d->>'place', d->>'region',
          (d->>'starts_at')::timestamptz, (d->>'duration_h')::int, (d->>'starts_at')::timestamptz + make_interval(hours => (d->>'duration_h')::int),
          (d->>'capacity')::int, (d->>'fee')::int, d->>'body', d->>'chat_url')
  returning id into new_id;
  update public.community_uploads set op_post_id = new_id where id = any (ups);
  update public.openpiste_posts set images = private.op_images(new_id, ups) where id = new_id;
  perform private.notify_admins('오픈피스트 모집 승인 요청', left(d->>'title', 40) || ' · ' || (d->>'weapon') || ' · ' || (d->>'region'), '/admin?tab=openpiste');
  return new_id;
end $$;

create or replace function public.op_edit(p_id bigint, p_data jsonb, p_uploads bigint[] default '{}')
returns text language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts; d jsonb; ups bigint[] := coalesce(p_uploads, '{}');
begin
  if me is null then raise exception 'login'; end if;
  if (private.active_ban(me)).id is not null then raise exception 'community_banned'; end if;
  select * into p from public.openpiste_posts where id = p_id for update;
  if p.id is null or p.status = 'deleted' then raise exception 'not_found'; end if;
  if p.host_id is distinct from me then raise exception 'not_mine'; end if;
  d := private.op_clean(p_data);
  perform private.op_check_uploads(me, p_id, ups);
  if p.status in ('pending','rejected') then
    update public.community_uploads set op_post_id = p_id where id = any (ups);
    update public.openpiste_posts set
        title = d->>'title', weapon = d->>'weapon', levels = array(select jsonb_array_elements_text(d->'levels')), place = d->>'place', region = d->>'region',
        starts_at = (d->>'starts_at')::timestamptz, duration_h = (d->>'duration_h')::int,
        ends_at = (d->>'starts_at')::timestamptz + make_interval(hours => (d->>'duration_h')::int),
        capacity = (d->>'capacity')::int, fee = (d->>'fee')::int, body = d->>'body', chat_url = d->>'chat_url',
        images = private.op_images(p_id, ups), pending_edit = null,
        status = 'pending', status_reason = null, edited_at = now()
     where id = p_id;
    perform private.op_release_unused(p_id);
    if p.status = 'rejected' then
      perform private.notify_admins('오픈피스트 모집 재승인 요청', left(d->>'title', 40), '/admin?tab=openpiste');
    end if;
    return 'pending';
  elsif p.status in ('open','closed') and p.ends_at > now() then
    if (d->>'capacity')::int < private.op_count(p_id) then raise exception 'bad_input:capacity_below'; end if;
    perform pg_advisory_xact_lock(hashtext('op-edit:' || me::text));
    if p.edit_submitted_at > now() - interval '10 minutes' and p.pending_edit is not null then raise exception 'rate_op_min'; end if;
    update public.community_uploads set op_post_id = p_id where id = any (ups); -- 승인 전까지 지워지지 않게 붙여 둔다
    update public.openpiste_posts set pending_edit = d || jsonb_build_object('uploads', to_jsonb(ups)), edit_submitted_at = now() where id = p_id;
    perform private.op_release_unused(p_id); -- 예전 수정안에만 있던 사진 정리
    perform private.notify_admins('오픈피스트 모집 수정 승인 요청', left(p.title, 40), '/admin?tab=openpiste');
    return 'edit_pending';
  end if;
  raise exception 'op_not_editable';
end $$;

create or replace function public.op_withdraw_edit(p_id bigint)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  update public.openpiste_posts set pending_edit = null, edit_submitted_at = null where id = p_id and host_id = auth.uid();
  if found then perform private.op_release_unused(p_id); end if;
end $$;

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
  perform private.op_release_unused(p_id);
  perform private.op_notify_members(p_id, 'system', '참가 신청한 오픈피스트가 취소됐어요',
    '「' || left(p.title, 30) || '」 ' || coalesce('사유: ' || v_reason, '주최자가 모집을 취소했어요'), me);
end $$;

-- 승인 대기 목록: 지금 사진과 수정안 사진 포함
create or replace function public.admin_op_queue()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin_user() then return null; end if;
  return coalesce((select jsonb_agg(t order by t.submitted_at) from (
    select p.id, p.status, p.title, p.weapon, p.levels, p.place, p.region, p.starts_at, p.duration_h, p.capacity, p.fee, p.body, p.chat_url,
           p.images, p.pending_edit, p.created_at, p.edited_at, private.op_count(p.id) count,
           case when p.pending_edit is not null
                then private.op_images(p.id, array(select y::bigint from jsonb_array_elements_text(coalesce(p.pending_edit->'uploads', '[]'::jsonb)) y)) end pending_images,
           case when p.status = 'pending' then 'new' else 'edit' end kind,
           coalesce(case when p.status = 'pending' then coalesce(p.edited_at, p.created_at) end, p.edit_submitted_at) submitted_at,
           pr.nickname host_nickname, p.host_id,
           (select count(*) from public.openpiste_posts x where x.host_id = p.host_id and x.status in ('open','closed','ended')) host_hosted
      from public.openpiste_posts p left join public.profiles pr on pr.id = p.host_id
     where p.status = 'pending' or (p.pending_edit is not null and p.status in ('open','closed'))
     order by 1 limit 100) t), '[]'::jsonb);
end $$;

-- 승인/반려: 수정 승인 때 사진도 반영, 반려·승인 뒤 쓰지 않는 사진 정리
create or replace function public.admin_op_review(p_id bigint, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); p public.openpiste_posts; d jsonb; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_ups bigint[];
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
      v_ups := array(select y::bigint from jsonb_array_elements_text(coalesce(d->'uploads', '[]'::jsonb)) y);
      update public.openpiste_posts set
          title = d->>'title', weapon = d->>'weapon', levels = array(select jsonb_array_elements_text(d->'levels')), place = d->>'place', region = d->>'region',
          starts_at = (d->>'starts_at')::timestamptz, duration_h = (d->>'duration_h')::int,
          ends_at = (d->>'starts_at')::timestamptz + make_interval(hours => (d->>'duration_h')::int),
          capacity = (d->>'capacity')::int, fee = (d->>'fee')::int, body = d->>'body', chat_url = d->>'chat_url',
          images = private.op_images(p_id, v_ups),
          pending_edit = null, edit_submitted_at = null, edited_at = now(), approved_at = now(), approved_by = me
       where id = p_id;
      perform private.op_release_unused(p_id);
      perform private.notify(p.host_id, 'system', '오픈피스트 수정 내용이 승인됐어요', '「' || left(d->>'title', 30) || '」', '/openpiste/' || p_id);
      perform private.op_notify_members(p_id, 'system', '참가 신청한 오픈피스트의 내용이 바뀌었어요',
        '「' || left(d->>'title', 30) || '」 일시·장소 등을 다시 확인해 주세요', p.host_id);
    else
      update public.openpiste_posts set pending_edit = null, edit_submitted_at = null where id = p_id;
      perform private.op_release_unused(p_id);
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

-- ───────────────────────── ② 다가오는 대회 ─────────────────────────
-- 관리자만 쓰고, 누구나(비로그인 포함) 읽는다. 대회가 끝나면(종료일, 없으면 시작일이 지나면) 목록에서 빠진다.
-- 사진: 서버 API /api/comp-notice 가 webp(긴 변 1600) + 썸네일로 만들어 버킷 comp-notices 의 images/ 에 저장.
-- 파일: 같은 API 가 서명된 업로드 주소를 만들어 주면 브라우저가 files/ 에 직접 올린다(Vercel 요청 크기 한도 4.5MB 를 넘는 파일도 가능, 파일당 10MB).
create table public.comp_notices (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 2 and 100),
  start_date date not null,
  end_date date,
  place text check (char_length(place) <= 100),
  body text not null default '' check (char_length(body) <= 5000),
  link_url text check (char_length(link_url) <= 300 and link_url ~ '^https://'),
  images jsonb not null default '[]' check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 5),
  files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 5),
  published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index comp_notices_date_idx on public.comp_notices (start_date);
alter table public.comp_notices enable row level security;
revoke all on public.comp_notices from anon, authenticated;
revoke all on sequence public.comp_notices_id_seq from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comp-notices', 'comp-notices', true, 10485760, array[
  'image/webp', 'image/jpeg', 'image/png', 'application/pdf', 'application/x-hwp', 'application/vnd.hancom.hwpx',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'text/plain'])
on conflict (id) do nothing;

-- 다가오는 대회(누구나): 게시 중이고 아직 끝나지 않은 것, 가까운 순
create or replace function public.comp_notices_upcoming()
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  perform private.throttle();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'title', n.title, 'start_date', n.start_date, 'end_date', n.end_date, 'place', n.place, 'body', n.body,
      'link_url', n.link_url, 'images', n.images, 'files', n.files, 'updated_at', n.updated_at) order by n.start_date, n.id)
    from public.comp_notices n
   where n.published and coalesce(n.end_date, n.start_date) >= (now() at time zone 'Asia/Seoul')::date), '[]'::jsonb);
end $$;

-- 관리자 목록(지난 것·숨긴 것 포함)
create or replace function public.admin_comp_notices()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user() then return null; end if;
  return coalesce((select jsonb_agg(to_jsonb(n) - 'created_by' order by n.start_date desc, n.id desc)
    from (select * from public.comp_notices order by start_date desc limit 200) n), '[]'::jsonb);
end $$;

-- 관리자 저장(p_id null = 새로). 사진 {path(images/…), thumb, w, h}, 파일 {path(files/…), name, size, type}
create or replace function public.admin_comp_notice_save(p_id bigint, p_data jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); v_id bigint; v_imgs jsonb := coalesce(p_data->'images', '[]'::jsonb); v_files jsonb := coalesce(p_data->'files', '[]'::jsonb);
  v_start date; v_end date;
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  begin
    v_start := (p_data->>'start_date')::date; v_end := nullif(p_data->>'end_date', '')::date;
  exception when others then raise exception '날짜를 확인해 주세요';
  end;
  if v_start is null then raise exception '대회 시작일을 정해 주세요'; end if;
  if jsonb_typeof(v_imgs) <> 'array' or jsonb_array_length(v_imgs) > 5
     or exists (select 1 from jsonb_array_elements(v_imgs) x where coalesce(x->>'path', '') !~ '^images/[0-9a-f-]{36}\.webp$' or coalesce(x->>'thumb', '') !~ '^images/[0-9a-f-]{36}_t\.webp$') then
    raise exception '사진 정보가 맞지 않아요';
  end if;
  if jsonb_typeof(v_files) <> 'array' or jsonb_array_length(v_files) > 5
     or exists (select 1 from jsonb_array_elements(v_files) x
                 where coalesce(x->>'path', '') !~ '^files/[0-9a-f-]{36}\.[a-z0-9]{1,5}$' or char_length(coalesce(x->>'name', '')) not between 1 and 150
                    or coalesce((x->>'size')::bigint, 0) not between 1 and 10485760) then
    raise exception '첨부 파일 정보가 맞지 않아요';
  end if;
  if p_id is null then
    insert into public.comp_notices (title, start_date, end_date, place, body, link_url, images, files, published, created_by)
    values (btrim(p_data->>'title'), v_start, v_end, nullif(btrim(coalesce(p_data->>'place', '')), ''), btrim(coalesce(p_data->>'body', '')),
            nullif(btrim(coalesce(p_data->>'link_url', '')), ''), v_imgs, v_files, coalesce((p_data->>'published')::boolean, true), me)
    returning id into v_id;
  else
    update public.comp_notices set title = btrim(p_data->>'title'), start_date = v_start, end_date = v_end,
           place = nullif(btrim(coalesce(p_data->>'place', '')), ''), body = btrim(coalesce(p_data->>'body', '')),
           link_url = nullif(btrim(coalesce(p_data->>'link_url', '')), ''), images = v_imgs, files = v_files,
           published = coalesce((p_data->>'published')::boolean, true), updated_at = now()
     where id = p_id returning id into v_id;
    if v_id is null then raise exception '대상을 찾을 수 없습니다'; end if;
  end if;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (me, case when p_id is null then 'comp_notice_create' else 'comp_notice_update' end, 'comp_notice:' || v_id, jsonb_build_object('title', p_data->>'title'));
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.op_write(jsonb, bigint[])', 'public.op_edit(bigint, jsonb, bigint[])', 'public.op_withdraw_edit(bigint)', 'public.op_cancel(bigint, text)',
    'public.op_get(bigint)', 'public.admin_op_queue()', 'public.admin_op_review(bigint, boolean, text)',
    'public.admin_comp_notices()', 'public.admin_comp_notice_save(bigint, jsonb)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- 다가오는 대회는 비로그인도 본다(대회 화면은 공개)
revoke execute on function public.comp_notices_upcoming() from public;
grant execute on function public.comp_notices_upcoming() to anon, authenticated;
revoke execute on function private.op_images(bigint, bigint[]), private.op_release_unused(bigint), private.op_check_uploads(uuid, bigint, bigint[])
  from public, anon, authenticated;
