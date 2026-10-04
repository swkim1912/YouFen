// 유펜 로고(최종 시안 B · 스포티 이탤릭). 모두 벡터(SVG, 글자도 path 라 폰트 로딩이 필요 없다).
// - 사이트(어두운 배경)용 가로형: YF 칼 심볼 + YouFen (You 흰색 / Fen Sky #0CA4E1) = public/brand/yf-logo-horizontal-dark.svg
// - symbolOnly 면 심볼만(컬러). 원본 세트와 사용법은 design/brand/ (README.md).
// - size 는 로고 높이(px). 심볼 최소 크기는 약 24px.
import { cn } from "@/lib/utils";

export function Logo({ size = 28, symbolOnly = false, className }: { size?: number; symbolOnly?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={symbolOnly ? "/brand/yf-symbol.svg" : "/brand/yf-logo-horizontal-dark.svg"}
      alt="YouFen"
      className={cn("block w-auto max-w-none", className)}
      style={{ height: size }}
    />
  );
}
