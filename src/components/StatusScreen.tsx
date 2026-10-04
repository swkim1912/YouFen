// 404(없는 주소)·오류 화면 공용 본문: 큰 코드 숫자 + 제목 + 설명 + 버튼들. 로그인 화면과 같은 네이비·Sky 톤.
// - app/not-found.tsx: AppShell(상단 바·메뉴) 안에 넣어 다른 메뉴로 바로 이동할 수 있게 한다.
// - app/error.tsx: 화면 틀(AppShell) 자체에서 난 오류일 수도 있어 틀 없이 단독 화면으로 쓴다(standalone).
import Link from "next/link";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

export function StatusScreen({
  code, title, desc, children, standalone = false,
}: { code: string; title: string; desc: React.ReactNode; children?: React.ReactNode; standalone?: boolean }) {
  const body = (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 py-16 text-center sm:py-24">
      {/* 피스트 사선 무늬를 숫자 뒤에만 옅게 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-6 h-48 opacity-80"
        style={{
          backgroundImage: "repeating-linear-gradient(115deg, rgba(12,164,225,0.08) 0 1px, transparent 1px 34px)",
          maskImage: "radial-gradient(closest-side, black, transparent)",
          WebkitMaskImage: "radial-gradient(closest-side, black, transparent)",
        }}
      />
      <p className="relative text-7xl font-extrabold tracking-tight text-brand sm:text-8xl">{code}</p>
      <h1 className="relative mt-4 text-xl font-bold sm:text-2xl">{title}</h1>
      <p className="relative mt-2 break-keep text-sm leading-relaxed text-muted">{desc}</p>
      <div className="relative mt-7 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
  if (!standalone) return body;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-line bg-panel/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <Link href="/" aria-label="유펜 YouFen 홈"><Logo /></Link>
        </div>
      </header>
      <main className="flex flex-1 items-center">{body}</main>
    </div>
  );
}

/** 버튼 모양 링크 (Button 컴포넌트와 같은 모양) */
export function StatusLink({ href, primary, children }: { href: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
        primary ? "bg-brand font-semibold text-brand-ink hover:brightness-110" : "border border-line hover:border-brand/40 hover:bg-white/5"
      )}
    >
      {children}
    </Link>
  );
}
