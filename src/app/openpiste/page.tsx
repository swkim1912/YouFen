"use client";
// 오픈피스트 목록 (docs/COMMUNITY.md 5장): 함께 운동(오픈게임·레슨 등)할 사람을 모으는 모집글.
// 탭: 전체 / 에페 / 플뢰레 / 사브르 (기본 = 가입 때 고른 종목) + 내 오픈피스트(내가 연 모집·신청한 모집, 지난 것 포함)
// 빠른 필터: 이번 주(앞으로 7일 안에 시작), 지역. 조건은 주소(?w=&wk=1&r=&mine=1)에 남긴다.
// 목록에는 승인되어 모집 중인 글만(마감·취소·종료는 빠짐). 모집글 쓰기는 선수 연결 회원만(op_status.eligible).
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, CalendarDays, MapPin, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { boardImageUrl } from "@/lib/community";
import { OP_WEAPONS, type OpItem, durationText, feeText, opDateText, opError, statusText } from "@/lib/openpiste";
import { REGIONS, cn } from "@/lib/utils";

export default function OpenPistePage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <List />
      </Suspense>
    </AppShell>
  );
}

interface OpStatusInfo { eligible: boolean; banned: boolean; weapon: string | null; is_admin: boolean }

function List() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [status, setStatus] = useState<OpStatusInfo | null>(null);
  const [items, setItems] = useState<OpItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("op_status").then(({ data }) => setStatus((data as OpStatusInfo | null) ?? { eligible: false, banned: false, weapon: null, is_admin: false }));
  }, []);

  const mine = sp.get("mine") === "1";
  const wParam = sp.get("w");
  // 종목 탭: 주소에 있으면 그것('all' = 전체), 없으면 가입 때 고른 종목
  const weapon = wParam === "all" ? null
    : (OP_WEAPONS as readonly string[]).includes(wParam ?? "") ? wParam
    : status && (OP_WEAPONS as readonly string[]).includes(status.weapon ?? "") ? status.weapon : null;
  const week = sp.get("wk") === "1";
  const region = (REGIONS as readonly string[]).includes(sp.get("r") ?? "") ? sp.get("r") : null;

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [key, v] of Object.entries(patch)) {
      if (v) next.set(key, v);
      else next.delete(key);
    }
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };

  const ready = status !== null; // 기본 종목을 알아야 첫 목록을 부를 수 있다
  const load = useCallback(async (offset: number) => {
    setError(null);
    const { data, error: e } = await supabase.rpc("op_list", {
      p_weapon: mine ? null : weapon, p_week: !mine && week, p_region: mine ? null : region, p_mine: mine, p_offset: offset, p_limit: 30,
    });
    if (e) return setError(opError(e.message));
    const r = data as { items: OpItem[]; has_more: boolean };
    setItems((prev) => (offset === 0 ? r.items : [...(prev ?? []), ...r.items]));
    setHasMore(r.has_more);
  }, [mine, weapon, week, region]);

  useEffect(() => {
    if (!ready) return;
    setItems(null);
    load(0);
  }, [ready, load]);

  const tabCls = (on: boolean) => cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm", on ? "border-brand font-bold" : "border-transparent text-muted hover:text-foreground");
  const chip = (on: boolean) => cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-foreground");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">오픈피스트</h1>
          <p className="text-xs text-muted">함께 운동할 펜서를 모아요. 모집글은 관리자 확인 후 게시돼요.</p>
        </div>
        <Link href="/?tab=community" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"><Bell size={13} />새 모집 알림 설정</Link>
        {status?.eligible && !status.banned && <Link href="/openpiste/write"><Button size="sm">모집하기</Button></Link>}
      </div>
      {status && !status.eligible && (
        <p className="text-xs text-muted">모집글은 선수를 연결한 회원(학부모·지도자 포함)만 쓸 수 있어요. 참가 신청은 누구나 할 수 있어요. <Link href="/?tab=detail" className="text-brand">선수 연결하기</Link></p>
      )}
      {status?.banned && <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs">커뮤니티 이용이 제한된 상태라 모집·신청을 할 수 없어요. <Link href="/?tab=community" className="text-brand">사유 보기</Link></p>}

      <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button className={tabCls(!mine && weapon === null)} onClick={() => setParams({ w: "all", mine: null })}>전체</button>
        {OP_WEAPONS.map((w) => <button key={w} className={tabCls(!mine && weapon === w)} onClick={() => setParams({ w, mine: null })}>{w}</button>)}
        <button className={tabCls(mine)} onClick={() => setParams({ mine: "1" })}>내 오픈피스트</button>
      </nav>

      {!mine && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={chip(week)} onClick={() => setParams({ wk: week ? null : "1" })}>이번 주(7일 안)</button>
          <Select className="h-8 w-28 text-xs" value={region ?? ""} onChange={(e) => setParams({ r: e.target.value || null })} aria-label="지역">
            <option value="">모든 지역</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
      )}

      {error && <p className="py-8 text-center text-sm text-loss">{error}</p>}
      {!error && items === null && <p className="py-16 text-center text-muted">불러오는 중…</p>}
      {items && items.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">{mine ? "아직 열거나 신청한 모집이 없어요" : "조건에 맞는 모집이 없어요"}</p>
      )}
      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((p) => <Row key={p.id} p={p} />)}
        </ul>
      )}
      {hasMore && <div className="text-center"><Button variant="outline" size="sm" onClick={() => load(items?.length ?? 0)}>더 보기</Button></div>}
    </div>
  );
}

/** 목록 한 줄: 날짜 칸 · [종목][상태] 제목 · 장소·지역 · 레벨·시간·참가비 · 신청 인원 · 주최자 · 대표 사진(있으면, 아주 좁은 화면에선 숨김) */
function Row({ p }: { p: OpItem }) {
  const d = new Date(p.starts_at);
  const st = statusText(p);
  const recruiting = st === "모집 중";
  return (
    <li>
      <Link href={`/openpiste/${p.id}`} className={cn("flex gap-3 rounded-lg border border-line bg-panel p-3 hover:border-brand/40", !recruiting && "opacity-80")}>
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-md bg-panel2 py-1.5 text-center">
          <span className="text-[11px] text-muted">{d.getMonth() + 1}월</span>
          <span className="text-xl font-bold leading-tight">{d.getDate()}</span>
          <span className="text-[11px] text-muted">{"일월화수목금토"[d.getDay()]}요일</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded bg-brand/15 px-1.5 py-0.5 font-semibold text-brand">{p.weapon}</span>
            <span className={cn("rounded px-1.5 py-0.5 font-semibold", recruiting ? "bg-win/15 text-win" : "bg-white/[0.06] text-muted")}>{st}</span>
            {p.is_mine && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-muted">내 모집</span>}
            {p.joined && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-muted">신청함</span>}
            {p.has_pending_edit && <span className="rounded bg-pending/15 px-1.5 py-0.5 text-pending">수정 승인 대기</span>}
          </div>
          <p className="truncate font-semibold">{p.title}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{opDateText(p.starts_at)} · {durationText(p.duration_h)}</span>
            <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={12} className="shrink-0" /><span className="truncate">{p.region} · {p.place}</span></span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted">{p.levels.join("·")}</span>
            <span className="text-muted">{feeText(p.fee)}</span>
            <span className={cn("inline-flex items-center gap-1", p.count >= p.capacity ? "text-loss" : "text-foreground")}><Users size={12} />{p.count}/{p.capacity}명</span>
            <span className="ml-auto"><CommunityCardView card={p.host} size={18} link={false} className="text-xs" /></span>
          </div>
        </div>
        {/* 대표 사진(첫 장) */}
        {p.thumb && (
          <div className="relative hidden h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-md bg-panel2 min-[420px]:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={boardImageUrl(p.thumb)} alt="" loading="lazy" className="h-full w-full object-cover" />
            {p.image_count > 1 && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">+{p.image_count - 1}</span>}
          </div>
        )}
      </Link>
    </li>
  );
}
