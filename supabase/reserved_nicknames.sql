-- 운영진 사칭 닉네임 금지 (2026-10-11, 브랜치 fix/nickname-sheet-draft, 마이그레이션 41 `reserved_nicknames`)
-- 관리자(profiles.is_admin)가 아닌 회원은 '관리자', '운영자', '유펜', 'admin' 처럼 운영진으로 오해할 수 있는 말이 들어간 닉네임을 못 쓴다.
-- 적용 범위: 유펜 닉네임(가입·온보딩·상세 설정 — 트리거 profiles_guard), 닉네임 실시간 확인(nickname_available),
--           커뮤니티 전용 닉네임·자유톡방 익명 닉네임(private.community_name_conflict → 코드 'reserved').
-- 이미 쓰고 있는 닉네임은 그대로 두고, 새로 정하거나 바꿀 때만 검사한다.
-- 금지어 목록은 화면 안내용 src/lib/utils.ts RESERVED_NICK 과 같게 유지할 것(최종 판단은 DB).

-- ① 사칭 여지가 있는 닉네임인가(대소문자 무시). 닉네임은 한글·영문·숫자만 허용이라 띄어쓰기·기호로 끼워 넣는 우회는 없다.
--    'badminton'(배드민턴) 안의 'admin' 은 사칭이 아니므로 빼고 본다.
create or replace function public.is_reserved_nickname(n text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    replace(lower(n), 'badminton', '') ~ '(관리자|관리인|관리팀|운영자|운영진|운영팀|운영위원|유펜|유팬|youfen|youfan|yufen|어드민|admin|스태프|스탭|staff|공식|official|시스템|system|고객센터|고객지원|상담원|모더레이터|moderator)',
    false)
$$;
-- 트리거(profiles_guard)는 회원 권한으로 실행되므로 로그인 회원은 부를 수 있어야 한다. 비로그인은 쓸 일이 없다.
revoke execute on function public.is_reserved_nickname(text) from public, anon;
grant execute on function public.is_reserved_nickname(text) to authenticated;

-- ② 유펜 닉네임 트리거: 기존 규칙(형식·지도자 승인 상태·관리자/동의 열 보호·30일 1회)에 사칭 금지를 더한다.
--    관리자 여부는 바뀐 뒤 값(new.is_admin)으로 본다 — 일반 회원은 위에서 old 값으로 되돌려지므로 스스로 관리자가 될 수 없다.
create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.nickname is not null and (new.nickname !~ '^[0-9A-Za-z가-힣]{2,12}$') then
    raise exception '닉네임은 2~12자, 공백 및 특수문자를 사용할 수 없습니다';
  end if;
  -- 지도자 승인 상태: 관리자 RPC(app.leader_rpc=1) 외에는 신분 변경에 따라 자동으로만 바뀐다
  if coalesce(current_setting('app.leader_rpc', true), '') <> '1' then
    if tg_op = 'UPDATE' then
      new.leader_status := old.leader_status;
      new.leader_requested_at := old.leader_requested_at;
    else
      new.leader_status := null;
      new.leader_requested_at := null;
    end if;
    if new.role = '지도자' then
      -- 새로 지도자를 골랐거나 소속 클럽이 바뀌면 다시 승인 대기
      if tg_op = 'INSERT' or old.role is distinct from '지도자' or old.club_id is distinct from new.club_id then
        new.leader_status := 'pending';
        new.leader_requested_at := now();
      end if;
    else
      new.leader_status := null;
      new.leader_requested_at := null;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if auth.uid() is not null then
      new.is_admin := old.is_admin;
      if coalesce(current_setting('app.consent_rpc', true), '') <> '1' then
        new.consent_version := old.consent_version;
        new.consent_at := old.consent_at;
        new.age14_confirmed := old.age14_confirmed;
      end if;
    end if;
    if new.nickname is distinct from old.nickname then
      if old.nickname is not null and old.nickname_changed_at is not null
         and old.nickname_changed_at > now() - interval '30 days' then
        raise exception '닉네임 변경 시 30일 이내 재변경 불가';
      end if;
      new.nickname_changed_at := now();
    end if;
  end if;
  -- 운영진 사칭 닉네임 금지(관리자 제외). 새로 정하거나 바꿀 때만 본다(기존 닉네임은 그대로)
  if new.nickname is not null and (tg_op = 'INSERT' or lower(new.nickname) is distinct from lower(old.nickname))
     and not coalesce(new.is_admin, false) and public.is_reserved_nickname(new.nickname) then
    raise exception '관리자·운영자·유펜처럼 운영진으로 오해할 수 있는 닉네임은 사용할 수 없습니다';
  end if;
  return new;
end $function$;

-- ③ 닉네임 실시간 확인: 사칭 닉네임이면 사용 불가(부르는 사람이 관리자면 허용)
create or replace function public.nickname_available(n text)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
begin
  perform private.throttle();
  if public.is_reserved_nickname(n) and not public.is_admin_user() then return false; end if;
  return not exists (select 1 from public.profiles where lower(nickname) = lower(n) and id is distinct from auth.uid())
     and not exists (select 1 from public.community_profiles c where lower(c.nickname) = lower(n) or lower(c.chat_nickname) = lower(n));
end $function$;

-- ④ 커뮤니티·자유톡방 닉네임: 사칭이면 'reserved'(화면 문구 lib/community.ts NAME_REASON). 그 회원(me)이 관리자면 허용
create or replace function private.community_name_conflict(n text, me uuid)
returns text language sql stable security definer set search_path to 'public', 'private' as $function$
  select case
    when public.is_reserved_nickname(n)
         and not exists (select 1 from public.profiles a where a.id = me and a.is_admin) then 'reserved'
    when exists (select 1 from public.profiles p where lower(p.nickname) = lower(n)) then 'youfen'
    when exists (select 1 from public.community_profiles c
                  where c.user_id is distinct from me and (lower(c.nickname) = lower(n) or lower(c.chat_nickname) = lower(n))) then 'community'
    when exists (select 1 from public.athletes a where a.name = n) then 'realname'
  end
$function$;
