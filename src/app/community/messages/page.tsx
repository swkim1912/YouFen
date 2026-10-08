"use client";
// 커뮤니티 > 1:1 채팅 목록 (장터 거래용, docs/COMMUNITY.md 3장)
// 대화방 = 장터 글 하나 × 문의자 한 명. 상대 카드·장터 글 제목/사진·마지막 메시지·안 읽음 점을 보여 준다.
// 화면이 열려 있는 동안 30초마다 다시 읽는다(실시간 연결 대신 — Realtime 동시 접속 한도 절약). 메시지는 1달 보관.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { supabase } from "@/lib/supabase";
import { type DmThreadItem, boardImageUrl, communityError, timeAgo } from "@/lib/community";
import { cn } from "@/lib/utils";

export default function MessagesPage() {
  return (
    <AppShell requireAuth>
      <Inbox />
    </AppShell>
  );
}

function Inbox() {
  const [list, setList] = useState<DmThreadItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("dm_list");
    if (e) return setError(communityError(e.message));
    setList((data ?? []) as DmThreadItem[]);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <CommunityHeader active="dm" />
      <p className="text-xs text-muted">장터 글에서 시작한 1:1 채팅이에요. 메시지는 1달 동안 보관돼요. 전화번호·계좌번호를 주고받을 때는 상대를 충분히 확인해 주세요.</p>
      {error && <p className="py-8 text-center text-sm text-loss">{error}</p>}
      {!error && list === null && <p className="py-16 text-center text-muted">불러오는 중…</p>}
      {list && list.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">아직 대화가 없어요. <Link href="/community/market" className="text-brand">장터</Link>에서 글을 보고 채팅을 시작해 보세요.</p>
      )}
      {list && list.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/community/messages/${t.id}`} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]", t.unread && "bg-brand/[0.04]")}>
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-panel2">
                  {t.listing_thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={boardImageUrl(t.listing_thumb)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted"><Package size={20} /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <CommunityCardView card={t.other} size={18} link={false} className="text-sm" />
                    <span className="shrink-0 rounded bg-white/[0.06] px-1.5 text-[10px] text-muted">{t.i_am_seller ? "내 글" : "문의"}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(t.last_message_at)}</span>
                  </div>
                  <p className="truncate text-xs text-muted">「{t.listing_title}」{t.trade_status ? ` · ${t.trade_status}` : " · 삭제된 글"}</p>
                  <p className={cn("truncate text-sm", t.unread ? "font-semibold text-foreground" : "text-muted")}>
                    {t.last ? `${t.last.mine ? "나: " : ""}${t.last.body || (t.last.image ? "사진" : "")}` : "아직 메시지가 없어요"}
                  </p>
                </div>
                {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-loss" aria-label="안 읽음" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
