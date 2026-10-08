---
name: 유펜 YouFen
description: All You need to Fence — 펜싱 전적·랭킹·티어를 한 화면에 담는 어두운 데이터 앱
colors:
  midnight-navy: "#0b1520"
  panel-navy: "#121e2c"
  well-navy: "#0e1825"
  line-navy: "#1f2e40"
  scrollbar-navy: "#2a3b50"
  scrim-navy: "#03080e"
  frost-text: "#e7edf5"
  slate-muted: "#8b9ab0"
  logo-sky: "#0ca4e1"
  sky-ink: "#04121d"
  win-blue: "#4f8dff"
  loss-coral: "#f0616b"
  pending-amber: "#f2c94c"
  member-green: "#34d399"
  medal-gold: "#e5c14b"
  medal-silver: "#c0c6d4"
  medal-bronze: "#cd8b4a"
  tier-bronze: "#cf8a5c"
  tier-silver: "#b3c0cd"
  tier-gold: "#d9a63a"
  tier-platinum: "#4cc9be"
  tier-diamond: "#8196ff"
  tier-master: "#bf83f2"
  tier-challenger: "#ffd76a"
typography:
  display:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 3.1rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1"
  micro:
    fontFamily: "Pretendard Variable, Pretendard, Malgun Gothic, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
components:
  button-primary:
    backgroundColor: "{colors.logo-sky}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-sm:
    backgroundColor: "{colors.logo-sky}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.frost-text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.frost-text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.loss-coral}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.well-navy}"
    textColor: "{colors.frost-text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.frost-text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  filter-chip:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.slate-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  filter-chip-selected:
    backgroundColor: "{colors.logo-sky}"
    textColor: "{colors.sky-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  nav-item:
    textColor: "{colors.slate-muted}"
    typography: "{typography.micro}"
    padding: "8px 0"
  nav-item-active:
    textColor: "{colors.logo-sky}"
    typography: "{typography.micro}"
    padding: "8px 0"
  modal:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.frost-text}"
    rounded: "{rounded.lg}"
    padding: "20px"
  fab:
    backgroundColor: "{colors.logo-sky}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.full}"
    size: "48px"
---

# Design System: 유펜 YouFen

## Overview

**Creative North Star: "Youfen First"**

유펜의 화면은 유펜다워야 한다. 출발점은 OP.GG 같은 어두운 전적 화면이지만, 남의 모양을 빌려 오지 않고 로고에서 나온 **심야 네이비 + 로고 Sky** 한 세계로 모든 화면을 통일한다. 랜딩·로그인·랭킹·기록지·커뮤니티·관리자가 전부 같은 바탕색, 같은 선, 같은 강조색 하나를 쓴다. 새 화면이 "다른 사이트에서 본 것 같다"면 실패이고, "유펜 화면이구나"가 바로 보이면 성공이다.

밀도는 데이터 앱의 밀도다. 점수·순위·승패·날짜가 주인공이라 글자는 대부분 14px·12px, 숫자는 같은 폭(tabular-nums)으로 세로 정렬된다. 부품은 **단단하고 절제되어** 있다. 그림자 대신 바탕 밝기 세 단계와 1px 네이비 선으로 층을 나누고, 강조는 Sky 하나뿐이다. 화려함은 단 한 곳, **티어 엠블럼과 티어 카드 테두리**에만 허락된다. 펜서가 자기 티어를 볼 때 그 순간만 빛나야 하므로 나머지는 조용히 물러나 있다.

휴대폰이 기본 화면이다. 체육관에서 한 손으로 기록을 남기므로 좁은 화면에서는 아래 탭바와 떠 있는 '+' 버튼이 중심이 되고, 넓은 화면에서는 오른쪽 세로 메뉴바로 바뀐다. 화면 문구는 전부 한글이고, 한글 단어는 줄 중간에서 끊지 않는다.

**Key Characteristics:**
- 네이비로 물든 어두운 바탕 세 단계(바탕 → 카드 → 카드 안 칸) + 1px 네이비 선
- 강조색은 로고 Sky 하나, Sky 위 글자는 흰색이 아닌 진한 네이비(sky-ink)
- 승 = 파랑, 패 = 코랄, 수락 대기 = 호박색 — 의미가 정해진 상태색
- Pretendard 한 가족, 같은 폭 숫자, 작은 글자 중심의 촘촘한 데이터 밀도
- 장식은 티어 엠블럼·카드 테두리에만

## Colors

네이비 쪽으로 살짝 물든 어둠 위에 Sky 하나가 신호등처럼 켜지는 팔레트다. 순수 회색은 쓰지 않는다.

### Primary
- **로고 Sky** (logo-sky): 강조색의 전부. 주 버튼, 선택된 필터 칩, 현재 메뉴, 포커스 테두리, 링크, 떠 있는 '+' 버튼, 글자 선택 색. 옅은 강조 바탕은 15~20% 투명도(`bg-brand/15`)로 쓴다.
- **Sky 잉크** (sky-ink): Sky·코랄 바탕 위 글자색. 흰 글자는 Sky 위에서 대비가 부족해 쓰지 않는다.

### Secondary (상태색)
- **승리 파랑** (win-blue): 승리 표시, 승 점수, 승패 줄의 옅은 승 바탕(15~20%).
- **패배 코랄** (loss-coral): 패배 표시, 위험 버튼, 알림 숫자 배지, 오류. 옅은 바탕은 10~20%.
- **대기 호박** (pending-amber): 오픈 기록 수락 대기(PENDING) 상태만. 옅은 바탕 10%.
- **회원 초록** (member-green): 회원 표시 점 하나에만 쓴다. 비회원 점은 slate-muted 50%.

### Tertiary (등수·티어)
- **메달 금·은·동** (medal-gold, medal-silver, medal-bronze): 1·2·3등 숫자와 포디움. 랭킹·대회 결과·선수 프로필에 공통.
- **티어 색 7종** (tier-bronze ~ tier-challenger): 티어 이름 글자와 작은 표식. 티어 엠블럼 색에서 뽑은 값이고, 골드(짙은 황금)와 챌린저(밝은 금빛)는 밝기로 구분한다. 티어 없음은 슬레이트 보조 색(`tierColor()` 기본값 = slate-muted, 회색 #6b7a8f 는 대비 부족으로 폐기).

### Neutral
- **심야 네이비** (midnight-navy): 페이지 바탕.
- **패널 네이비** (panel-navy): 카드·표·모달·상단바·메뉴바 바탕.
- **우물 네이비** (well-navy): 카드 안에서 한 단계 낮은 칸, 입력창 바탕, 모바일 보조 막대.
- **선 네이비** (line-navy): 모든 경계선(카드 테두리, 표 구분선, 입력창 테두리).
- **서리 글자** (frost-text): 기본 글자색.
- **슬레이트 보조** (slate-muted): 보조 글자, 라벨, 비활성 메뉴. 카드 위 대비 5:1 이상.
- **스크롤바 네이비 / 덮개 네이비** (scrollbar-navy, scrim-navy): 얇은 스크롤바 막대, 모달 뒤 75% 덮개.

### Named Rules
**The One Sky Rule.** 강조색은 로고 Sky 하나뿐이다. 새 강조색(보라·초록 버튼 등)을 만들지 않는다. 승·패·대기·회원·메달·티어 색은 의미가 정해진 상태색이라 강조로 쓰지 않는다.

**The Ink-on-Sky Rule.** Sky·코랄로 칠한 바탕 위 글자는 항상 sky-ink(`text-brand-ink`). 흰 글자 금지.

**The Token-Only Rule.** 색은 `src/app/globals.css` 의 토큰 이름(`bg-panel`, `text-muted`, `bg-brand`…)으로만 쓴다. 컴포넌트에 새 hex 값을 적지 않는다(티어·메달 색은 `lib/fencing.ts` 상수 사용).

## Typography

**Display Font:** Pretendard Variable (with Pretendard, Malgun Gothic, system-ui)
**Body Font:** Pretendard Variable (같은 가족)

**Character:** 한 가족의 굵기 차이만으로 위계를 만든다. 한글과 숫자가 모두 고르게 단정하고, 숫자는 같은 폭이라 점수·순위 열이 반듯하다. npm 패키지의 dynamic-subset 판이라 외부 CDN 없이 쓴 글자만 내려받는다.

### Hierarchy
- **Display** (800, clamp 2.4rem→3.1rem, 1.15): 랜딩 첫 문장 하나에만.
- **Headline** (800, 20px 또는 700 18px, 1.4): 페이지 제목(랭킹·대회·마이 펜싱 등).
- **Title** (700, 16px, 1.5): 카드·섹션 제목, 모달 제목.
- **Body** (400, 14px, 1.43): 본문, 표 행, 버튼 글자, 필터 칩. 화면 글자의 대부분.
- **Label** (500, 12px): 보조 정보, 필터 이름표, 입력 라벨, 날짜·소속.
- **Micro** (500, 11px): 세로 메뉴바·아래 탭바 이름, 아주 작은 배지(10px).

### Named Rules
**The Tabular Rule.** 모든 숫자는 같은 폭(`font-variant-numeric: tabular-nums`, body 에 기본 적용). 점수·순위 열을 세로로 맞추기 위해 끄지 않는다.

**The Keep-All Rule.** 한글은 단어 중간에서 줄을 바꾸지 않는다(`word-break: keep-all`). 좁은 화면에서 넘치면 줄을 나누는 위치를 바꾸지, 단어를 자르지 않는다.

**The Weight-Not-Size Rule.** 위계는 크기보다 굵기(400/500/700/800)로 만든다. 데이터 화면에서 제목을 20px 넘게 키우지 않는다(랜딩 Display 만 예외).

## Layout

- **본문 폭:** 최대 1024px(`max-w-5xl`) 가운데 정렬, 좌우 여백 12px(작은 화면)→16px.
- **넓은 화면(md 768px 이상):** 위 상단바(높이 56px, 반투명 패널 + 흐림) + 오른쪽 고정 세로 메뉴바(폭 80px). 본문은 메뉴바만큼 오른쪽 여백(`pr-24`)을 둔다.
- **좁은 화면(md 미만):** 오른쪽 메뉴바를 숨기고, 상단바 아래 가로 스크롤 보조 메뉴 줄 + 화면 아래 고정 탭바(높이 56px) + 오른쪽 아래 떠 있는 '+' 버튼(48px 원). 경기·대회 한 줄 항목은 두 줄로 내려 쓴다.
- **리듬:** 4px 기반. 요소 사이 8px(`gap-2`)가 가장 흔하고, 묶음 사이 12~16px, 카드 안 여백 16px(넓은 화면 20px), 빈 상태 위아래 64px(`py-16`).
- **필터:** 한 줄에 카테고리 하나(`FilterRow`). 왼쪽 48px 이름표 + 오른쪽 칩들이 그 줄 안에서만 줄바꿈된다. 필터 상태는 주소 쿼리에 남긴다.

## Elevation & Depth

평평한 층 구조다. 깊이는 그림자가 아니라 **바탕 밝기 세 단계**(심야 → 우물 → 패널, 우물은 카드 안 낮은 칸)와 1px 선 네이비 테두리로 만든다. 그림자는 화면 위에 떠야 하는 것에만 쓴다.

### Shadow Vocabulary
- **떠 있는 창** (`box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5)`, `shadow-2xl shadow-black/50`): 모달·확인창. 뒤에 75% 덮개 네이비 + 2px 흐림.
- **떠 있는 버튼** (`shadow-lg`): 모바일 '+' 버튼처럼 본문 위에 고정된 부품.
- **상단바 유리** (`bg-panel/90` + `backdrop-blur-md`): 스크롤되는 본문 위의 상단바.

### Named Rules
**The Flat-By-Default Rule.** 카드·표·칩은 그림자가 없다. 그림자는 모달과 화면에 고정되어 떠 있는 부품에만.

## Shapes

작고 단단한 모서리. 칩·작은 배지 4px(`rounded`), 버튼·입력창·셀렉트 6px(`rounded-md`), 카드·모달 8px(`rounded-lg`), 아바타·상태 점·알림 배지·'+' 버튼은 완전한 원. 16px 넘는 둥근 모서리는 랜딩 카드 같은 예외에만 쓴다.

**티어 카드 테두리**(`TierFrame`, `tier-frame.css`)는 이 체계의 유일한 장식 형태다. 깎인 모서리(chamfer 16px), 위 크레스트·모서리·아래 장식 조각, 상위 티어의 날개·빛이 카드 밖으로 나간다 — 그래서 감싸는 부모에 `overflow: hidden` 을 쓰지 않는다. 좁은 화면에서는 날개를 숨긴다.

## Components

### Buttons
단단하고 짧게 반응한다.
- **Shape:** 6px 모서리, 높이 40px(작은 버튼 32px), 아이콘과 글자 사이 6px.
- **Primary:** 로고 Sky 바탕 + Sky 잉크 글자, 600 굵기. 마우스를 올리면 밝기 110%.
- **Outline:** 투명 바탕 + 선 네이비 테두리. 올리면 테두리가 Sky 40%, 바탕이 흰색 5%.
- **Ghost:** 투명, 올리면 흰색 5% 바탕.
- **Danger:** 패배 코랄 바탕 + Sky 잉크 글자.
- **Press / Disabled:** 누르면 98%로 살짝 줄어든다(동작 줄이기 설정이면 없음). 비활성은 투명도 50%.
- **Focus:** 키보드 이동일 때만 Sky 2px 테두리, 2px 띄움.

### Chips
- **필터 칩:** 4px 모서리, 패널 바탕 + 슬레이트 글자. 선택되면 Sky 바탕 + Sky 잉크 글자(600). 올리면 글자만 밝아진다.
- **상태 배지:** 상태색 15~20% 바탕 + 같은 상태색 글자(승·패·대기·Sky).
- **접근성:** 선택이 색으로만 보이면 안 된다 — 칩·탭 버튼은 `aria-pressed`, 페이지 메뉴 링크는 `aria-current="page"`, 펼치는 버튼은 `aria-expanded`.
- **휴대폰 크기:** 좁은 화면에서 칩 높이 최소 40px(`min-h-10 md:min-h-0`), 아이콘만 있는 링크·버튼은 누르는 영역 36~40px.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** 패널 네이비. 카드 안 낮은 칸은 우물 네이비.
- **Shadow Strategy:** 없음(Flat-By-Default).
- **Border:** 1px 선 네이비.
- **Internal Padding:** 16px(넓은 화면 20px), 촘촘한 목록 카드는 12px. 누를 수 있는 카드는 올리면 흰색 5% 바탕.

### Inputs / Fields
- **Style:** 높이 40px, 6px 모서리, 우물 네이비 바탕, 선 네이비 테두리, 14px 글자, 슬레이트 안내 글자.
- **Focus:** 테두리만 Sky로 바뀐다(빛 번짐 없음).
- **Label:** 입력창 위 12px 500 슬레이트.
- 입력·셀렉트·여러 줄 입력이 같은 모양을 쓴다(`ui/input.tsx`).
- **이름표 연결:** `Label` 은 바로 뒤따르는 입력칸에 자동으로 연결된다(`htmlFor` 로 직접 지정도 가능). 이름표 없이 안내 문구(placeholder)만 있는 검색·메시지 칸은 `aria-label` 을 함께 준다.

### Navigation
- **상단바:** 56px, 반투명 패널 + 흐림, 아래 선. 넓은 화면 메뉴 글자는 14px 슬레이트, 현재 메뉴는 서리 글자.
- **세로 메뉴바(넓은 화면):** 폭 80px, 아이콘 20px 위 + 11px 이름 아래. 현재 메뉴는 Sky, 나머지 슬레이트. 맨 위에 48px Sky 원 '+' 버튼, 알림 숫자는 코랄 원 배지.
- **아래 탭바(좁은 화면):** 56px, 패널 바탕 + 위 선, 같은 아이콘·이름 구성, 현재 탭 Sky.

### Modal
패널 바탕, 8px 모서리, 선 테두리, 20px 여백, 기본 폭 448px(넓은 창 672px), 화면 높이 90%를 넘으면 안에서 스크롤. 제목 16px 700 + 오른쪽 닫기 X. ESC·덮개 클릭으로 닫힌다. 확인창은 오른쪽 아래에 Outline '취소' + Primary 확인.
- **접근성:** `role="dialog"`·`aria-modal`·제목 연결. 열리면 초점이 창 안(첫 입력칸, 없으면 창)으로 가고 Tab 은 창 안에서만 돌며, 닫히면 연 버튼으로 돌아간다(`useDialogFocus`, 공지 팝업·약관 동의 창도 같은 훅). 직접 덮개 창을 만들지 말고 `Modal` 이나 이 훅을 쓴다.

### 승패 줄 (Signature)
경기 한 줄 = 승패·상대·점수·기록 종류·날짜. 왼쪽 굵은 색 막대 대신 **줄 전체에 옅은 승(파랑)/패(코랄) 바탕**을 깐다. 좁은 화면에서는 두 줄로 내려 쓴다. 회원 상대는 초록 점, 비회원은 회색 점.

### 티어 엠블럼·카드 테두리 (Signature)
`public/tier/` 의 엠블럼 SVG 7종과 카드 테두리 조각(원본 `design/tier/`, 시안 A "마스크 크레스트"). `TierCircle`/`TierPill` 은 엠블럼 이미지, `TierFrame` 은 프로필 헤더 카드 전체를 감싼다. 티어가 없으면 일반 카드로 돌아간다.

### 등수 표시
1·2·3등 숫자는 메달 금·은·동 글자색(`rankColor()`), 랭킹 오른쪽 위 포디움도 같은 색.

## Do's and Don'ts

### Do:
- **Do** 색은 `globals.css` 토큰 이름으로만 쓴다(`bg-panel`, `bg-panel2`, `border-line`, `text-muted`, `bg-brand text-brand-ink`).
- **Do** 카드는 `rounded-lg border border-line bg-panel p-4` 한 모양으로 통일한다.
- **Do** 층은 바탕 밝기(심야 → 우물 → 패널)와 1px 선으로 나눈다.
- **Do** 상태 바탕은 상태색 10~20% 투명도로 옅게 깐다.
- **Do** 좁은 화면을 먼저 확인한다: 아래 탭바·'+' 버튼과 겹치지 않는지, 한 줄 항목이 두 줄로 잘 내려가는지.
- **Do** 동작 줄이기(`prefers-reduced-motion`) 설정이면 눌림·움직임을 끈다.

### Don't:
- **Don't** Sky 말고 다른 강조색을 만들지 않는다.
- **Don't** Sky·코랄 바탕 위에 흰 글자를 쓰지 않는다.
- **Don't** 순수 회색(#888, neutral-*, gray-*)을 쓰지 않는다 — 모든 중립색은 네이비로 물든다.
- **Don't** 카드·표에 그림자를 넣지 않는다.
- **Don't** 승패 줄에 왼쪽 굵은 색 막대를 쓰지 않는다(옅은 바탕으로 표시).
- **Don't** 티어 테두리를 감싸는 부모에 `overflow: hidden` 을 쓰지 않는다.
- **Don't** 외부 사이트(OP.GG 등)의 모양·문구를 그대로 따라 하지 않는다.
- **Don't** 외부 글꼴 CDN을 쓰지 않는다(Pretendard 는 npm 패키지).
