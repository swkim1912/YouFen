"use client";
// 랭킹 상단의 포디움: 2위 - 1위 - 3위 순서로 계단을 세우고 이름/소속/점수를 보여준다. 누르면 선수 프로필로 이동.
import Link from "next/link";
import { tierColor } from "@/lib/fencing";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

export interface PodiumEntry {
  athleteId: number;
  name: string;
  team: string | null;
  score: number;
  tier: string | null;
  href: string;
  /** 프로필 사진 재료(선수 페이지 헤더와 같은 값): 회원 사진 설정, 소속 클럽, 소속 이름 */
  avatar: { avatarUrl: string | null; clubId: number | null; affiliation: string | null };
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
            {/* 프로필 사진: 선수 페이지와 같은 Avatar(회원 사진 → 클럽 이미지 → 소속 첫 글자), 테두리는 티어 색 */}
            <div className="mb-1 rounded-full group-hover:brightness-125" style={{ boxShadow: `0 0 0 2px ${tierColor(e.tier)}` }}>
              <Avatar avatarUrl={e.avatar.avatarUrl} clubId={e.avatar.clubId} affiliation={e.avatar.affiliation} nickname={e.name} size={48} />
            </div>
            <span className="max-w-full truncate text-sm font-bold group-hover:text-brand">{e.name}</span>
            <span className="max-w-full truncate text-[11px] text-muted">{e.team ?? "소속 없음"}</span>
            <span className="mb-1 text-xs font-semibold" style={{ color: tierColor(e.tier) }}>{e.score}점</span>
            {/* 단: 원색 덩어리 대신 메달색 윗선 + 위에서 아래로 옅어지는 메달색 채움, 숫자는 메달색 */}
            <div
              className={cn("flex w-full items-start justify-center rounded-t-md border-t-2 pt-1.5 text-xl font-extrabold transition-[filter] group-hover:brightness-125", heights[col])}
              style={{ borderColor: MEDAL[idx], color: MEDAL[idx], backgroundImage: `linear-gradient(${MEDAL[idx]}40, ${MEDAL[idx]}0d)` }}
            >
              {idx + 1}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
