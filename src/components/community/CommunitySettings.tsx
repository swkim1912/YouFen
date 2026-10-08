"use client";
// 마이 펜싱 > 커뮤니티 설정 탭 (docs/COMMUNITY.md 1장)
//  ① 이용 정지 안내(정지 중일 때만) ② 커뮤니티에서 쓸 프로필(유펜 프로필 / 커뮤니티 전용 프로필) + 미리보기
//  ③ 티어 테두리·뱃지(상세 설정에서 옮겨 옴) ④ 알림 설정(종류별 켜기/끄기 + 오픈피스트 새 모집 종목·지역 op_set_alerts) ⑤ 차단 목록
// 저장은 모두 DB 함수(RPC)로 한다: save_community_profile / set_notification_pref / unblock. 오류 코드는 communityError() 가 한글로 바꾼다.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CommunityCardView } from "./CommunityCardView";
import { CommunityAvatarSettings } from "./CommunityAvatarSettings";
import {
  type CommunityStatus, type MyCommunity, NAME_REASON, NOTIFY_KINDS, communityError, fetchMyCommunity, nextNickChange,
} from "@/lib/community";
import { REGIONS, WEAPONS, fmtDate, cn } from "@/lib/utils";

/** 섹션 틀 */
function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

export function CommunitySettings() {
  const { user } = useAuth();
  const [me, setMe] = useState<MyCommunity | null | undefined>(undefined); // undefined = 불러오는 중, null = 실패
  const [status, setStatus] = useState<CommunityStatus | null>(null);

  const load = useCallback(async () => {
    setMe(await fetchMyCommunity());
    const { data } = await supabase.rpc("my_community_status");
    setStatus((data as CommunityStatus | null) ?? null);
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (me === undefined) return <p className="py-16 text-center text-muted">불러오는 중…</p>;
  if (me === null) return <p className="py-16 text-center text-muted">커뮤니티 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>;
  return (
    <div className="space-y-4">
      {status?.banned && <BanNotice status={status} />}
      <ProfileSection me={me} onSaved={load} />
      <FrameBadgeSection tier={me.tier} onSaved={load} />
      <NotifySection />
      <BlockSection />
    </div>
  );
}

/** 이용 정지 안내: 사유·기간·이의제기 방법 */
function BanNotice({ status }: { status: CommunityStatus }) {
  const until = status.permanent ? "영구" : status.until ? `${new Date(status.until).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}까지` : "";
  return (
    <section className="space-y-1 rounded-lg border border-loss/50 bg-loss/10 p-4 text-sm">
      <h2 className="font-bold text-loss">커뮤니티 이용이 제한된 상태예요</h2>
      <p>사유: {status.reason}</p>
      <p>기간: {until}</p>
      <p className="text-xs text-muted">
        제한 중에는 게시판·채팅·장터·오픈피스트에 글을 쓸 수 없고 읽기만 할 수 있어요. 조치에 이의가 있으면{" "}
        <Link href="/support" className="text-brand">고객지원</Link>에서 &quot;이의 제기&quot;로 알려 주세요.
      </p>
    </section>
  );
}

/** 프로필 선택지 한 칸(라디오) */
function FaceOption({ selected, onPick, title, desc }: { selected: boolean; onPick: () => void; title: string; desc: string }) {
  return (
    <label className={cn("flex cursor-pointer gap-3 rounded-md border p-3", selected ? "border-brand bg-brand/5" : "border-line hover:bg-white/5")}>
      <input type="radio" name="community-face" className="mt-1" checked={selected} onChange={onPick} />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </label>
  );
}

/** 커뮤니티 프로필: 어떤 얼굴로 활동할지 + 전용 프로필 닉네임·사진 */
function ProfileSection({ me, onSaved }: { me: MyCommunity; onSaved: () => void }) {
  const [separate, setSeparate] = useState(me.use_separate);
  const [nick, setNick] = useState(me.nickname ?? "");
  const [nickMsg, setNickMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const lockedUntil = nextNickChange(me.nickname_changed_at, !!me.nickname);
  const nickChanged = nick !== (me.nickname ?? "");

  // 닉네임 실시간 확인(입력이 멈추고 0.3초 뒤): 형식 → DB(community_name_available)
  useEffect(() => {
    if (!nickChanged || !nick) { setNickMsg(null); return; }
    if (!/^[0-9A-Za-z가-힣]{2,12}$/.test(nick)) { setNickMsg({ ok: false, text: NAME_REASON.format }); return; }
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("community_name_available", { n: nick });
      if (error) return setNickMsg({ ok: false, text: "확인하지 못했어요. 잠시 후 다시 시도해 주세요" });
      const why = data as string | null;
      setNickMsg(why ? { ok: false, text: NAME_REASON[why] ?? "사용할 수 없는 닉네임이에요" } : { ok: true, text: "사용할 수 있는 닉네임이에요" });
    }, 300);
    return () => clearTimeout(t);
  }, [nick, nickChanged]);

  const dirty = separate !== me.use_separate || nickChanged;
  const save = async () => {
    if (nickChanged && nickMsg && !nickMsg.ok) return toast.error(nickMsg.text);
    if (separate && !nick) return toast.error("커뮤니티 전용 프로필을 쓰려면 먼저 닉네임을 정해 주세요");
    setBusy(true);
    const { error } = await supabase.rpc("save_community_profile", { p_use_separate: separate, p_nickname: nickChanged ? nick : null });
    setBusy(false);
    if (error) return toast.error(communityError(error.message));
    toast.success("커뮤니티 프로필을 저장했어요");
    onSaved();
  };

  // 미리보기: 고른 얼굴. 전용 프로필은 입력 중인 닉네임으로 보여 준다(사진·티어는 저장된 값)
  const preview = separate ? { ...me.card_c, nickname: nick || "닉네임을 정해 주세요" } : me.card_y;

  return (
    <Section title="커뮤니티 프로필" desc="게시판·채팅·장터에서 다른 회원에게 보일 얼굴을 골라요. 등수는 표시되지 않아요.">
      <div className="grid gap-2 sm:grid-cols-2">
        <FaceOption selected={!separate} onPick={() => setSeparate(false)} title="유펜 프로필 그대로" desc="유펜 닉네임과 사진으로 활동해요. 카드를 누르면 내 유펜 프로필로 이동할 수 있어요." />
        <FaceOption selected={separate} onPick={() => setSeparate(true)} title="커뮤니티 전용 프로필" desc="커뮤니티에서만 쓰는 닉네임·사진으로 활동해요. 유펜 프로필·선수 정보와 연결되지 않아요." />
      </div>

      <div className="rounded-md bg-panel2 px-3 py-2.5">
        <p className="mb-1.5 text-[11px] text-muted">미리보기</p>
        <CommunityCardView card={preview} size={36} link={false} />
      </div>

      {separate && (
        <div className="space-y-4 rounded-md border border-line p-3">
          <div>
            <Label>커뮤니티 닉네임 (2~12자, 특수문자·공백 불가)</Label>
            <Input value={nick} maxLength={12} disabled={!!lockedUntil} onChange={(e) => setNick(e.target.value.trim())} placeholder="커뮤니티에서 쓸 닉네임" />
            {nickMsg && <p className={cn("mt-1 text-xs", nickMsg.ok ? "text-emerald-400" : "text-loss")}>{nickMsg.text}</p>}
            <p className="mt-1 text-xs text-muted">
              {lockedUntil
                ? `닉네임은 30일에 1번 바꿀 수 있어요. ${fmtDate(lockedUntil.toISOString())}부터 다시 바꿀 수 있어요.`
                : "유펜 닉네임(내 것 포함)·다른 회원의 닉네임·선수 실명과 같은 이름은 쓸 수 없어요. 정한 뒤에는 30일에 1번 바꿀 수 있어요."}
            </p>
          </div>
          <CommunityAvatarSettings avatarUrl={me.avatar_url} nickname={nick || me.nickname} onChanged={onSaved} />
        </div>
      )}

      <p className="text-xs text-muted">글·댓글·장터 글은 쓸 때 고른 프로필로 계속 보여요. 나중에 설정을 바꿔도 예전 글의 이름이 다른 프로필로 바뀌지 않아요.</p>
      <Button className="w-full sm:w-auto" disabled={busy || !dirty} onClick={save}>저장</Button>
    </Section>
  );
}

/** 티어 테두리·뱃지 사용 (profiles.use_frame / use_badge — 상세 설정에서 이 탭으로 옮김) */
function FrameBadgeSection({ tier, onSaved }: { tier: string | null; onSaved: () => void }) {
  const { user, profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user || !profile) return null;
  const set = async (patch: { use_frame?: boolean; use_badge?: boolean }) => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    onSaved();
  };
  return (
    <Section title="티어 테두리·뱃지" desc={tier ? `지금 티어: ${tier}. 커뮤니티 카드의 사진 테두리와 닉네임 옆 엠블럼으로 보여요.` : "연결된 선수의 이번 시즌 티어가 생기면 커뮤니티 카드에 보여요."}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={profile.use_frame} onChange={(e) => set({ use_frame: e.target.checked })} />티어 테두리 사용</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={profile.use_badge} onChange={(e) => set({ use_badge: e.target.checked })} />티어 뱃지 사용</label>
    </Section>
  );
}

/** 알림 설정: 종류별 켜기/끄기 (이용 제한 안내·운영 알림은 끌 수 없음) */
function NotifySection() {
  const [off, setOff] = useState<string[] | null>(null);
  useEffect(() => {
    supabase.rpc("get_notification_settings").then(({ data }) => setOff(((data as { off?: string[] } | null)?.off) ?? []));
  }, []);
  const toggle = async (key: string, on: boolean) => {
    const { data, error } = await supabase.rpc("set_notification_pref", { p_kind: key, p_on: on });
    if (error) return toast.error(communityError(error.message));
    setOff(((data as { off?: string[] } | null)?.off) ?? []);
  };
  return (
    <Section title="알림 설정" desc="끈 알림은 오지 않아요. 이용 제한 안내는 끌 수 없어요.">
      {off === null ? <p className="text-sm text-muted">불러오는 중…</p> : (
        <ul className="divide-y divide-line">
          {NOTIFY_KINDS.map((k) => {
            const on = !off.includes(k.key);
            return (
              <li key={k.key} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{k.label}</p>
                  <p className="text-xs text-muted">{k.desc}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={on}
                  aria-label={`${k.label} 알림`}
                  onClick={() => toggle(k.key, !on)}
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-line")}
                >
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left]", on ? "left-[22px]" : "left-0.5")} />
                </button>
                {k.key === "openpiste" && on && <OpenpisteAlerts />}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** 오픈피스트 새 모집 알림: 받을 종목(필수)과 지역(안 고르면 전국). 내 모집의 참가 신청 알림은 종목과 상관없이 온다 */
function OpenpisteAlerts() {
  const [pref, setPref] = useState<{ weapons: string[]; regions: string[] } | null>(null);
  useEffect(() => {
    supabase.rpc("op_get_alerts").then(({ data }) => setPref((data as { weapons: string[]; regions: string[] } | null) ?? { weapons: [], regions: [] }));
  }, []);
  const save = async (next: { weapons: string[]; regions: string[] }) => {
    setPref(next);
    const { error } = await supabase.rpc("op_set_alerts", { p_weapons: next.weapons, p_regions: next.regions });
    if (error) toast.error(communityError(error.message));
  };
  if (!pref) return null;
  const flip = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const chip = (on: boolean) => cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-foreground");
  return (
    <div className="mt-2 w-full basis-full space-y-1.5 rounded-md bg-panel2 p-2.5">
      <p className="text-[11px] text-muted">새 모집 알림을 받을 종목{pref.weapons.length === 0 && <b className="text-pending"> — 하나 이상 골라야 알림이 와요</b>}</p>
      <div className="flex flex-wrap gap-1">
        {WEAPONS.map((w) => <button key={w} className={chip(pref.weapons.includes(w))} onClick={() => save({ ...pref, weapons: flip(pref.weapons, w) })}>{w}</button>)}
      </div>
      <p className="pt-1 text-[11px] text-muted">지역 (안 고르면 전국)</p>
      <div className="flex flex-wrap gap-1">
        {REGIONS.map((r) => <button key={r} className={chip(pref.regions.includes(r))} onClick={() => save({ ...pref, regions: flip(pref.regions, r) })}>{r}</button>)}
      </div>
    </div>
  );
}

/** 차단 목록: 차단할 때 보이던 이름만 보여 주고(상대가 누구인지는 알려 주지 않음) 해제할 수 있다 */
function BlockSection() {
  const [list, setList] = useState<{ id: number; label: string; created_at: string }[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_blocks");
    setList((data ?? []) as { id: number; label: string; created_at: string }[]);
  }, []);
  useEffect(() => { load(); }, [load]);
  const unblock = async (id: number) => {
    const { error } = await supabase.rpc("unblock", { p_id: id });
    if (error) return toast.error(communityError(error.message));
    toast.success("차단을 해제했어요");
    load();
  };
  return (
    <Section title="차단 목록" desc="차단한 회원의 글·댓글·채팅이 보이지 않고, 나에게 알림이나 1:1 채팅을 보낼 수 없어요. 최대 300명.">
      {list === null ? <p className="text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="text-sm text-muted">차단한 회원이 없어요</p> : (
        <ul className="space-y-1.5">
          {list.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-md bg-panel2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{b.label}</span>
              <span className="text-xs text-muted">{fmtDate(b.created_at)}</span>
              <Button size="sm" variant="outline" onClick={() => unblock(b.id)}>해제</Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
