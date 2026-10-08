// 이용약관·개인정보 처리방침·커뮤니티 운영원칙·고객지원이 공유하는 문서형 페이지 틀 (AppShell 포함, 비로그인도 열람 가능)
import Link from "next/link";
import { AppShell } from "./AppShell";
import { LEGAL_UPDATED } from "@/lib/legal";

const TABS = [
  ["/terms", "이용약관"],
  ["/privacy", "개인정보 처리방침"],
  ["/guidelines", "커뮤니티 운영원칙"],
  ["/support", "고객지원"],
] as const;

export function LegalPage({ path, title, intro, children, showDate = true }: { path: string; title: string; intro?: string; children: React.ReactNode; showDate?: boolean }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <nav className="flex flex-wrap gap-1 border-b border-line text-sm">
          {TABS.map(([href, label]) => (
            <Link aria-current={href === path ? "page" : undefined} key={href} href={href} className={`-mb-px border-b-2 px-3 py-2 ${href === path ? "border-brand font-bold" : "border-transparent text-muted hover:text-foreground"}`}>{label}</Link>
          ))}
        </nav>
        <header>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
          {showDate && <p className="mt-1 text-xs text-muted">시행일·최종 수정일: {LEGAL_UPDATED}</p>}
        </header>
        <div className="space-y-6 text-sm leading-relaxed">{children}</div>
      </div>
    </AppShell>
  );
}

/** 문서 한 조항: 제목 + 본문(문단 또는 목록) */
export function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      <div className="space-y-2 text-muted [&_b]:text-foreground [&_li]:ml-4 [&_li]:list-disc">{children}</div>
    </section>
  );
}
