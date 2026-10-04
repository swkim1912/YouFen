// 티어 프로필 카드 테두리: 카드 전체를 티어 색 테두리·상단 크레스트·날개·하단 교차 검으로 감싼다 (design/tier 시안 A).
// 에셋은 public/tier, 스타일은 src/app/tier-frame.css. 티어가 없으면(배치 중 등) 평범한 카드로 그린다.
// 장식이 카드 밖으로 나가므로(위 70px·좌우 50px·아래 32px) 바깥 여백을 이 컴포넌트가 함께 잡는다. 부모에 overflow:hidden 을 두지 말 것.
import { cn } from "@/lib/utils";

/** 한글 티어 이름 → 에셋 폴더 이름 */
export const TIER_KEY: Record<string, string> = {
  브론즈: "bronze", 실버: "silver", 골드: "gold", 플래티넘: "platinum", 다이아몬드: "diamond", 마스터: "master", 챌린저: "challenger",
};
const WING_TIERS = new Set(["gold", "platinum", "diamond", "master", "challenger"]);

export function TierFrame({
  tier, className, contentClassName, children,
}: {
  tier: string | null | undefined;
  className?: string; // 바깥 래퍼
  contentClassName?: string; // 카드 안쪽(기존 카드 내용의 레이아웃 클래스)
  children: React.ReactNode;
}) {
  const key = tier ? TIER_KEY[tier] : undefined;
  if (!key) {
    return (
      <section className={cn("rounded-lg border border-line bg-panel p-4", className, contentClassName)}>{children}</section>
    );
  }
  const p = `/tier/frame/${key}`;
  return (
    // 좁은 화면에서는 날개를 숨기고 좌우 여백을 줄인다 (tier-frame.css 아래 .yf-wrap)
    <div className={cn("yf-wrap mx-3 mb-8 mt-20 sm:mx-12", className)}>
      <section className="yf-card" data-tier={key}>
        <div className="yf-card__frame" />
        <div className="yf-card__mesh" />
        <div className="yf-card__inner" />
        {WING_TIERS.has(key) && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="yf-card__wing yf-card__wing--l" src={`${p}/wing.svg`} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="yf-card__wing yf-card__wing--r" src={`${p}/wing.svg`} alt="" />
          </>
        )}
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={c} className={`yf-card__corner yf-card__corner--${c}`} src={`${p}/corner.svg`} alt="" />
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="yf-card__crest" src={`${p}/crest.svg`} alt={`${tier} 티어`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="yf-card__bottom" src={`${p}/bottom.svg`} alt="" />
        <div className={cn("yf-card__content px-6 pb-8 pt-3 sm:px-9", contentClassName)}>{children}</div>
      </section>
    </div>
  );
}
