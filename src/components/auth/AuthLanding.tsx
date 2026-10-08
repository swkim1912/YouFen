"use client";
// 비로그인 랜딩: 왼쪽 소개(문구·기능 3가지·티어 사다리) + 오른쪽 로그인/회원가입 카드. 홈(/)·/login·/signup 이 같이 쓴다.
// - '비로그인으로 이용' 은 랭킹으로 보낸다(비로그인도 랭킹·검색·대회·기록지는 볼 수 있다).
// - 이미 로그인한 사용자가 /login·/signup 에 들어오면 마이 펜싱(/)으로 보낸다.
// - 디자인: 브랜드 네이비(#0E2236) 바탕에 피스트(펜싱 경기장) 라인 무늬, Sky(#0CA4E1) 포인트. 티어 사다리는 사이트 고유 요소(실제 엠블럼).
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2, NotebookPen, Swords, Trophy } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import { cn, safeNext } from "@/lib/utils";

// 사이트가 실제로 하는 일 (소개 문구와 어긋나지 않게 기능이 바뀌면 같이 고친다)
const FEATURES = [
  { icon: Trophy, title: "대회 랭킹·티어", desc: "협회 대회 결과로 매기는 시즌 점수와 티어" },
  { icon: Swords, title: "내 전적 기록", desc: "오픈·프라이빗 경기를 남기고 상대에게 확인받기" },
  { icon: NotebookPen, title: "피드백 노트", desc: "경기마다 복기와 다음 목표를 메모" },
  { icon: Link2, title: "선수 연결", desc: "협회 등록 선수와 연결해 대회 기록까지 한 화면에" },
];

// 티어 순서(낮음 → 높음) — public/tier/emblems/<key>-sm.svg
const LADDER = [
  ["bronze", "브론즈"], ["silver", "실버"], ["gold", "골드"], ["platinum", "플래티넘"],
  ["diamond", "다이아"], ["master", "마스터"], ["challenger", "챌린저"],
] as const;

export function AuthLanding({ initial = "login", redirectIfAuthed = false }: { initial?: "login" | "signup"; redirectIfAuthed?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">(initial);

  useEffect(() => {
    // 로그인되면 ?next= 주소(공동 편집 기록지 링크 등)로, 없으면 마이 펜싱으로
    if (redirectIfAuthed && user) router.replace(safeNext(new URLSearchParams(window.location.search).get("next")) ?? "/");
  }, [redirectIfAuthed, user, router]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0a1726]">
      {/* 피스트 라인: 사선 가는 줄무늬를 위쪽에서 아래로 사라지게 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: "repeating-linear-gradient(115deg, rgba(12,164,225,0.07) 0 1px, transparent 1px 46px)",
          maskImage: "linear-gradient(to bottom, black, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
        }}
      />
      <div className="pointer-events-none absolute -left-48 top-1/3 h-[30rem] w-[30rem] rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -top-32 h-[26rem] w-[26rem] rounded-full bg-[#0C86C0]/20 blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Logo size={34} />
        <Link href="/ranking" className="flex items-center gap-1 text-sm text-white/70 hover:text-white md:hidden">
          비로그인으로 이용<ArrowRight size={14} />
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 pb-12 md:grid-cols-[1.1fr_1fr] md:gap-12">
        {/* 소개 */}
        <section className="py-2 md:py-0">
          <p className="mb-5 inline-flex items-center gap-3 text-sm font-semibold tracking-wide text-white/80">
            <span className="h-px w-8 bg-brand" />
            <span>All <span className="text-brand">You</span> need to Fence</span>
          </p>
          <h1 className="break-keep text-[2.4rem] font-extrabold leading-[1.15] tracking-tight text-white sm:text-5xl md:text-[2.5rem] lg:text-[3.1rem]">
            내 전적부터<br />시즌 티어까지,<br /><span className="text-brand">한 곳에서.</span>
          </h1>
          <p className="mt-5 max-w-lg break-keep text-sm leading-relaxed text-white/60 sm:text-base">
            협회 대회 결과로 만든 랭킹과 티어를 확인하고, 직접 뛴 경기는 기록으로 남기세요. 선수 연결은 가입 후 언제든 할 수 있어요.
          </p>

          <ul className="mt-7 hidden max-w-xl gap-x-6 gap-y-4 sm:grid sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand"><Icon size={16} /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block break-keep text-xs leading-snug text-white/50">{desc}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* 티어 사다리 */}
          <div className="mt-6 max-w-xl sm:mt-8">
            <p className="mb-2 text-xs text-white/40">시즌 티어</p>
            <div className="flex items-end justify-between gap-1 border-t border-white/10 pt-3">
              {LADDER.map(([key, label]) => (
                // 모든 엠블럼을 같은 높이에 나란히 둔다(예전 계단식 이동은 챌린저 쪽이 내려가 보여서 없앰)
                <div key={key} className="flex flex-col items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/tier/emblems/${key}-sm.svg`} alt="" width={34} height={34} className="h-[34px] w-[34px] sm:h-10 sm:w-10" />
                  <span className="text-[11px] text-white/60">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <Link href="/ranking" className="mt-8 hidden w-fit items-center gap-2 rounded-lg border border-brand/50 px-5 py-2.5 text-sm font-semibold text-brand hover:bg-brand/10 md:inline-flex">
            비로그인으로 이용<ArrowRight size={16} />
          </Link>
        </section>

        {/* 로그인 / 회원가입 카드 */}
        <section className="w-full max-w-md justify-self-center rounded-2xl border border-brand/20 bg-[#0c1b2d]/90 p-5 shadow-2xl shadow-black/40 backdrop-blur sm:p-7 md:justify-self-end">
          <div className="mb-6 flex border-b border-white/10 text-sm font-semibold">
            {([["login", "로그인"], ["signup", "회원가입"]] as const).map(([k, label]) => (
              <button aria-pressed={tab === k}
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn("-mb-px flex-1 border-b-2 pb-3 pt-1", tab === k ? "border-brand text-white" : "border-transparent text-white/45 hover:text-white/75")}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "login" ? <LoginForm /> : <SignupForm onDone={() => setTab("login")} />}
        </section>
      </main>
      <SiteFooter className="relative z-10 border-white/10" />
    </div>
  );
}
