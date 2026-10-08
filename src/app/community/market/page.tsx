"use client";
// 커뮤니티 > 장터 목록 (docs/COMMUNITY.md 3장)
// 탭: 전체 / 팝니다 / 삽니다 / 내 장터 글(만료·가려진 글 포함), 필터: 카테고리·종목(공용 포함)·거래 전/거래 완료, 검색(물품명·설명).
// 조건은 주소(?k=&cat=&w=&t=&q=)에 남긴다. 둘러보기는 로그인 회원 누구나, 글쓰기·채팅은 선수를 연결한 회원만(market_status).
// 상단에 면책 문구를 항상 보여 준다.
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package, Search, Truck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import {
  MARKET_CATEGORIES, MARKET_DISCLAIMER, MARKET_WEAPONS, type MarketItem, boardImageUrl, communityError, priceText, timeAgo,
} from "@/lib/community";
import { cn } from "@/lib/utils";

type K = "all" | "sell" | "buy" | "mine";
const KINDS: [K, string][] = [["all", "전체"], ["sell", "팝니다"], ["buy", "삽니다"], ["mine", "내 장터 글"]];

export default function MarketPage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Market />
      </Suspense>
    </AppShell>
  );
}

function Market() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const k = (KINDS.some(([x]) => x === sp.get("k")) ? sp.get("k") : "all") as K;
  const cat = (MARKET_CATEGORIES as readonly string[]).includes(sp.get("cat") ?? "") ? sp.get("cat") : null;
  const weapon = (MARKET_WEAPONS as readonly string[]).includes(sp.get("w") ?? "") ? sp.get("w") : null;
  const trade = sp.get("t") === "open" || sp.get("t") === "done" ? sp.get("t") : null;
  const q = sp.get("q") ?? "";

  const [qInput, setQInput] = useState(q);
  const [items, setItems] = useState<MarketItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.rpc("market_status").then(({ data }) => setEligible(!!(data as { eligible?: boolean } | null)?.eligible));
  }, []);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [key, v] of Object.entries(patch)) {
      if (v) next.set(key, v);
      else next.delete(key);
    }
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };

  const load = useCallback(async (offset: number) => {
    setError(null);
    const { data, error: e } = await supabase.rpc("market_list", {
      p_kind: k === "sell" || k === "buy" ? k : null, p_category: cat, p_weapon: weapon, p_trade: trade,
      p_q: q || null, p_mine: k === "mine", p_offset: offset, p_limit: 24,
    });
    if (e) return setError(communityError(e.message));
    const r = data as { items: MarketItem[]; has_more: boolean };
    setItems((prev) => (offset === 0 ? r.items : [...(prev ?? []), ...r.items]));
    setHasMore(r.has_more);
  }, [k, cat, weapon, trade, q]);

  useEffect(() => {
    setItems(null);
    load(0);
  }, [load]);

  return (
    <div className="space-y-4">
      <CommunityHeader active="market" />
      <p className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-xs leading-relaxed">{MARKET_DISCLAIMER}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {KINDS.map(([key, label]) => (
            <button key={key} onClick={() => setParams({ k: key === "all" ? null : key })}
              className={cn("shrink-0 rounded px-3 py-1.5 text-sm", k === key ? "bg-brand font-semibold text-brand-ink" : "bg-panel text-muted hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        {eligible && (
          <div className="ml-auto flex gap-2">
            <Link href="/community/market/write?kind=sell"><Button size="sm">판매글 올리기</Button></Link>
            <Link href="/community/market/write?kind=buy"><Button size="sm" variant="outline">구매글 올리기</Button></Link>
          </div>
        )}
      </div>
      {eligible === false && (
        <p className="text-xs text-muted">
          장터 글쓰기와 1:1 채팅은 선수를 연결한 회원(학부모·지도자 포함)만 할 수 있어요. <Link href="/?tab=detail" className="text-brand">선수 연결하기</Link>
        </p>
      )}

      <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setParams({ cat: null })} className={cn("rounded-full border px-2.5 py-1 text-xs", !cat ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-foreground")}>전체 장비</button>
          {MARKET_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setParams({ cat: cat === c ? null : c })}
              className={cn("rounded-full border px-2.5 py-1 text-xs", cat === c ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-foreground")}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select className="h-9 w-28" value={weapon ?? ""} onChange={(e) => setParams({ w: e.target.value || null })} aria-label="종목">
            <option value="">모든 종목</option>
            {MARKET_WEAPONS.filter((w) => w !== "공용").map((w) => <option key={w} value={w}>{w}</option>)}
          </Select>
          <Select className="h-9 w-32" value={trade ?? ""} onChange={(e) => setParams({ t: e.target.value || null })} aria-label="거래 상태">
            <option value="">모든 상태</option>
            <option value="open">거래 전만 보기</option>
            <option value="done">거래 완료</option>
          </Select>
          <form onSubmit={(e) => { e.preventDefault(); setParams({ q: qInput.trim() || null }); }} className="flex min-w-[200px] flex-1 gap-2">
            <Input className="h-9" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="물품명·설명 검색" maxLength={50} />
            <Button type="submit" size="sm" variant="outline" className="h-9 shrink-0" aria-label="검색"><Search size={15} /></Button>
          </form>
        </div>
      </div>

      {error && <p className="py-8 text-center text-sm text-loss">{error}</p>}
      {!error && items === null && <p className="py-16 text-center text-muted">불러오는 중…</p>}
      {items && items.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">{k === "mine" ? "아직 올린 장터 글이 없어요" : "조건에 맞는 글이 없어요"}</p>
      )}
      {items && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((l) => <Card key={l.id} l={l} />)}
        </ul>
      )}
      {hasMore && (
        <div className="text-center"><Button variant="outline" size="sm" onClick={() => load(items?.length ?? 0)}>더 보기</Button></div>
      )}
    </div>
  );
}

/** 장터 카드: 대표 사진(없으면 상자 아이콘) · [팝니다/삽니다] 거래 상태 · 물품명 · 가격 · 지역·택배 */
function Card({ l }: { l: MarketItem }) {
  const done = l.trade_status === "거래완료" || l.trade_status === "구했어요";
  return (
    <li>
      <Link href={`/community/market/${l.id}`} className="block overflow-hidden rounded-lg border border-line bg-panel hover:border-brand/40">
        <div className="relative aspect-square bg-panel2">
          {l.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={boardImageUrl(l.thumb)} alt="" loading="lazy" className={cn("h-full w-full object-cover", done && "opacity-50")} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted"><Package size={36} /></div>
          )}
          <span className={cn("absolute left-2 top-2 rounded px-1.5 py-0.5 text-[11px] font-semibold", l.kind === "sell" ? "bg-brand text-brand-ink" : "bg-pending text-background")}>
            {l.kind === "sell" ? "팝니다" : "삽니다"}
          </span>
          {l.status !== "active" && (
            <span className="absolute right-2 top-2 rounded bg-loss px-1.5 py-0.5 text-[11px] font-semibold text-white">{l.status === "expired" ? "기간 만료" : "가려짐"}</span>
          )}
        </div>
        <div className="space-y-1 p-2.5">
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <span className={cn(done ? "text-muted" : l.trade_status === "예약중" ? "text-pending" : "text-win")}>{l.trade_status}</span>
            <span>· {l.category}{l.weapon ? ` · ${l.weapon}` : ""}</span>
          </div>
          <p className="truncate text-sm font-semibold">{l.title}</p>
          <p className="text-sm font-bold">{priceText(l)}</p>
          <p className="flex items-center gap-1 truncate text-[11px] text-muted">
            {l.regions ?? "지역 미정"}{l.delivery && <><Truck size={11} className="ml-1 shrink-0" />택배</>}
          </p>
          <div className="flex items-center justify-between gap-1 pt-0.5 text-[11px] text-muted">
            <CommunityCardView card={l.card} size={16} link={false} className="min-w-0 text-[11px]" />
            <span className="shrink-0">{timeAgo(l.created_at)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
