"use client";
// 커뮤니티 > 장터 글쓰기: /community/market/write?kind=sell|buy , 수정은 ?edit=123 (판매/구매 종류는 바꿀 수 없음)
// 판매 글: 사진 10장(첫 장 = 대표 사진, 사진을 누르면 대표로), 물품명, 카테고리, 종목, 가격(0원 = 나눔), 사용 기간, 상품 상태,
//          손·사이즈(카테고리에 따라), 거래 지역, 택배, 상세 설명
// 구매 글: 찾는 물품명, 카테고리, 희망 가격대(최소~최대 또는 가격 협의) 필수 + 종목, 손, 사이즈, 허용 상태, 지역, 택배, 설명, 사진 1장
// 저장: market_write / market_edit RPC (자격·정지·도배·입력값은 DB 가 다시 검사). 사진은 lib/communityUpload(kind=market).
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ImagePlus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { uploadCommunityImage } from "@/lib/communityUpload";
import {
  BUY_CONDITIONS, HANDS, MARKET_CATEGORIES, MARKET_DISCLAIMER, MARKET_IMAGE_MAX, MARKET_WEAPONS, SELL_CONDITIONS, USAGE_PERIODS,
  type BoardImage, type CommunityCard, type MarketDetail, boardImageUrl, communityError, fetchMyCommunity, hasPhoneNumber, needsHand, needsSize,
} from "@/lib/community";
import { cn } from "@/lib/utils";

export default function MarketWritePage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Write />
      </Suspense>
    </AppShell>
  );
}

/** 숫자만 남긴 가격 문자열(쉼표 등 제거) */
const digits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 9);

function Write() {
  const sp = useSearchParams();
  const editId = Number(sp.get("edit")) || null;
  const router = useRouter();
  const [kind, setKind] = useState<"sell" | "buy">(sp.get("kind") === "buy" ? "buy" : "sell");
  const [loaded, setLoaded] = useState(!editId);
  const [f, setF] = useState({
    title: "", category: "", weapon: "", price: "", price_min: "", price_max: "", price_nego: false,
    usage_period: "", condition: "", hand: "", size: "", regions: "", delivery: false, body: "",
  });
  const [images, setImages] = useState<BoardImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [face, setFace] = useState<CommunityCard | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null); // 쓸 수 없는 이유(자격·정지)
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }));

  useEffect(() => {
    fetchMyCommunity().then((m) => setFace(m?.card ?? null));
    supabase.rpc("market_status").then(({ data }) => {
      const s = data as { eligible: boolean; banned: boolean } | null;
      if (s && !s.eligible) setBlocked("장터 글쓰기는 선수를 연결한 회원(학부모·지도자 포함)만 할 수 있어요. 마이 펜싱 > 상세정보에서 선수를 연결해 주세요.");
      else if (s?.banned) setBlocked("커뮤니티 이용이 제한되어 장터 글을 쓸 수 없어요.");
    });
    if (!editId) return;
    supabase.rpc("market_get", { p_id: editId }).then(({ data, error }) => {
      const l = data as MarketDetail | null;
      if (error || !l || l.blocked || !l.is_mine) {
        toast.error(error ? communityError(error.message) : "내가 쓴 글만 고칠 수 있어요");
        return router.replace("/community/market");
      }
      setKind(l.kind);
      setF({
        title: l.title, category: l.category, weapon: l.weapon ?? "", price: l.price != null ? String(l.price) : "",
        price_min: l.price_min != null ? String(l.price_min) : "", price_max: l.price_max != null ? String(l.price_max) : "", price_nego: l.price_nego,
        usage_period: l.usage_period ?? "", condition: l.condition ?? "", hand: l.hand ?? "", size: l.size ?? "", regions: l.regions ?? "",
        delivery: l.delivery, body: l.body,
      });
      setImages(l.images);
      setFace(l.card);
      setLoaded(true);
    });
  }, [editId, router]);

  const maxImages = MARKET_IMAGE_MAX[kind];
  const pick = async (fileList: FileList | null) => {
    // 고른 파일을 먼저 배열로 복사한다. FileList 는 입력칸과 연결돼 있어 value 를 비우면 목록도 같이 비어 버린다
    const files = Array.from(fileList ?? []);
    if (fileRef.current) fileRef.current.value = ""; // 같은 사진을 다시 고를 수 있게 입력칸 비우기
    if (!files.length) return;
    const room = maxImages - images.length;
    if (files.length > room) toast.error(`사진은 ${maxImages}장까지 올릴 수 있어요`);
    setUploading(true);
    for (const file of files.slice(0, room)) {
      const r = await uploadCommunityImage(file, "market");
      if ("error" in r) { toast.error(r.error); break; }
      setImages((cur) => [...cur, r]);
    }
    setUploading(false);
  };
  // 누른 사진을 맨 앞(대표 사진)으로
  const makeCover = (id: number) => setImages((cur) => [...cur.filter((x) => x.id === id), ...cur.filter((x) => x.id !== id)]);

  const submit = async () => {
    if (!f.title.trim()) return toast.error("물품명을 입력해 주세요");
    if (!f.category) return toast.error("카테고리를 골라 주세요");
    if (kind === "sell" && f.price === "") return toast.error("가격을 입력해 주세요(나눔은 0원)");
    if (kind === "buy" && !f.price_nego && (f.price_min === "" || f.price_max === "")) return toast.error("희망 가격대를 입력하거나 '가격 협의'를 골라 주세요");
    if (hasPhoneNumber(`${f.title} ${f.body} ${f.regions}`) && !window.confirm("전화번호처럼 보이는 내용이 있어요. 연락은 1:1 채팅으로 하는 게 안전해요. 그대로 올릴까요?")) return;
    // 카테고리에 맞지 않는 손·사이즈는 비워서 보낸다
    const data = { ...f, hand: needsHand(f.category) ? f.hand : "", size: needsSize(f.category) ? f.size : "" };
    setBusy(true);
    const ids = images.map((i) => i.id);
    const { data: res, error } = editId
      ? await supabase.rpc("market_edit", { p_id: editId, p_data: data, p_uploads: ids })
      : await supabase.rpc("market_write", { p_kind: kind, p_data: data, p_uploads: ids });
    setBusy(false);
    if (error) return toast.error(communityError(error.message));
    toast.success(editId ? "장터 글을 고쳤어요" : "장터 글을 올렸어요");
    router.replace(`/community/market/${editId ?? (res as number)}`);
  };

  if (!loaded) return <p className="py-16 text-center text-muted">불러오는 중…</p>;
  const sell = kind === "sell";

  return (
    <div className="space-y-4">
      <CommunityHeader active="market" />
      <div className="space-y-4 rounded-lg border border-line bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-bold">{editId ? "장터 글 수정" : sell ? "판매글 올리기" : "구매글 올리기"}</h2>
          {!editId && (
            <div className="flex gap-1">
              {(["sell", "buy"] as const).map((k) => (
                <button aria-pressed={kind === k} key={k} type="button" onClick={() => { setKind(k); setImages((cur) => cur.slice(0, MARKET_IMAGE_MAX[k])); }}
                  className={cn("rounded px-3 py-1 text-sm", kind === k ? "bg-brand font-semibold text-brand-ink" : "bg-panel2 text-muted")}>
                  {k === "sell" ? "팝니다" : "삽니다"}
                </button>
              ))}
            </div>
          )}
        </div>
        {blocked && <p className="rounded-md bg-loss/10 px-3 py-2 text-xs text-loss">{blocked}</p>}
        <p className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-xs">{MARKET_DISCLAIMER}</p>

        {/* 사진 */}
        <div className="space-y-2">
          <Label>사진 ({images.length}/{maxImages}){sell && " · 사진을 누르면 대표 사진이 돼요"}</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={img.id} className="relative">
                <button type="button" onClick={() => makeCover(img.id)} aria-label={i === 0 ? "대표 사진" : "대표 사진으로"} className={cn("block overflow-hidden rounded-md border-2", i === 0 ? "border-brand" : "border-transparent")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={boardImageUrl(img.thumb)} alt="" width={84} height={84} className="h-21 w-21 object-cover" />
                </button>
                {i === 0 && sell && <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-brand px-1 text-[10px] font-semibold text-brand-ink"><Star size={9} />대표</span>}
                <button type="button" onClick={() => setImages((cur) => cur.filter((x) => x.id !== img.id))} aria-label="사진 빼기"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background shadow ring-1 ring-line"><X size={12} /></button>
              </div>
            ))}
            {images.length < maxImages && (
              <button type="button" disabled={uploading || !!blocked} onClick={() => fileRef.current?.click()}
                className="flex h-21 w-21 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-xs text-muted hover:text-foreground disabled:opacity-50">
                <ImagePlus size={20} />{uploading ? "올리는 중…" : "사진 추가"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={sell} className="hidden" onChange={(e) => pick(e.target.files)} />
          </div>
          <p className="text-[11px] text-muted">사진 속 촬영 위치 정보는 지워져요. {sell ? "실제 상품 사진을 올려 주세요." : "찾는 물건의 예시 사진 1장을 올릴 수 있어요."}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{sell ? "물품명" : "찾는 물품명"}</Label>
            <Input value={f.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder={sell ? "예: FIE 800N 에페 마스크 M" : "예: 오른손 피스톨 그립 장갑 8호"} />
          </div>
          <div>
            <Label>카테고리</Label>
            <Select value={f.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">골라 주세요</option>
              {MARKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <Label>종목{sell ? "" : " (선택)"}</Label>
            <Select value={f.weapon} onChange={(e) => set({ weapon: e.target.value })}>
              <option value="">선택 안 함</option>
              {MARKET_WEAPONS.map((w) => <option key={w}>{w}</option>)}
            </Select>
          </div>

          {sell ? (
            <div>
              <Label>가격 (원 · 0원 = 나눔)</Label>
              <Input inputMode="numeric" value={f.price} onChange={(e) => set({ price: digits(e.target.value) })} placeholder="예: 180000" />
              {f.price !== "" && <p className="mt-1 text-[11px] text-muted">{Number(f.price) === 0 ? "나눔으로 올라가요" : `${Number(f.price).toLocaleString("ko-KR")}원`}</p>}
            </div>
          ) : (
            <div>
              <Label>희망 가격대 (원)</Label>
              <div className="flex items-center gap-1.5">
                <Input aria-label="희망 가격 최저 (원)" inputMode="numeric" disabled={f.price_nego} value={f.price_min} onChange={(e) => set({ price_min: digits(e.target.value) })} placeholder="최소" />
                <span className="text-muted">~</span>
                <Input aria-label="희망 가격 최고 (원)" inputMode="numeric" disabled={f.price_nego} value={f.price_max} onChange={(e) => set({ price_max: digits(e.target.value) })} placeholder="최대" />
              </div>
              <label className="mt-1.5 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={f.price_nego} onChange={(e) => set({ price_nego: e.target.checked })} />가격 협의</label>
            </div>
          )}
          {sell && (
            <div>
              <Label>사용 기간</Label>
              <Select value={f.usage_period} onChange={(e) => set({ usage_period: e.target.value })}>
                <option value="">선택 안 함</option>
                {USAGE_PERIODS.map((u) => <option key={u}>{u}</option>)}
              </Select>
            </div>
          )}
          <div>
            <Label>{sell ? "상품 상태" : "원하는 상태 (선택)"}</Label>
            <Select value={f.condition} onChange={(e) => set({ condition: e.target.value })}>
              <option value="">선택 안 함</option>
              {(sell ? SELL_CONDITIONS : BUY_CONDITIONS).map((c) => <option key={c}>{c}</option>)}
            </Select>
          </div>
          {needsHand(f.category) && (
            <div>
              <Label>좌·우손</Label>
              <Select value={f.hand} onChange={(e) => set({ hand: e.target.value })}>
                <option value="">선택 안 함</option>
                {HANDS.map((h) => <option key={h}>{h}</option>)}
              </Select>
            </div>
          )}
          {needsSize(f.category) && (
            <div>
              <Label>사이즈</Label>
              <Input value={f.size} maxLength={20} onChange={(e) => set({ size: e.target.value })} placeholder="예: M, 38, 8호, 260" />
            </div>
          )}
          <div>
            <Label>거래 가능 지역{sell ? "" : " (선택)"}</Label>
            <Input value={f.regions} maxLength={60} onChange={(e) => set({ regions: e.target.value })} placeholder="예: 서울 마포, 경기 수원" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={f.delivery} onChange={(e) => set({ delivery: e.target.checked })} />택배 거래 가능</label>
          </div>
          <div className="sm:col-span-2">
            <Label>상세 설명{sell ? "" : " (선택)"}</Label>
            <Textarea value={f.body} maxLength={3000} onChange={(e) => set({ body: e.target.value })} className="min-h-[140px]"
              placeholder={sell ? "사용감, 하자, 구성품, 거래 방법 등을 적어 주세요. 연락처는 쓰지 말고 1:1 채팅을 이용해 주세요." : "찾는 조건을 자세히 적어 주세요."} />
            <p className="mt-1 text-right text-[11px] text-muted">{f.body.length}/3000</p>
          </div>
        </div>

        {face && (
          <div className="flex items-center gap-2 rounded-md bg-panel2 px-3 py-2 text-xs text-muted">
            <span>이렇게 보여요</span><CommunityCardView card={face} size={22} link={false} className="text-sm text-foreground" />
            <span className="ml-auto">{sell ? "6개월" : "30일"} 동안 보이고 2번까지 연장할 수 있어요</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>취소</Button>
          <Button disabled={busy || uploading || !!blocked} onClick={submit}>{editId ? "수정 완료" : "올리기"}</Button>
        </div>
      </div>
    </div>
  );
}
