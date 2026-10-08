"use client";
// 커뮤니티 공용 머리: 제목 + 하위 메뉴(게시판 / 채팅 / 장터). 채팅·장터는 3·4단계에서 열린다(docs/COMMUNITY.md 8장).
// 커뮤니티 이용이 제한된 회원에게는 사유·기간을 짧게 알린다(자세한 내용은 마이 펜싱 > 커뮤니티 설정).
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CommunityStatus } from "@/lib/community";
import { cn } from "@/lib/utils";

const MENUS = [
  { key: "board", label: "게시판", href: "/community", ready: true },
  { key: "chat", label: "채팅", href: "#", ready: false },
  { key: "market", label: "장터", href: "#", ready: false },
] as const;

export function CommunityHeader({ active = "board" }: { active?: (typeof MENUS)[number]["key"] }) {
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  useEffect(() => {
    supabase.rpc("my_community_status").then(({ data }) => setStatus((data as CommunityStatus | null) ?? null));
  }, []);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-4 border-b border-line">
        <h1 className="pb-2 text-lg font-bold">커뮤니티</h1>
        <nav className="flex gap-1">
          {MENUS.map((m) =>
            m.ready ? (
              <Link key={m.key} href={m.href} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", active === m.key ? "border-brand font-bold" : "border-transparent text-muted hover:text-foreground")}>
                {m.label}
              </Link>
            ) : (
              <span key={m.key} className="-mb-px cursor-default border-b-2 border-transparent px-3 py-2 text-sm text-muted/60" title="준비 중이에요">
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
