-- 마이그레이션 42 `admin_messages` — 관리자 → 회원 쪽지 / 고객지원 답장
-- 배경: 고객지원 접수에 관리자가 답할 방법이 없었다(비회원 이메일은 직접 보내야 했고, 회원에게는 아무 경로가 없었음).
-- 구성
--   ① 표 admin_messages: 운영팀이 회원에게 보낸 글. 고객지원 접수(ticket_id)에 대한 답장이면 접수와 연결, 아니면 일반 쪽지.
--      표는 직접 읽고 쓸 수 없고(권한 전부 회수) 아래 RPC 로만 다룬다 → 보낸 관리자 id 가 회원 화면에 나가지 않는다.
--   ② RPC admin_send_message(관리자) / admin_messages_of(관리자: 보낸 내역) / my_admin_messages(회원: 받은 글) / read_admin_message(회원: 읽음)
--   ③ 보내면 받는 회원에게 공용 알림(kind 'system' = 끌 수 없음, 링크 /support?msg=<id>)이 간다. 커뮤니티 차단과 무관하게 항상 도착.
--   ④ 처리 내역은 admin_audit('admin_message') 에 남긴다(본문은 남기지 않음). 1년 지난 글은 매일 정리 — 고객지원 접수 보관 기간(1년)과 같다.
-- 비회원 접수(profile_id 없음)는 이 경로로 보낼 수 없다 → 화면에서 접수자가 남긴 이메일로 메일 쓰기 링크(mailto)를 준다.

create table public.admin_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,        -- 받는 회원(탈퇴하면 함께 삭제)
  ticket_id bigint references public.support_tickets(id) on delete set null,     -- 고객지원 답장이면 그 접수
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  sent_by uuid references public.profiles(id) on delete set null,                 -- 보낸 관리자(회원 화면에는 내보내지 않음)
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index admin_messages_user_idx on public.admin_messages (user_id, created_at desc);
create index admin_messages_ticket_idx on public.admin_messages (ticket_id) where ticket_id is not null;
alter table public.admin_messages enable row level security;
revoke all on public.admin_messages from anon, authenticated;   -- 정책도 두지 않는다: RPC(SECURITY DEFINER)로만 접근

-- 관리자: 쪽지 / 접수 답장 보내기. p_ticket 이 있으면 그 접수를 낸 회원에게만 보낼 수 있다.
-- p_done = true 면 접수를 '처리 완료'로, 아니면 '접수됨'이던 접수는 '처리 중'으로 바꾼다.
create or replace function public.admin_send_message(p_user uuid, p_title text, p_body text, p_ticket bigint default null, p_done boolean default false)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare me uuid := auth.uid(); t public.support_tickets; new_id bigint; ttl text := btrim(coalesce(p_title, '')); bd text := btrim(coalesce(p_body, ''));
begin
  if not public.is_admin_user() then raise exception '관리자만 사용할 수 있습니다'; end if;
  if char_length(ttl) < 1 or char_length(ttl) > 100 then raise exception '제목은 1~100자로 적어 주세요'; end if;
  if char_length(bd) < 1 or char_length(bd) > 2000 then raise exception '내용은 1~2000자로 적어 주세요'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception '받는 회원을 찾을 수 없습니다'; end if;
  if p_ticket is not null then
    select * into t from public.support_tickets where id = p_ticket;
    if t.id is null then raise exception '접수를 찾을 수 없습니다'; end if;
    if t.profile_id is distinct from p_user then raise exception '이 접수를 낸 회원에게만 답장할 수 있습니다'; end if;
  end if;
  insert into public.admin_messages (user_id, ticket_id, title, body, sent_by) values (p_user, p_ticket, ttl, bd, me) returning id into new_id;
  if p_ticket is not null then
    update public.support_tickets set status = case when p_done then 'done' when status = 'new' then 'in_progress' else status end where id = p_ticket;
  end if;
  -- p_actor 를 비워 두어 커뮤니티 차단·본인 제외 규칙이 적용되지 않게 한다(운영 안내는 항상 도착)
  perform private.notify(p_user, 'system',
    case when p_ticket is null then '운영팀에서 쪽지가 도착했어요' else '문의에 답변이 도착했어요' end,
    ttl, '/support?msg=' || new_id);
  insert into public.admin_audit (admin_id, action, target, detail)
  values (me, 'admin_message', p_user::text, jsonb_build_object('message', new_id, 'ticket', p_ticket, 'done', p_done));
  return new_id;
end $$;

-- 관리자: 보낸 내역(회원별 또는 접수별). 둘 다 비우면 최근 50건
create or replace function public.admin_messages_of(p_user uuid default null, p_ticket bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user() then return null; end if;
  return coalesce((select jsonb_agg(t order by t.created_at desc) from (
    select m.id, m.user_id, m.ticket_id, m.title, m.body, m.created_at, m.read_at, a.nickname sender_nickname
      from public.admin_messages m left join public.profiles a on a.id = m.sent_by
     where (p_user is null or m.user_id = p_user) and (p_ticket is null or m.ticket_id = p_ticket)
     order by m.created_at desc limit 50) t), '[]'::jsonb);
end $$;

-- 회원: 내가 받은 운영팀 글(최근 50건). 보낸 관리자 정보는 내보내지 않는다
create or replace function public.my_admin_messages()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(t order by t.created_at desc) from (
    select m.id, m.title, m.body, m.ticket_id, s.title ticket_title, m.created_at, m.read_at
      from public.admin_messages m left join public.support_tickets s on s.id = m.ticket_id
     where m.user_id = auth.uid()
     order by m.created_at desc limit 50) t), '[]'::jsonb);
end $$;

-- 회원: 읽음 표시(내 글만) — 알림의 읽음 처리는 화면이 따로 한다
create or replace function public.read_admin_message(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.admin_messages set read_at = now() where id = p_id and user_id = auth.uid() and read_at is null;
$$;

-- 로그인 전용 함수 권한 정리(PUBLIC·anon 회수 → authenticated 만). 관리자 확인은 함수 안에서 다시 한다
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_send_message(uuid, text, text, bigint, boolean)', 'public.admin_messages_of(uuid, bigint)',
    'public.my_admin_messages()', 'public.read_admin_message(bigint)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 1년 지난 글 정리(매일 새벽 4시 20분 KST = 19:20 UTC)
select cron.schedule('admin-messages-cleanup', '20 19 * * *', $$delete from public.admin_messages where created_at < now() - interval '1 year'$$);
