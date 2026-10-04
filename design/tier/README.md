# YouFen 티어 엠블럼 · 프로필 카드 테두리 (시안 A · 마스크 크레스트)

사이트 티어 7종: `bronze` `silver` `gold` `platinum` `diamond` `master` `challenger`.

## 파일

```
design/tier/
├─ emblems/
│  ├─ <tier>.svg        # 엠블럼, viewBox 0 0 200 200, 배경 투명 (≥40px 용)
│  └─ <tier>-sm.svg     # 같은 형태, 메쉬·잔선 제거 (≤40px, 28px 배지 용)
├─ frame/<tier>/
│  ├─ crest.svg         # 상단 중앙: 엠블럼 + 받침 플레이트(+불꽃)   220×130
│  ├─ corner.svg        # 모서리 칼끝 + 리벳/보석 (좌상단 기준)       48×48
│  ├─ bottom.svg        # 하단 중앙 교차 검(+보석)                   88×70
│  └─ wing.svg          # 상단 모서리 날개 (gold 이상만)             94×110
├─ tier-frame.css       # 가변 크기 테두리 + 조각 배치 + 티어별 CSS 변수
├─ tokens.json          # 티어별 색상 / 테두리 수치 / 조각 경로
└─ preview.html         # 데모 (브라우저에서 파일 직접 열기)
```

조각 SVG 는 모두 1x px 크기 그대로 쓰도록 만들었습니다(늘리지 마세요). 테두리 자체는 CSS 라 카드 크기와 무관합니다.

## 색상 토큰 (`tokens.json` → `tiers.<tier>`)

| 키 | 의미 |
|---|---|
| `primary` | 주색 (금속 중간 톤) |
| `light` | 밝은색 (하이라이트, 티어 배지 글자) |
| `dark` | 어두운색 (외곽선, 배지 배경) |
| `glow` | 글로우색 (diamond 이상에서 실제 사용) |
| `gem` | 보석색 (challenger 만 파랑 `#62d4ff`) |
| `frame.*` | 테두리 두께, 메쉬 투명도, 날개/광채/불꽃/왕관 여부, 조각 경로 |

## 카드에 얹는 법

1. `tier-frame.css` 를 전역으로 불러옵니다 (Next.js: `app/layout.tsx` 에서 import 하거나 `globals.css` 로 복사).
2. SVG 조각은 정적 경로가 필요하므로 `public/tier/` 로 복사합니다 (`emblems/`, `frame/` 그대로). 아래 예시는 `/tier/...` 기준.
3. 기존 카드 루트에 `yf-card` 클래스와 `data-tier` 를 붙이고, 장식 요소를 카드 안에 넣습니다. 기존 내용은 `yf-card__content` 로 감쌉니다.

```html
<div class="yf-card" data-tier="gold">
  <!-- 테두리 (CSS) -->
  <div class="yf-card__frame"></div>
  <div class="yf-card__mesh"></div>
  <div class="yf-card__inner"></div>

  <!-- gold 이상: 날개 -->
  <img class="yf-card__wing yf-card__wing--l" src="/tier/frame/gold/wing.svg" alt="">
  <img class="yf-card__wing yf-card__wing--r" src="/tier/frame/gold/wing.svg" alt="">

  <!-- 네 모서리 -->
  <img class="yf-card__corner yf-card__corner--tl" src="/tier/frame/gold/corner.svg" alt="">
  <img class="yf-card__corner yf-card__corner--tr" src="/tier/frame/gold/corner.svg" alt="">
  <img class="yf-card__corner yf-card__corner--bl" src="/tier/frame/gold/corner.svg" alt="">
  <img class="yf-card__corner yf-card__corner--br" src="/tier/frame/gold/corner.svg" alt="">

  <!-- 상단 엠블럼, 하단 교차 검 -->
  <img class="yf-card__crest" src="/tier/frame/gold/crest.svg" alt="골드 티어">
  <img class="yf-card__bottom" src="/tier/frame/gold/bottom.svg" alt="">

  <div class="yf-card__content">
    <!-- 기존: 프로필 사진, 닉네임, 소속, 티어 배지, 레이팅/전적 -->
  </div>
</div>
```

React 예시:

```tsx
const WING_TIERS = new Set(["gold", "platinum", "diamond", "master", "challenger"]);

export function TierFrame({ tier, label, children }: { tier: string; label: string; children: React.ReactNode }) {
  const p = `/tier/frame/${tier}`;
  return (
    <div className="yf-card" data-tier={tier}>
      <div className="yf-card__frame" /><div className="yf-card__mesh" /><div className="yf-card__inner" />
      {WING_TIERS.has(tier) && (<>
        <img className="yf-card__wing yf-card__wing--l" src={`${p}/wing.svg`} alt="" />
        <img className="yf-card__wing yf-card__wing--r" src={`${p}/wing.svg`} alt="" />
      </>)}
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <img key={c} className={`yf-card__corner yf-card__corner--${c}`} src={`${p}/corner.svg`} alt="" />
      ))}
      <img className="yf-card__crest" src={`${p}/crest.svg`} alt={`${label} 티어`} />
      <img className="yf-card__bottom" src={`${p}/bottom.svg`} alt="" />
      <div className="yf-card__content">{children}</div>
    </div>
  );
}
```

## 주의

- **여백**: 장식이 카드 밖으로 나갑니다(위 약 70px, 좌우 약 50px, 아래 약 32px). 카드 그리드에 그만큼 gap/padding 을 주세요. 부모에 `overflow: hidden` 이 있으면 잘립니다.
- **상단 패딩**: `.yf-card` 에 `padding-top: 64px` 가 들어 있어 엠블럼 아래로 내용이 시작됩니다. 필요하면 덮어쓰세요.
- **카드 배경**: 기본은 티어 어두운색 → 거의 검정 그라디언트(`--yf-body`). 기존 배경을 유지하려면 `.yf-card { --yf-body: <기존 배경>; }`.
- **권장 최소 크기**: 약 200×280. 그보다 작으면 크레스트(220px 폭)가 카드보다 넓어집니다. 작은 카드에는 `.yf-card__crest { transform: scale(.8); transform-origin: top center; }` 처럼 줄이세요.
- **ID 충돌**: SVG 를 `<img>` 로 쓰면 그라디언트 ID 충돌이 없습니다. 인라인(`<svg>` 붙여넣기)으로 쓸 경우에도 파일마다 `yf-<tier>-…` 접두사로 고유 ID 를 넣어 두었습니다.
- **원본**: 디자인 원본은 Claude 디자인 캔버스 "youfen 티어 엠블럼 시안"(시안 A · 프로필 카드 테두리 아트보드)입니다.
