// 사이트 하단: 이용약관 · 개인정보 처리방침 · 커뮤니티 운영원칙 · 고객지원 링크 (AppShell 과 랜딩에서 사용)
import Link from "next/link";
import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  const a = "hover:text-foreground";
  return (
    <footer className={cn("border-t border-line px-4 py-5 text-xs text-muted", className)}>
      <div className="mx-auto flex max-w-5xl flex-col gap-2 md:pr-24">
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/terms" className={a}>이용약관</Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className={cn(a, "font-semibold")}>개인정보 처리방침</Link>
          <span aria-hidden>·</span>
          <Link href="/guidelines" className={a}>커뮤니티 운영원칙</Link>
          <span aria-hidden>·</span>
          <Link href="/support" className={a}>고객지원 · 버그 신고</Link>
        </nav>
        <p className="leading-relaxed">유펜(YouFen)은 대한펜싱협회와 무관한 비공식 서비스이며, 협회가 공개한 대회 결과를 바탕으로 점수와 순위를 제공합니다.</p>
      </div>
    </footer>
  );
}
