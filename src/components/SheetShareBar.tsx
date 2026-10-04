"use client";
// 기록지 위 공동 편집 막대(개인전·단체전 공통). lib/sharedSheet.ts 의 useSheetDoc 상태를 보여준다.
// - 혼자 편집: '공동 편집' 버튼 → 지금까지 적은 내용으로 공동 기록지를 만들고 링크를 클립보드에 복사.
// - 공동 편집 중: 접속 중인 회원 닉네임, '링크 복사', '혼자 편집으로 전환'.
// - 로그인 안 한 사람이 링크로 들어오면 로그인 안내(로그인 후 같은 기록지로 돌아옴), 없는 링크면 안내 + 새 기록지.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Link2, LogIn, Users } from "lucide-react";
import { Button } from "./ui/button";
import type { SheetMode } from "@/lib/sharedSheet";

export function SheetShareButton({ onShare }: { onShare: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onShare} title="링크를 만들어 다른 회원과 이 기록지를 실시간으로 함께 편집해요">
      <Users size={14} />공동 편집
    </Button>
  );
}

/** 공동 편집 상태 막대. 혼자 편집이면 아무것도 그리지 않는다(기록지 본문은 mode 가 local·live 일 때만 그린다) */
export function SheetShareBar({ mode, members, onCopy, onLeave }: { mode: SheetMode; members: string[]; onCopy: () => void; onLeave: () => void }) {
  const pathname = usePathname();
  if (mode === "local") return null;
  if (mode === "loading") return <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">공동 편집 기록지를 불러오는 중…</p>;
  if (mode === "login") {
    const next = typeof window === "undefined" ? pathname : `${pathname}${window.location.search}`;
    return (
      <div className="rounded-lg border border-brand/30 bg-brand/[0.06] p-4 text-sm">
        <p className="font-semibold">공동 편집 기록지예요</p>
        <p className="mt-1 text-muted">로그인한 회원만 함께 편집할 수 있어요. 로그인하면 이 기록지로 돌아와요.</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-semibold text-brand-ink hover:brightness-110">
          <LogIn size={15} />로그인
        </Link>
      </div>
    );
  }
  if (mode === "missing") {
    return (
      <div className="rounded-lg border border-line bg-panel p-4 text-sm">
        <p className="font-semibold">공동 편집 기록지를 찾을 수 없어요</p>
        <p className="mt-1 text-muted">링크가 잘못되었거나, 5일 동안 수정이 없어 삭제된 기록지예요.</p>
        <Button size="sm" className="mt-3" onClick={onLeave}>새 기록지로 시작</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/[0.06] px-3 py-2 text-sm">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-win" /></span>
      <b>공동 편집 중</b>
      <span className="min-w-0 truncate text-muted">
        접속 {members.length}명{members.length ? ` · ${members.join(", ")}` : ""}
      </span>
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={onCopy}><Link2 size={14} />링크 복사</Button>
        <Button size="sm" variant="ghost" onClick={onLeave} title="지금 내용을 이 기기로 복사해 혼자 편집해요. 다른 사람의 공동 기록지는 그대로 남아요">혼자 편집으로 전환</Button>
      </span>
    </div>
  );
}
