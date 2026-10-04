// 티어 표시: 원형 배지(프로필 상단용)와 작은 알약(목록용). 색은 lib/fencing.ts 의 TIER_META.
import { TIER_META, tierColor } from "@/lib/fencing";

/** 목록용 작은 표시: ● 다이아몬드 */
export function TierPill({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-xs text-muted">배치 중</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: tierColor(tier) }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tierColor(tier) }} />
      {tier}
    </span>
  );
}

/** 프로필 상단용 큰 원형 배지 */
export function TierCircle({ tier, size = 64 }: { tier: string | null; size?: number }) {
  const color = tierColor(tier);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border-4 text-sm font-bold"
      style={{ width: size, height: size, borderColor: color, color }}
    >
      {tier ? TIER_META[tier]?.short ?? tier.slice(0, 1) : "?"}
    </div>
  );
}
