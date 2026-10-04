// 티어 표시: 엠블럼(마스크 크레스트) 배지와 목록용 작은 표시. 엠블럼은 public/tier/emblems (design/tier 시안 A).
// 28~40px 이하는 메쉬·잔선을 뺀 -sm 파일을 쓴다. 색은 lib/fencing.ts 의 TIER_META.
import { tierColor } from "@/lib/fencing";
import { TIER_KEY } from "./TierFrame";

/** 엠블럼 이미지. 티어가 없으면 null */
export function TierEmblem({ tier, size = 64, className }: { tier: string | null | undefined; size?: number; className?: string }) {
  const key = tier ? TIER_KEY[tier] : undefined;
  if (!key) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/tier/emblems/${key}${size <= 40 ? "-sm" : ""}.svg`} alt={`${tier} 티어`} width={size} height={size} className={className} />;
}

/** 목록용 작은 표시: [엠블럼] 다이아몬드 */
export function TierPill({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-xs text-muted">배치 중</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: tierColor(tier) }}>
      <TierEmblem tier={tier} size={22} />
      {tier}
    </span>
  );
}

/** 프로필 상단용 큰 배지: 티어가 있으면 엠블럼, 없으면(배치 중) 회색 물음표 원 */
export function TierCircle({ tier, size = 64 }: { tier: string | null; size?: number }) {
  if (tier) return <TierEmblem tier={tier} size={size} className="shrink-0" />;
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full border-4 text-sm font-bold" style={{ width: size, height: size, borderColor: "#6b7280", color: "#6b7280" }}>
      ?
    </div>
  );
}
