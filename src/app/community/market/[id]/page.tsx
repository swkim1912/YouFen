"use client";
// 커뮤니티 > 장터 글 상세: /community/market/123
// - 사진(대표 사진 먼저, 눌러서 넘겨 보기), 상품 정보 표, 상세 설명, 글쓴이 카드, '게시일 · 자동 정리 예정일'
// - 판매 글: '판매자와 채팅하기' / 구매 글: '제 물건 있어요'(첫 메시지를 보내며 1:1 채팅 시작). 이미 대화 중이면 '채팅 이어가기'.
// - 내 글: 거래 상태 바꾸기, 수정, 연장(2회까지, 만료 7일·3일 전부터), 삭제. 다른 회원 글: 신고·차단.
// - 관리자: 숨김/복구/삭제·작성자 확인(AdminContentTools)
// 데이터: market_get / market_view / market_set_trade / market_extend / market_delete / dm_start
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { ReportBlock } from "@/components/community/ReportBlock";
import { AdminContentTools } from "@/components/community/AdminContentTools";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import {
  BUY_TRADES, MARKET_DISCLAIMER, SELL_TRADES, type MarketDetail, boardImageUrl, communityError, priceText,
} from "@/lib/community";
import { fmtDate } from "@/lib/utils";

export default function MarketItemPage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Inner />
      </Suspense>
    </AppShell>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const listingId = Number(id);
  const router = useRouter();
  const [l, setL] = useState<MarketDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("market_get", { p_id: listingId });
    if (e) {
      setError(communityError(e.message));
      return setL(null);
    }
    setL(data as MarketDetail);
  }, [listingId]);

  useEffect(() => {
    if (!Number.isFinite(listingId)) return;
    load();
    try {
      const key = `viewed-market-${listingId}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        supabase.rpc("market_view", { p_id: listingId });
      }
    } catch {
      /* 저장소를 못 쓰면 조회수만 세지 않는다 */
    }
  }, [listingId, load]);

  if (!Number.isFinite(listingId)) return <p className="py-16 text-center text-muted">잘못된 주소입니다</p>;

  const startChat = async () => {
    if (!l) return;
    if (l.my_thread) return router.push(`/community/messages/${l.my_thread}`);
    setBusy(true);
    const first = l.kind === "buy" ? `제 물건 있어요! 「${l.title}」 관련해서 이야기 나눠요.` : null;
    const { data, error: e } = await supabase.rpc("dm_start", { p_listing: l.id, p_first: first });
    setBusy(false);
    if (e) return toast.error(communityError(e.message));
    router.push(`/community/messages/${data as number}`);
  };
  const setTrade = async (t: string) => {
    const { error: e } = await supabase.rpc("market_set_trade", { p_id: listingId, p_trade: t });
    if (e) return toast.error(communityError(e.message));
    toast.success(`'${t}'(으)로 바꿨어요`);
    load();
  };
  const extend = async () => {
    const { data, error: e } = await supabase.rpc("market_extend", { p_id: listingId });
    if (e) return toast.error(communityError(e.message));
    toast.success(`${fmtDate(data as string)}까지 연장했어요`);
    load();
  };
  const remove = async () => {
    setAskDelete(false);
    const { error: e } = await supabase.rpc("market_delete", { p_id: listingId });
    if (e) return toast.error(communityError(e.message));
    toast.success("장터 글을 삭제했어요");
    router.replace("/community/market");
  };

  return (
    <div className="space-y-4">
      <CommunityHeader active="market" />
      <Link href="/community/market" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} />장터 목록</Link>

      {l === undefined && <p className="py-16 text-center text-muted">불러오는 중…</p>}
      {l === null && <p className="py-16 text-center text-muted">{error ?? "글을 찾을 수 없어요"}</p>}
      {l?.blocked && <p className="py-16 text-center text-muted">차단한 회원의 글이에요. 차단은 마이 펜싱 &gt; 커뮤니티 설정에서 해제할 수 있어요.</p>}

      {l && !l.blocked && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* 사진 */}
          <div className="space-y-2">
            <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-panel2">
              {l.images.length > 0 ? (
                <a href={boardImageUrl(l.images[idx].path)} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={boardImageUrl(l.images[idx].path)} alt={`${l.title} 사진 ${idx + 1}`} className="h-full w-full object-contain" />
                </a>
              ) : (
                <div className="flex h-full items-center justify-center text-muted"><Package size={56} /></div>
              )}
              {l.images.length > 1 && (
                <>
                  <button aria-label="이전 사진" onClick={() => setIdx((i) => (i + l.images.length - 1) % l.images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1.5"><ChevronLeft size={18} /></button>
                  <button aria-label="다음 사진" onClick={() => setIdx((i) => (i + 1) % l.images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1.5"><ChevronRight size={18} /></button>
                  <span className="absolute bottom-2 right-2 rounded bg-background/70 px-1.5 text-xs">{idx + 1}/{l.images.length}</span>
                </>
              )}
            </div>
            {l.images.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto">
                {l.images.map((img, i) => (
                  <button key={img.id} onClick={() => setIdx(i)} className={`shrink-0 overflow-hidden rounded border-2 ${i === idx ? "border-brand" : "border-transparent"}`} aria-label={`사진 ${i + 1}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={boardImageUrl(img.thumb)} alt="" width={56} height={56} className="h-14 w-14 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 정보 */}
          <div className="space-y-3">
            {l.status !== "active" && (
              <p className="rounded-md bg-loss/10 px-3 py-2 text-xs text-loss">
                {l.status === "expired" ? "노출 기간이 끝나 다른 회원에게 보이지 않아요. 연장하면 다시 보여요(만료 후 30일이 지나면 삭제돼요)." : "신고가 쌓여 가려진 글이에요. 운영자가 확인한 뒤 복구하거나 삭제해요."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${l.kind === "sell" ? "bg-brand text-brand-ink" : "bg-pending text-background"}`}>{l.kind === "sell" ? "팝니다" : "삽니다"}</span>
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5">{l.trade_status}</span>
              <span className="text-muted">{l.category}{l.weapon ? ` · ${l.weapon}` : ""}</span>
            </div>
            <h2 className="text-xl font-bold leading-snug">{l.title}</h2>
            <p className="text-2xl font-bold">{priceText(l)}</p>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              {l.kind === "sell" && <Info k="사용 기간" v={l.usage_period} />}
              <Info k={l.kind === "sell" ? "상품 상태" : "원하는 상태"} v={l.condition} />
              {l.hand && <Info k="좌·우손" v={l.hand} />}
              {l.size && <Info k="사이즈" v={l.size} />}
              <Info k="거래 지역" v={l.regions} />
              <Info k="택배 거래" v={l.delivery ? "가능" : "불가"} />
            </dl>

            <div className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
              <CommunityCardView card={l.card} size={30} className="text-sm" />
              {!l.is_mine && l.card.kind !== "gone" && (
                <ReportBlock kind="listing" refId={String(l.id)} label={l.card.nickname ?? "이 회원"} what="장터 글" onBlocked={() => router.replace("/community/market")} />
              )}
            </div>
            <p className="text-xs text-muted">
              게시일 {fmtDate(l.created_at)}{l.edited && " (수정됨)"} · 자동 정리 예정일 {fmtDate(l.expires_at)} · 조회 {l.view_count}
            </p>

            {l.is_mine ? (
              <div className="space-y-2 rounded-md bg-panel2 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">거래 상태</span>
                  <Select className="h-9 w-32" value={l.trade_status} onChange={(e) => setTrade(e.target.value)}>
                    {(l.kind === "sell" ? SELL_TRADES : BUY_TRADES).map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {l.status === "active" && <Link href={`/community/market/write?edit=${l.id}`}><Button size="sm" variant="outline">수정</Button></Link>}
                  <Button size="sm" variant="outline" disabled={l.extend_count >= 2} onClick={extend}>연장 ({l.extend_count}/2)</Button>
                  <Button size="sm" variant="danger" onClick={() => setAskDelete(true)}>삭제</Button>
                </div>
                <p className="text-[11px] text-muted">연장은 만료 {l.kind === "sell" ? "7일" : "3일"} 전부터 할 수 있고, 한 번에 {l.kind === "sell" ? "6개월" : "30일"}씩 늘어나요. 문의는 1:1 채팅 목록에서 볼 수 있어요.</p>
              </div>
            ) : l.status === "active" && (
              l.eligible ? (
                <Button className="w-full" disabled={busy} onClick={startChat}>
                  <MessageCircle size={16} />{l.my_thread ? "채팅 이어가기" : l.kind === "sell" ? "판매자와 채팅하기" : "제 물건 있어요"}
                </Button>
              ) : (
                <p className="rounded-md bg-panel2 px-3 py-2 text-xs text-muted">1:1 채팅은 선수를 연결한 회원만 할 수 있어요. <Link href="/?tab=detail" className="text-brand">선수 연결하기</Link></p>
              )
            )}
            {l.is_admin && <AdminContentTools kind="listing" refId={String(l.id)} status={l.status === "expired" ? "active" : l.status} onChanged={load} />}
          </div>

          <section className="space-y-2 md:col-span-2">
            <h3 className="text-sm font-bold">상세 설명</h3>
            <div className="min-h-[60px] whitespace-pre-wrap break-words rounded-lg border border-line bg-panel p-4 text-[15px] leading-relaxed">{l.body || <span className="text-muted">설명이 없어요</span>}</div>
            <p className="text-[11px] text-muted">{MARKET_DISCLAIMER} 연락은 1:1 채팅을 이용하고, 전화번호·계좌번호를 공개 글에 쓰지 마세요.</p>
          </section>
          <Confirm open={askDelete} message="이 장터 글을 삭제할까요? 삭제한 글은 되돌릴 수 없어요." okText="삭제" onOk={remove} onCancel={() => setAskDelete(false)} />
        </div>
      )}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="rounded-md bg-panel2 px-3 py-2">
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="truncate">{v || "-"}</dd>
    </div>
  );
}
