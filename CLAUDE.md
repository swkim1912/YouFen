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
- `src/lib/`: `supabase.ts`(클라이언트), `types.ts`(DB 타입), `records.ts`(기록 조회·뷰 변환·승률·상대 통계), `tier.ts`(티어 계산), `pool.ts`(Poole Sheet 순위), `utils.ts`(상수·닉네임 검증·`PUBLIC_COLS`), `fencing.ts`(랭킹·대회·선수 화면 공용: 탭/종별/종목 상수, 티어 색, DB 행 타입, 라운드 이름·날짜 헬퍼, `fetchAll`)
- `src/components/`: `AuthProvider`(세션·내 프로필), `AppShell`(상단바+우측 메뉴바+가드), `PlayerPicker`(회원 검색/비회원 입력), `NewRecordModal`(`validateScore` 포함), `GameDetailModal`, `SettingsModal`, `ProfileView`(마이 펜싱·유저 검색 공용), `ProfileFields`, `BirthSelect`, `UserSearchBox`(회원+협회 선수 동시 검색), `AthleteView`(선수 프로필, ProfileView 와 같은 구성), `StatDonut`(승률 도넛 공용), `TierBadge`, `Podium`, `FilterRow`(한 줄 = 한 카테고리 필터), `EdBracket`(본선 ED 대진표)
- `src/app/`: `/`(마이 펜싱, 비로그인은 `/ranking`으로), `/login`, `/signup`, `/onboarding`, `/search`(회원+선수), `/ranking`(시즌·종류·풀별 점수 랭킹+포디움), `/methodology`(점수 안내), `/athletes/[id]`(선수 프로필), `/competitions`(대회 목록), `/competitions/[id]`(대회 상세), `/notes`, `/sheet/pool`(개인전), `/sheet/team`(단체전)

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
- **랭킹/대회/선수 화면(협회 대회 기록 기반)은 DB에 저장된 점수만 읽는다.** `pool_scores`(풀별 점수·티어·순위), `event_scores`(종목별 대회 점수), `comp_events.tab/age/start_date/winner_athlete_id`, `athletes.is_registered`. 계산은 `select private.refresh_scores();` (점수제도 설계는 아래 "점수제도 설계"·`docs/SCORING.md`, 컷·파라미터는 `score_config` 테이블). 새 대회 수집(`build_comp`) 후나 컷 변경 후에 다시 실행한다. 절차: `supabase/refresh_scores.sql`.
- 랭킹 화면: 종류(종합/오픈/대회, 기본 종합) × 구분(동호인/엘리트/전문선수) × 종별 × 성별 × 종목 — **필터는 한 줄에 카테고리 하나**(`FilterRow`), URL 쿼리에 유지. 시즌 드롭다운(`seasons` 테이블, 기본 현재 시즌). 제목 옆 `?` 아이콘 → `/methodology`. 우측 상단 포디움(1~3위), 시즌 안 대회 2회 이상 배치 완료 선수만 순위, "배치 중 선수 포함" 토글. 오픈 랭킹은 데이터가 없어 안내 문구만, 종합 = 대회(회원 연동 후 오픈/종합 데이터 연결). 행을 누르면 `/athletes/[id]?tab=&age=&weapon=&gender=&season=`.
- **시즌 = 2년 창**(2022-23, 2023-24, 2024-25, 2025-26(현재), 해마다 하나 추가). 시즌 점수는 그 시즌 창 안의 대회만, 날짜 가중 기준은 시즌 말(현재 시즌은 오늘). 배치 = 시즌 안 같은 풀에서 대회 2회. `pool_scores` 기본키에 `season` 포함(24개월 열 `ev24` 는 없어짐, `n_events` = 시즌 안 참가 수). 시즌별 티어 분포: 브론즈+실버 27.9/30.6/34.0/37.3%.
- 등수 색: 1등 금(#e5c14b), 2등 은(#c0c6d4), 3등 동(#cd8b4a) — `rankColor()` (랭킹·대회 결과·선수 프로필 공통).
- 선수 프로필(`AthleteView`): 헤더(풀 순위) → 티어(대회 탭만 활성, **종합/오픈은 유펜 회원 연동 후 열림**) → 최근 30경기 도넛·상대 → 뿔/ED 승률 → 점수 추이 → 소속 이력 → 대회 기록(경기 펼침) → 최근 전적. 원장 미등록 선수는 "랭킹 제외"로 기록만 표시. 회원 연동(본인인증) 시 같은 화면에 오픈 전적을 합칠 예정이며, 유저 전적검색(`ProfileView`)과 구성을 맞춰 두었다.
- 대회 화면: `/competitions` 는 탭×종별×성별×종목으로 그 종목이 열린 대회 목록(날짜·대회명·우승·참가). 상세는 최종 순위(이름·소속·뿔 순위·대회 점수·종합 점수 칸) → 예선 뿔 점수표 → 본선 ED 라운드별 카드(전문선수 대회의 예선 ED 는 접힘). 종합 점수 칸은 연동된 회원만 채울 예정이라 지금은 `-`. 경기 기록은 **뿔 / ED 탭**: 뿔은 선수×선수 점수표(목표 점수로 이기면 `V`, 미만이면 `V4`), ED 는 `EdBracket`(라운드 탭 + 4구역, 라운드 사이 연결선, 부전승은 다음 라운드 칸의 선수를 BYE 카드로 복원; 대진 번호가 이상하면 목록으로 대체). 참가 인원 = 실제 참가 기록 수(예선 탈락자 포함; 협회 최종순위 목록의 인원이 아님).
- 예선 탈락자는 협회 자료에 뿔 순위·최종 순위가 없어 대회 점수 0, 순위 `-`로 표시된다(사용자가 당분간 무시하기로 함).
- 구 랭킹(회원 오픈/대회 기록 기반 티어)과 `tier.ts`(단순 가산 점수)는 `ProfileView`(회원 전적검색)에만 남아 있다. 새 점수제도의 오픈 Elo·종합 점수는 회원 연동 후 구현하면서 교체한다.
- 개인전 기록지: 참가자 자동 입력 없음(지도자·관전자도 사용). 승자 칸은 목표 점수로 끝나면 `V`, 아니면 `V4`처럼 표시. 순위 = 승률 → 지수(득점-실점) → 득점, 동률은 공동 순위. 오픈 "등록"은 **내가 참가한 경기만**.
- 단체전 기록지: 팀명 직접 입력, 교체는 해당 팀 등록 선수 중 드롭다운 선택, 총점 검사는 **입력 확정(blur/Enter) 시점**에만(타이핑 중 검사 금지). 오픈 등록 기능 없음.
- Next 16 주의: middleware 대신 클라이언트 가드 사용. 데이터 로딩 `useEffect` 안 setState 린트 규칙(`react-hooks/set-state-in-effect`)은 의도적으로 끔.

## 협회 소속팀 연동 (진행 중)
- 소스: https://fencing.sports.or.kr/team/teamSearchList (POST `pageNum`, 10개씩, 1977팀). 상세 API(`/team/getTeamInfo`)에도 주소는 없음 → 팀명·시/도·번호·인원·팀코드만 수집 가능.
- `scripts/scrape_kff_teams.py`(수집) → `scripts/cluster_clubs.py`(동일 클럽 식별) → DB `clubs`(779) / `club_teams`(1977).
- 동일 클럽 규칙: 번호만 같다고 묶지 않음(운영자가 여러 클럽 운영). 이름 정규화(core) 일치 + 시/도 일치, 또는 번호 일치 + 이름 포함/유사. 시/도 빈 동호인 등록은 후보가 하나일 때만 흡수. 번호가 안 겹치는데 이름만 같아 묶인 클럽은 `confidence='medium'`(97개) → `data/clubs_review.json` 확인 필요.
- 아직 안 한 것: 가입/설정의 소속 입력을 `clubs` 선택으로 교체(profiles.affiliation → club_id), 대회 정보·결과 수집(`competitions` 등 테이블 설계 필요), 선수–대회 결과 연결, 사용자–선수 본인인증 연결.
- 협회 데이터에 "테스트팀", "과거팀" 같은 잡음 행이 있음(클럽 id 3,4,489~506 등) — 사용자 노출 시 필터링 필요.

## 협회 선수 연동 (완료: 선수 원장)
- 소스: `/player/profList` (POST `pageNum`, 10명/페이지, 448페이지, 4,479줄 → 선수번호 기준 4,477명). 이름은 협회가 모자이크(예: 김*원)한 상태로만 저장하며, **검색 등으로 실명을 복원하거나 막아 둔 상세 보기(`profView`)를 호출하지 않는다.**
- 각 행의 HTML 주석 안에 12자리 협회 선수번호가 있음(`kff_no`, Pistelog `kff-` ID 와 같은 형식). 1순위 외부 키로 사용.
- DB: `private.players`(내부 전용 스키마). 협회 선수번호·생년월일·모자이크 이름은 **사용자에게 절대 직접 노출 금지** — 동명이인 구분과 내부 데이터 처리에만 사용. 선수 데이터를 git 에 커밋하지 말 것(생년월일 포함).
- 대회 결과 수집은 아래 "대회 결과 수집" 섹션 참고. 결과 JSON 의 `plyCd` 가 `kff_no` 와 같은 번호라 선수 연결은 이름 추정 없이 번호로 정확히 한다.
- 티어 계산 알고리즘은 사용자가 나중에 갱신 예정(지금은 손대지 않음).
- **결정(중요): 협회 상세 보기(`profView`)로 실명을 받아오지 않는다.** 협회가 이름을 가리고 링크를 막아 둔 것이므로 선수번호로 우회 호출하지 않고, 검색으로 모자이크를 복원하지도 않는다(사용자가 요청했으나 거절하고 합의). 실명은 **대회 결과 페이지(공개)** 에서 얻는다.
- 연결 결과: 대회 결과 응답에 선수번호(`plyCd`)가 함께 내려와 `private.players.kff_no` 와 번호로 연결(2026 FILA배: 737명 중 736명 일치, 이름 모양 불일치 0건). 번호는 `private.athlete_keys` 에만 두고 public 에는 두지 않는다. 대회에 출전하지 않은 선수는 모자이크 이름만 보유.
- 본인인증 연결(나중): 본인인증으로 받은 실명·생년월일·성별을 `players` 의 모자이크 이름 모양 + 생년월일 + 성별(+ 가입 시 고른 클럽)과 비교. 현재 DB 기준 생년월일+성별+이름 모양으로 99.6% 유일하게 정해지고 18명(9쌍)만 모호 → 수동 확인/클럽 선택으로 처리. 인증 생년월일은 비교 결과(일치 여부)만 저장하는 것을 권장.

## 대회 결과 수집 (완료: 2022-01 ~ 2026-09 개인전 96개 대회, 동호인·전문선수·학생·대학·실업·전국체전 포함)
- 대회 목록 `POST /game/compList?code=game` (`pageNum`, 행 안의 `funcView('COMPMxxxxx','2')`), 대회 상세 `POST /game/compListView?code=game` (`eventCd`, `gubun=2`) 응답의 `<option value="COMPS…">` 가 세부종목. 종목 이름 끝의 `(개)`=개인전, `(단)`=단체전 — **단체전은 아직 수집하지 않음.** **JSON API 는 쿠키 없이 호출 가능:**
  - 최종 순위 `POST /game/finishRank` (`eventCd, subEventCd, eventTypeCd=KH090102, ruleMasterNm=A`) → `resultList`(rankNo, plyCd, plyNm, teamNm)
  - 예선 뿔 `POST /game/gameRoundList` (`…&rankCd=final&leftSub=3&roundNo=N`) → 뿔별 `pouleVO`(bbulGrp, 심판) + `pouleList`(g1..g7 행렬, winRate, jisu, total, rankNo). 셀: `V`=5점 승, `V1~V4`=해당 점수 승, 숫자=패배 시 득점, `#`=본인, `A`/`X`=기권·불참
  - 본선 ED `POST /game/getMatchDtlInfoList` (`…&ruleMasterNm=A&firstGrpSize=512&lastGrpSize=2`) → `groupKindList[].matchInfoList`(grpSize, compMatSym, up/down PlyCd·PlyNm·TeamNm·Score, winGbn=1 위/2 아래). **`ruleMasterNm` 을 비우면 빈 응답** — `getTableauGrpDtlList` 의 `ruleGroupList[].ruleGroup` 값(A, B …)을 그룹마다 따로 호출해야 함. 부전승 칸은 이름 빈 가짜 선수번호가 오므로 제외.
  - **ED 그룹 구조(대회 종류별):** 동호인·학생·대학 등 대부분 = 그룹 A 하나(본선). **전문선수 대회**(국가대표 선발전, 대통령배, 김창환배, 종목별 오픈; 24개 대회) = A가 "32명의 면제자가 있는 예선 엘리미나시옹"(256→64강, DB stage `EDQ`), B가 "본선 64강→결승"(stage `ED`). **유소년 국가대표 선발전** = A 본선, B가 3·4위전 1경기(`comp_matches.third_place=true`). 종목 이름 형식도 다름: `일반부 남자 에뻬(개)` / `남고·여중·남초·여일·남대 …(개)` 약어 / 종별 없는 `남자 에뻬(개)`(전문선수 → division null) / `15세이하부` 등.
  - **개인전은 대회 유형과 무관하게 `eventTypeCd=KH090102` 로 조회**(소년체전은 대회 유형이 KH090103 이라 그 값을 쓰면 빈 응답). 소년체전 등 일부 대회는 예선 뿔 없이 바로 ED.
- 수집은 DB 안에서 서버 측(`http` 확장)으로: `private.scrape_comp_list(기준일)` → `scrape_comp_events(대회코드)`(개인전만 등록) → `scrape_comp_event(대회코드, 종목코드)`(종목당 약 5초, 20~40개씩, 4개 병렬) + `scrape_comp_ed`(ED 전체 그룹 재수집) → 원문 `private.comp_raw`(jsonb) → `private.build_comp(대회코드)` 가 정규화(멱등). 절차는 `supabase/refresh_competitions.sql`. 클럽 연결은 `private.club_core`(정규화 이름→클럽, 모호하면 제외) 조회표 사용.
- 테이블(public, 읽기 전용 RLS): `competitions`(event_type_cd), `comp_events`(종별/성별/무기, has_ed), `athletes`(실명·성별·클럽), `comp_entries`(예선 승/경기/지수/득점/순위 + 최종순위), `comp_matches`(stage POULE/EDQ/ED, 점수, 승자, third_place). 내부: `private.athlete_keys`(athlete_id↔kff_no), `private.comp_raw`, `private.club_core`.
- 현황(2026-10-04 수집): 대회 96개(2022-01-19~2026-09-05) 중 95개 결과, 종목 1,681개(결과 있는 1,607), 선수 7,993명(원장 일치 3,931 / 원장에 없는 선수 4,062 — 원장은 현재 등록 선수만 있어 학생·과거 선수는 이름만 있음), 참가 75,066건, 예선 198,884경기, 예선ED 6,840경기, 본선ED 49,629경기(+3·4위전 30). 같은 이름 선수 그룹 994개(동명이인, 선수번호로 구분), 참가 기록의 소속팀 → 클럽 연결 96.5%.
- 검증: 종목마다 본선 ED 경기 수 = 본선 참가자 − 1, 챔피언 = 본선 ED 결승 승자(전부 일치), 3·4위전 승자 = 최종 3위(30/30), 예선 경기 수 = 원문 숫자 셀 수. 예선 승자 점수가 더 높지 않은 80건은 전부 동점(우선권 승부, `V3` 대 `3`). 예선 탈락자는 최종순위 목록에 없어 `final_rank` null(예선 순위만 있음). 공동 3위 등 동률 순위는 같은 값.
- 주의: 최종순위 응답에 생년월일(`birthDate`)도 오지만 저장하지 않는다(필요한 값은 원장에 이미 있음). 미완: **단체전 `(단)` 미수집**(경기 형식이 달라 별도 설계), 제51회(2022) 전국소년체육대회는 단체전만 있어 종목 0개, 2021년 이전 대회 미수집(목록상 251개 중 96개만 수집), 소속팀명 → 클럽 연결은 정규화 이름 일치만(미일치는 `club_id` null), 새 대회 반영은 `refresh_competitions.sql` 재실행.

- **사용자 결정(2026-10-04):** ① 단체전은 수집하지 않고 논외로 둔다. ② 협회 선수 원장(`private.players`)에 없는 선수는 **결과 데이터에서 지우지 않고 랭킹 산정에서만 제외**(원장 등록 여부는 `athlete_keys` ↔ `players` 조인으로 판단). ③ 예선 탈락자의 `final_rank` null 은 당분간 무시.
- **연도별 선수 등록(2026-10-04):** 협회는 선수등록을 매년 새로 받으므로 `https://fencing.sports.or.kr/player/profList` 의 `regYear`(2021~2026)별로 모두 수집해 `private.player_regs(kff_no, year, …)` 에 저장(`private.scrape_player_year(year, from_page, to_page)`, 130페이지 단위로 호출, 빈 페이지에서 멈춤). 번호(kff_no)는 연도가 바뀌어도 같은 사람에게 유지됨(생년·성별 충돌 0건) → 사람은 `private.players` 1행. 총 10,477명(2021 1,811 / 2022 3,909 / 2023 4,504 / 2024 4,966 / 2025 5,129 / 2026 4,477). `private.sync_athlete_registration()` 이 `public.athletes.reg_years int[]`(공개, 번호 아님)와 `is_registered`(= 2021~ 한 해라도 등록)를 채운다. **시즌 랭킹은 그 시즌(2년) 창 안에 등록한 해가 있는 선수만 포함**(refresh_scores 4단계). 새 연도 등록자 수집은 해당 연도로 `scrape_player_year` 를 다시 실행 후 `refresh_scores()`. 협회 목록 자체에 번호 없는 행이 연도별 0~21건 있어 저장 불가(2026 원본도 동일).
- **동명이인 분석:** 선수 식별은 이름이 아니라 협회 선수번호(`athlete_keys`)라서 결과·랭킹이 섞이지 않는다(같은 종목에 동명이인이 함께 출전한 경우 667건 — 이름만으로는 키가 안 됨). 원장 등록 선수끼리 이름이 같은 865쌍은 성별이 다르거나(157) 생년월일이 다르다(708, 생년월일까지 같은 쌍 0건) → 전부 다른 사람. 성별·클럽까지 같은 쌍은 5쌍(10명, 생년 차이 최소 365일)뿐이라 화면에서는 클럽·시/도·출전 대회로 구분하고 생년월일은 노출하지 않는다. **남은 위험:** 한 사람이 번호를 둘 가진 경우(재등록) — 원장 선수와 비원장 선수가 이름·성별·클럽이 같고 같은 대회에 함께 나온 적이 없는 쌍이 11개(비원장 쪽 옛 번호의 기록이 랭킹에서 빠짐). 필요하면 번호 병합표를 만들어 처리.

## 점수제도 설계 (2차 설계안, 미구현 — 전문은 `docs/SCORING.md`, 재현 SQL은 `supabase/scoring_simulation.sql`)
- 눈금 **YP 0~1000**: 100점 차 ≈ 한 경기 승률 64% (대회 경기 25만 건으로 측정한 값이 표준 Elo 나누는 수 400과 거의 일치). 컷 **브론즈 0 · 실버 150 · 골드 250 · 플래티넘 350 · 다이아 450**, 컷은 대회/오픈/종합 모두 공통(설정값으로 두고 출시 후 50점 단위 조정 가능).
- **챌린저 = 풀 종합 점수 1~5위, 마스터 = 6~20위. 점수 하한 없음**(작은 풀은 대부분이 챌린저/마스터가 되는 것을 사용자가 허용). 순위 경쟁은 같은 풀에서 24개월 대회 2회 이상(배치 완료)한 선수끼리만. **오픈게임만 하는 선수는 최고 다이아.** 강등은 25위 밖일 때만.
- 예상 비율(대회 점수, 원장 등록·배치 5,074건): 챌린저 5.3 · 마스터 13.8 · 다이아 4.8 · 플래티넘 16.2 · 골드 22.0 · 실버 25.1 · 브론즈 12.9 (브론즈+실버 37.9%). 풀이 작으면 챌린저/마스터가 대부분, 풀이 커질수록 다이아 증가(100~199명 풀 4.2%, 200명 이상 8.8%). 동호인 일반부는 현재 풀당 92명이라 다이아 0% (풀이 커지면 생김). 전문선수 일반부는 브론즈+실버 49.5%.
- 대회 점수: Pistelog 방식(뿔 20%+ED 80%, 12개월 반감) + 소규모 대회 보정 `min(1, log2 N/4)` + 사전평균 수축(k=1, μ0=20 — 20이 28·35보다 예측 우수) + 참가 보너스 `B(1−0.7^n)`(B=10) → `T = 10×[(nM+20)/(n+1) + 10(1−0.7^n)]`. 기준 시점은 오늘. 예측력 검증에서 Pistelog 원형보다 좋음(동호인 0.5642→0.5606, 전문 0.5826→0.5779). 협회 사이트의 대회는 주최 무관 전부 반영.
- 오픈게임: Elo(나누는 수 400, K 64→40→24, 5점제 0.75/10점제 0.9/15점제 1.0 가중, 같은 상대 반복 감쇠), ACCEPTED·OPEN 경기만, 종목별. **`game_records` 에 `weapon` 컬럼이 없어 추가 필요**, 프로필에 랭킹 탭 선택 필요. 시작점 = 본인 **홈 풀**(프로필 탭·종별) 대회 점수(없으면 200). 오픈 점수는 (회원, 종목) 하나라 상대의 풀·종별과 무관하게 점수 차이로만 계산(득점차 미반영). 풀마다 대회 점수 눈금이 다름(같은 선수 기준 전문 중등→일반 −109 등) — 같은 점수 = 같은 실력은 같은 풀 안에서만 성립. 오픈 데이터가 아직 6건뿐이라 K는 대회 경기 백테스트 기준 초기값.
- 종합: `C = (1.5·n/(n+1)·T + m/(m+15)·O) / (합)`. (1차안의 ×0.95 감점은 오픈만 → 다이아 상한 규칙으로 대체)
- **풀 = 탭(동호인/엘리트/전문선수) × 종별(초등·중등·고등·일반) × 종목 × 성별 = 54개.** 클럽·동호인 대회의 엘리트부 = 엘리트 탭, 그 외 클럽·동호인 대회 = 동호인 탭, 협회·연맹 대회 = 전문선수 탭. 고등부 초과(대학·일반·오픈·실업·엘리트·20세이하)는 전부 일반부, 연령부는 9·11·12세이하=초등, 13·15·16세이하=중등, 17·18세이하=고등. 랭킹 대상은 원장 등록 선수만(미등록 선수는 상대·참가 인원으로만 사용).

## 계정·프로필 기능 (2026-10-04: 소속 선택, 선수 연결, 프로필 사진, 티어 테두리)
- **소속 선택:** `components/ClubPicker.tsx` — 가입(2단계)·구글 온보딩·상세 설정 공통(`ProfileFields`). clubs 검색 후 선택, "선택안함"이면 `affiliation='무소속'`, `club_id=null`. 저장: `profiles.club_id`(+`affiliation` 이름 문구). 가입 트리거(`handle_new_user`)가 메타데이터 `club_id` 를 받고 실제 존재하는 클럽만 저장.
- **선수 연결(마이페이지 > 상세정보 탭, `LinkedAthletes`/`LinkAthleteModal`):** 이름 검색 → 소속·등록연도로 확인 → 등록 연도 + **체육인번호**(스포츠지원포털 발급, `생년월일6자리-영문·숫자` 형식, 협회 선수번호 kff_no 와 **별개**. ※ 화면·문서·코드에 실제 번호를 예시로 넣지 말 것) 입력 → RPC `link_athlete(athlete_id, reg_year, sports_no)`. 번호 앞 6자리=생년월일, 7번째=성별/세기 코드(홀수 남·짝수 여, 1·2·5·6=1900년대, 3·4·7·8=2000년대)라서 **원장(private.players)의 생년월일·성별과 대조**한다. 번호는 `private.athlete_sports_no`(선수당 처음 성공한 번호를 영구 보관, 번호 unique)에만 저장하고 어떤 화면에도 내보내지 않는다. 규칙: 선수 1명 = 계정 1개(`public.athlete_links.athlete_id` 기본키), 계정 1개 = 여러 선수(최대 10, 학부모-자녀), 연결 해제 `unlink_athlete`, 탈퇴하면 연결 자동 해제(cascade) → 같은 번호로 재연결 가능, 다른 번호는 불일치, 이미 다른 계정에 연결되면 `taken` + 문의(`athlete_claim_requests`), 1시간 8회 실패 시 잠금(`private.link_attempts`). `athletes.is_linked`(연결 여부만 공개). **한계:** 체육인번호는 외부에서 검증할 수 없어 처음 연결한 사람이 번호를 정한다(생년·성별은 대조) → 잘못 선점되면 문의로 관리자가 해제해야 함(관리자 페이지 필요). 중복 등록(번호 2개인 사람)은 번호 병합표로 처리 예정.
- **프로필 사진:** `avatar_url` = null(소속팀 이미지 `clubs.image_url`, 없으면 소속팀 첫글자, 무소속이면 닉네임 첫글자) / `default:1`(기본 프로필 한 가지: 회색 배경 흰 사람 실루엣) / https(직접 올린 사진). `components/Avatar.tsx`, `AvatarSettings.tsx`(상세 설정 모달 안), `AvatarReport.tsx`(신고 + 관리자 삭제). **올린 사진은 반드시 서버 API `/api/avatar`**(`src/app/api/avatar/route.ts`)를 거친다: 로그인 확인 → 실제 형식(jpeg·png·webp) 검사(사용자는 원본 12MB 까지 고르고 **`AvatarEditor`(끌어 이동·확대 슬라이더·좌우/상하·전체 보기/꽉 채우기/초기화, 점선 원=작은 프로필 범위)에서 조정해 512×512 PNG 로 만들어 보냄** — Vercel 본문 한도 4.5MB, 서버는 4MB 로 재검증 후 512px webp 저장) → EXIF 제거·512px webp 재인코딩(sharp) → **Google Vision SafeSearch** 검열(adult≥POSSIBLE, racy/violence≥LIKELY 거절, 검사 실패 시 거절=fail closed) → 버킷 `avatars` 저장. **비용 보호:** Vision 은 월 1,000건 무료 후 유료 → 호출마다 `avatar_vision_calls` 에 기록해 사용자당 24시간 2회, 전체 월 950건(`VISION_MONTHLY_LIMIT` 로 조정)에 닿으면 사진 올리기를 막는다(거절된 시도도 호출로 센다, 기본 프로필/소속팀 이미지 전환은 제한 없음). 클라이언트는 버킷에 직접 못 쓰고(쓰기 정책 없음), DB 트리거 `guard_avatar_url` 이 일반 사용자의 `avatar_url` 를 null/`default:N` 으로만 바꾸게 막는다. 신고 `avatar_reports`(관리자만 읽음), 관리자 삭제는 `DELETE /api/avatar?target=<uid>` 또는 RPC `admin_remove_avatar`(+`avatar_locked` 로 이후 등록 차단). **서버 환경변수 필요:** `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_VISION_API_KEY` (로컬 `.env.local` + Vercel). 없으면 올리기는 "준비 중" 503 으로 닫힌다. 소속팀 이미지는 관리자 페이지가 생기면 관리자가 등록/지도자 요청 승인(지금은 `clubs.image_url` 컬럼만 있음).
- **연결된 선수 ↔ 회원 통합 표시:** `athletes.linked_profile_id`(공개, 회원 id 만; `athlete_links` 트리거가 유지)로 합친다. 조건: 연결된 회원이 있고 신분이 **학부모가 아님**(자녀 여러 명 연결 가능해 회원 전적이 누구 것인지 모호하므로 합치지 않음 — `lib/members.ts` `isMergeable`). 합쳐지면 ① 닉네임으로 검색해도 선수 페이지(`/athletes/[id]`)로 연결(`/search`·상단 `UserSearchBox` 모두, 결과가 합쳐진 선수 1명뿐이면 바로 이동), 실명 검색에도 `이름 (닉네임)` 표시 ② 선수 페이지 헤더에 닉네임·회원 아바타, 티어 카드의 종합/오픈 탭 활성(종합=대회 점수, 오픈=집계 전 안내) ③ **소속 이력과 대회 기록 사이에 `MemberRecords`**: 회원이 입력한 전적(오픈·대회·프라이빗)과 **협회 대회 경기**를 같은 양식(승패·상대·점수·기록 종류·날짜)의 한 목록(`lib/members.ts` `FeedRow`)으로 합쳐 종합/오픈/대회(회원 대회 전적 + 협회 대회 경기)/프라이빗(본인만) 필터로 보여줌. 회원 전적 비공개면 본인 외엔 회원 전적만 숨김(협회 경기는 공개). ④ 최근 추이·상대별 승률도 이 통합 목록(최근 30경기)으로 계산. 기존 선수 경기 목록 제목은 "최근 대회 경기". ⑤ **마이 펜싱 탭(`src/app/page.tsx`)**: 선수가 연결된 회원(학부모 제외)은 종합 탭에 `AthleteView own={profile}` 를 쓴다(티어 카드 테두리·점수·추이·통합 전적·피드백 노트·설정 버튼·전적 상세/수정 `GameDetailModal`). 연결 선수가 여러 명이면 이름 칩으로 선택. 연결 없음/학부모는 기존 `ProfileView`.
- **주의(profiles 컬럼 권한):** `profiles` 는 **컬럼 단위 SELECT 권한**이라 `PUBLIC_COLS`(`src/lib/utils.ts`)에 컬럼을 추가하면 `grant select (컬럼) on public.profiles to anon, authenticated` 도 같이 해야 한다(안 하면 닉네임 검색 등 해당 쿼리가 통째로 실패해 빈 결과가 됨 — `club_id`/`avatar_locked` 추가 때 한 번 발생).
- **티어 테두리·엠블럼:** 디자인 원본 `design/tier/`(다른 Claude 세션이 만든 시안 A "마스크 크레스트": 엠블럼 SVG 7종, 카드 테두리 조각, tokens.json, preview.html). 사이트 사용분은 `public/tier/`(에셋)와 `src/app/tier-frame.css`(스타일, 원본 + 모바일 날개 숨김 보정). `components/TierFrame.tsx` 가 프로필 카드 **전체**를 티어 테두리로 감싼다(티어 없으면 일반 카드). 선수 프로필(`AthleteView`)·회원 프로필(`ProfileView`)의 헤더 카드에 적용, `TierBadge` 의 `TierCircle`/`TierPill` 은 엠블럼 이미지로 교체. 장식이 카드 밖으로 나가므로 부모에 overflow:hidden 금지.

## 현재 상태 (사용자가 작업 종료 시 GitHub에서 직접 갱신)
- 팀, 선수, 대회정보 연동 완료
- 점수 로직 설계 완료
- 랭킹, 대회 탭 만들기 완료

## 다음 할 일 (TODO, 기존 PROGRESS.md에서 통합)
- 디자인 개선
- 관리자 메뉴 + **협회 데이터 갱신 버튼**: 대회·점수는 DB 함수(`scrape_comp_*`, `build_comp`, `refresh_scores`)가 있고 새 종목만 받는 증분 수집은 동작하지만 한 번에 20~40종목씩 반복 호출해야 한다(웹에서 부르는 RPC 는 몇 초 만에 끊김). 선수는 목록 수집 함수만 있고 파싱은 SQL 파일(`refresh_players.sql`), 팀은 파이썬 스크립트뿐. 버튼 구현 방향: '갱신 요청' 테이블 + 정기 실행 작업(pg_cron 또는 Supabase Edge Function)이 나눠 처리 + 진행 상황 표시. 팀 수집은 DB 함수로 이식 필요, 최근 대회의 정정 결과 재수집 규칙도 필요.
- 회원가입 시 이메일 인증 및 약관동의

## 특이사항 / 참고
- 

## 미구현 / 나중에 할 일
- 오픈피스트·커뮤니티·아카데미: 메뉴만 있고 "준비 중인 기능입니다" 토스트
- 친구 추가(현재 상대 선택은 전체 회원 닉네임 검색), 프로필 사진 업로드, 테두리/뱃지 실제 디자인
- 전적 비공개는 화면에서만 가림(DB 레벨 차단 아님), 대회 기록 파싱/관리자 입력 UI
- 앱 이식
- 가입 시 이메일 인증 설정(Supabase Authentication)과 구글 OAuth 공급자 설정은 대시보드에서 사용자가 직접 관리

