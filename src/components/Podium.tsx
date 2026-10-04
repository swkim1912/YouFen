"use client";
// 랭킹 상단의 포디움: 2위 - 1위 - 3위 순서로 계단을 세우고 이름/소속/점수를 보여준다. 누르면 선수 프로필로 이동.
import Link from "next/link";
import { tierColor } from "@/lib/fencing";
import { cn } from "@/lib/utils";

export interface PodiumEntry {
  athleteId: number;
  name: string;
  team: string | null;
  score: number;
  tier: string | null;
  href: string;
}

const MEDAL = ["#e5c14b", "#c0c6d4", "#cd8b4a"]; // 금 / 은 / 동

export function Podium({ top }: { top: (PodiumEntry | undefined)[] }) {
  // top[0]=1위, top[1]=2위, top[2]=3위 → 화면 배치는 2위·1위·3위
  const order = [1, 0, 2];
  const heights = ["h-20", "h-28", "h-16"]; // 화면 순서(2·1·3) 기준 단 높이
  return (
    <div className="flex min-w-0 items-end justify-center gap-2 rounded-lg border border-line bg-panel px-3 pt-4">
      {order.map((idx, col) => {
        const e = top[idx];
        if (!e) return <div key={col} className="min-w-0 flex-1 sm:w-28 sm:flex-none" />;
        return (
          <Link key={e.athleteId} href={e.href} className="group flex min-w-0 flex-1 flex-col items-center sm:w-28 sm:flex-none">
            <div
              className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-panel2 text-lg font-bold ring-2 group-hover:brightness-125"
              style={{ boxShadow: `0 0 0 2px ${tierColor(e.tier)}` }}
            >
              {e.name[0]}
            </div>
            <span className="max-w-full truncate text-sm font-bold">{e.name}</span>
            <span className="max-w-full truncate text-[11px] text-muted">{e.team ?? "소속 없음"}</span>
            <span className="mb-1 text-xs font-semibold" style={{ color: tierColor(e.tier) }}>{e.score}점</span>
            <div
              className={cn("flex w-full items-start justify-center rounded-t-md pt-1.5 text-xl font-extrabold text-black/80", heights[col])}
              style={{ backgroundColor: MEDAL[idx] }}
            >
              {idx + 1}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
