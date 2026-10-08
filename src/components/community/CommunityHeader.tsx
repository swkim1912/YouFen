"use client";
// 커뮤니티 공용 머리: 제목 + 하위 메뉴(게시판 / 자유톡방 / 장터 / 1:1 채팅) (docs/COMMUNITY.md 8장).
// 1:1 채팅은 장터 거래용(장터 글에서 시작). 안 읽은 대화가 있으면 점을 띄운다(목록을 열 때 한 번 확인).
// 커뮤니티 이용이 제한된 회원에게는 사유·기간을 짧게 알린다(자세한 내용은 마이 펜싱 > 커뮤니티 설정).
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CommunityStatus } from "@/lib/community";
import { cn } from "@/lib/utils";

const MENUS = [
  { key: "board", label: "게시판", href: "/community", ready: true },
  { key: "chat", label: "자유톡방", href: "/community/chat", ready: true },
  { key: "market", label: "장터", href: "/community/market", ready: true },
  { key: "dm", label: "1:1 채팅", href: "/community/messages", ready: true },
] as const;

export function CommunityHeader({ active = "board" }: { active?: (typeof MENUS)[number]["key"] }) {
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [unreadDm, setUnreadDm] = useState(false);
  useEffect(() => {
    supabase.rpc("my_community_status").then(({ data }) => setStatus((data as CommunityStatus | null) ?? null));
    supabase.rpc("dm_list").then(({ data }) => setUnreadDm(((data ?? []) as { unread: boolean }[]).some((t) => t.unread)));
  }, []);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-4 border-b border-line">
        <h1 className="pb-2 text-lg font-bold">커뮤니티</h1>
        {/* 좁은 화면에서는 옆으로 밀어서 본다. 스크롤 막대는 숨기고, 탭 밑줄(-mb-px)이 세로 스크롤을 만들지 않게 세로 넘침은 자른다 */}
        <nav className="flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MENUS.map((m) =>
            m.ready ? (
              <Link aria-current={active === m.key ? "page" : undefined} key={m.key} href={m.href} className={cn("relative -mb-px shrink-0 border-b-2 px-3 py-2 text-sm", active === m.key ? "border-brand font-bold" : "border-transparent text-muted hover:text-foreground")}>
                {m.label}
                {m.key === "dm" && unreadDm && <span className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-loss" aria-label="안 읽은 메시지" />}
              </Link>
            ) : (
              <span key={m.key} className="-mb-px shrink-0 cursor-default border-b-2 border-transparent px-3 py-2 text-sm text-muted/60" title="준비 중이에요">
                {m.label}<span className="ml-1 text-[10px]">준비 중</span>
              </span>
            ),
          )}
        </nav>
      </div>
      {status?.banned && (
        <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs">
          커뮤니티 이용이 제한된 상태라 글·댓글을 쓸 수 없어요({status.permanent ? "영구" : status.until ? `${new Date(status.until).toLocaleDateString("ko-KR")}까지` : ""}).{" "}
          <Link href="/?tab=community" className="text-brand">사유 보기</Link>
        </p>
      )}
    </div>
  );
}
