"use client";
// 약관 동의 체크 묶음: 가입 1단계, 구글 가입 직후(온보딩), 기존 회원 재동의(ConsentGate)가 같이 쓴다.
// 필수 4가지(만 14세 이상 / 이용약관 / 개인정보 수집·이용 / 커뮤니티 운영원칙)를 모두 체크해야 다음으로 넘어간다.
// 약관 전문은 새 탭으로 열어서 작성 중인 입력이 사라지지 않게 한다.
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConsentState { age: boolean; terms: boolean; privacy: boolean; community: boolean }
export const emptyConsent: ConsentState = { age: false, terms: false, privacy: false, community: false };
export const isConsentComplete = (c: ConsentState) => c.age && c.terms && c.privacy && c.community;

const ITEMS: { key: keyof ConsentState; label: string; href?: string }[] = [
  { key: "age", label: "만 14세 이상입니다" },
  { key: "terms", label: "이용약관에 동의합니다", href: "/terms" },
  { key: "privacy", label: "개인정보 수집·이용에 동의합니다", href: "/privacy" },
  { key: "community", label: "커뮤니티 운영원칙에 동의합니다", href: "/community" },
];

export function ConsentChecks({ value, onChange }: { value: ConsentState; onChange: (v: ConsentState) => void }) {
  const all = isConsentComplete(value);
  const box = (on: boolean) => (
    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-white" : "border-line bg-panel2")}>{on && <Check size={14} />}</span>
  );
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => onChange(all ? emptyConsent : { age: true, terms: true, privacy: true, community: true })} className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-panel2 px-3 py-3 text-left text-sm font-bold">
        {box(all)}모두 동의합니다
      </button>
      <ul className="space-y-1 px-1">
        {ITEMS.map((it) => (
          <li key={it.key} className="flex items-center gap-2.5 py-1 text-sm">
            <button type="button" onClick={() => onChange({ ...value, [it.key]: !value[it.key] })} aria-pressed={value[it.key]} aria-label={it.label} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              {box(value[it.key])}
              <span className="min-w-0"><span className="mr-1 text-xs font-semibold text-brand">[필수]</span>{it.label}</span>
            </button>
            {it.href && <Link href={it.href} target="_blank" className="shrink-0 text-xs text-muted underline hover:text-foreground">보기</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
