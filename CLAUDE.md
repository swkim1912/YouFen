@AGENTS.md

# 유펜(YouFen) 프로젝트 메모

펜싱 전적 기록·검색·피드백 노트 서비스. 웹 먼저 개발하고 이후 앱으로 이식 예정.
스택: Next.js 16(App Router, 전부 클라이언트 컴포넌트) + TypeScript + Tailwind v4 + Supabase. shadcn/ui는 CLI 없이 `src/components/ui/`에 같은 스타일로 직접 작성.
원 기획서: `../YouFen/#유펜(YouFen) 웹 서비스 및 앱 개발 프롬프트.md` (`*` 표시 항목은 예외 처리 필수 규칙).

## 작업 방식 (사용자 요청)
- 사용자는 파이썬 기초만 알고 백엔드 이해도가 낮음 → **모든 코드에 상세한 한글 주석**, 수정 시 연관 영역(타입·API·UI)을 함께 언급하고 같이 수정.
- 화면 표시는 한글. 새 기능은 OP.GG 느낌(어두운 톤)을 유지.
- 푸시/배포는 사용자가 요청할 때만 한다.

## 환경
- Node.js는 winget으로 설치함. 새 셸에서 안 잡히면 `C:\Program Files\nodejs` 를 PATH에 추가.
- 검증: `npx tsc --noEmit`, `npm run lint`, `npm run build` (모두 통과 상태 유지).
- `.env.local`(gitignore 대상)에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. 양식은 `.env.example`.
- **secret/service_role 키는 절대 `NEXT_PUBLIC_` 변수나 코드에 넣지 않는다.**
- 배포: Vercel(`https://youfen.vercel.app`), GitHub `swkim1912/YouFen` (main).
  - Vercel 환경 변수의 Value에는 **값만** 입력해야 한다(`NAME=` 붙여넣기 사고가 있었음). `src/lib/supabase.ts`가 방어하지만 정확히 넣을 것. 변수 변경 후엔 Redeploy 필수.
  - Supabase Auth → URL Configuration에 배포 도메인과 localhost를 등록해야 구글 로그인/이메일 링크가 동작.
- Supabase 프로젝트 ref: `hocesfgcueioartmvbcp` (ap-northeast-2). 마이그레이션 내역은 `supabase/README.md`.

## 구조
- `src/lib/`: `supabase.ts`(클라이언트), `types.ts`(DB 타입), `records.ts`(기록 조회·뷰 변환·승률·상대 통계), `tier.ts`(티어 계산), `pool.ts`(Poole Sheet 순위), `utils.ts`(상수·닉네임 검증·`PUBLIC_COLS`)
- `src/components/`: `AuthProvider`(세션·내 프로필), `AppShell`(상단바+우측 메뉴바+가드), `PlayerPicker`(회원 검색/비회원 입력), `NewRecordModal`(`validateScore` 포함), `GameDetailModal`, `SettingsModal`, `ProfileView`(마이 펜싱·유저 검색 공용), `ProfileFields`, `BirthSelect`, `UserSearchBox`
- `src/app/`: `/`(마이 펜싱, 비로그인은 `/ranking`으로), `/login`, `/signup`, `/onboarding`, `/search`, `/ranking`, `/notes`, `/sheet/pool`(개인전), `/sheet/team`(단체전)

## 핵심 설계 결정 (지키거나, 바꿀 땐 관련 영역 전부 수정)
- **로그인 ID = 이메일.** 가입 1단계에서 `email_available` RPC로 중복 확인. 닉네임은 `nickname_available` RPC로 실시간 확인.
- **profiles의 `email`, `birth_date`는 컬럼 권한으로 비공개.** 다른 사람/비로그인은 못 읽음. 내 전체 프로필은 `get_my_profile()` RPC로만 조회. 그래서 `profiles`를 읽을 땐 `select("*")` 금지, `PUBLIC_COLS` 사용.
- **비로그인도 이용 가능**(랭킹·검색·기록지). 마이 펜싱/피드백 노트만 `AppShell requireAuth`로 로그인 요구. anon은 profiles 공개 컬럼과 `ACCEPTED` 오픈/대회 기록만 읽음.
- **game_records는 등록자(creator) 기준으로 저장** (`my_score`=등록자 점수). 보는 사람 기준으로는 `toView()`로 뒤집는다. 상대가 비회원이면 `opponent_id` null + `opponent_name` 텍스트만(동명이인을 하나의 ID로 합치지 않음).
- 기록 상태: `PRIVATE` / `PENDING`(오픈 수락 대기, 전적·티어 미반영) / `ACCEPTED`. 거절·취소·3일 만료 시 PRIVATE로 전환(`respond_record`, `cancel_pending_record`, `expire_pending_records` — 만료는 로그인 시 클라이언트가 호출). `ACCEPTED` 기록은 수정·삭제 불가(RLS).
- 점수 규칙: 무승부 금지, 두 선수 모두 목표 점수 이상 금지. **승자가 목표 점수에 못 미쳐도 저장 가능**(DB 제약 `score_valid` + `validateScore`가 같은 규칙, 한쪽만 바꾸지 말 것).
- 닉네임: 2~12자 한글/영문/숫자, 중복 불가, **30일에 1회 변경**(DB 트리거 `profiles_guard`가 강제). 대회 기록은 관리자(`is_admin`)만 DB에 입력.
- 선수 표시: 회원 = 녹색 점, 비회원 = 회색 점(`ui/dot.tsx`). "유저 아님" 문구는 쓰지 않음.
- 용어: 신분(`role`: 동호인/엘리트/전문선수/학부모/지도자), **종별**(`division`: 초등부/중등부/고등부/일반부 — 대학부 없음. 화면에서는 "부서" 대신 "종별"). 메뉴 이름은 "마이 펜싱".
- 랭킹: 신분(동호인 기본 → 엘리트 → 전문선수) × 성별 × 종목 × 종별 × 종합/오픈/대회 × 연도. 클라이언트에서 계산, 전적 비공개 유저 제외.
- 티어(`tier.ts`): 오픈 승 +20/패 -8, 대회 승 +40/패 -10 단순 가산, 7단계. 배치: 오픈 10경기 이상 또는 대회 2회 이상. Pistelog 방식은 아직 반영 안 됨.
- 개인전 기록지: 참가자 자동 입력 없음(지도자·관전자도 사용). 승자 칸은 목표 점수로 끝나면 `V`, 아니면 `V4`처럼 표시. 순위 = 승률 → 지수(득점-실점) → 득점, 동률은 공동 순위. 오픈 "등록"은 **내가 참가한 경기만**.
- 단체전 기록지: 팀명 직접 입력, 교체는 해당 팀 등록 선수 중 드롭다운 선택, 총점 검사는 **입력 확정(blur/Enter) 시점**에만(타이핑 중 검사 금지). 오픈 등록 기능 없음.
- Next 16 주의: middleware 대신 클라이언트 가드 사용. 데이터 로딩 `useEffect` 안 setState 린트 규칙(`react-hooks/set-state-in-effect`)은 의도적으로 끔.

## 현재 상태 (사용자가 작업 종료 시 GitHub에서 직접 갱신)
- 첫 푸시 및 배포 완료 (`https://youfen.vercel.app`)

## 다음 할 일 (TODO, 기존 PROGRESS.md에서 통합)
1. 대한펜싱협회 소속팀 파싱 및 연동 방법 구현
2. 선수정보 파싱 및 연동, 선수 고유번호 부여 알고리즘 설계
3. 대회정보 파싱 및 DB구축방법 설계
4. 대회 및 오픈게임 기록 점수화 로직 만들기

## 특이사항 / 참고
- 

## 미구현 / 나중에 할 일
- 소속: 현재 자유 입력 → **대한펜싱협회/자체 클럽 DB에서 선택**하도록 변경 예정
- 오픈피스트·커뮤니티·아카데미: 메뉴만 있고 "준비 중인 기능입니다" 토스트
- 친구 추가(현재 상대 선택은 전체 회원 닉네임 검색), 프로필 사진 업로드, 테두리/뱃지 실제 디자인
- 전적 비공개는 화면에서만 가림(DB 레벨 차단 아님), 대회 기록 파싱/관리자 입력 UI
- 앱 이식
- 가입 시 이메일 인증 설정(Supabase Authentication)과 구글 OAuth 공급자 설정은 대시보드에서 사용자가 직접 관리
