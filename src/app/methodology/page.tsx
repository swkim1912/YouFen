"use client";
// 점수 안내: 랭킹 제목 옆 '?' 아이콘이 연결되는 페이지(Pistelog 의 methodology 역할).
// 내 점수가 어떻게 계산되는지 납득할 수 있도록 단계별로 쉽게 설명한다. 자세한 설계 근거는 docs/SCORING.md.
// ※ 숫자(컷, 비율, 예시)는 DB 의 score_config 와 private.refresh_scores() 를 바꾸면 여기도 같이 고쳐야 한다.
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TIER_META } from "@/lib/fencing";

const TIERS = [
  { name: "챌린저", rule: "풀 안에서 점수 1~5위" },
  { name: "마스터", rule: "풀 안에서 점수 6~20위" },
  { name: "다이아몬드", rule: "450점 이상" },
  { name: "플래티넘", rule: "350 ~ 449점" },
  { name: "골드", rule: "250 ~ 349점" },
  { name: "실버", rule: "150 ~ 249점" },
  { name: "브론즈", rule: "149점 이하" },
] as const;

export default function MethodologyPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <div className="text-[10px] font-bold tracking-wide text-loss">SCORING SYSTEM</div>
          <h1 className="text-3xl font-extrabold">점수는 어떻게 계산될까요?</h1>
          <p className="mt-1 text-sm text-muted">대한펜싱협회 대회 결과로 한 대회의 성적을 점수로 바꾸고, 최근 기록을 더 크게 반영해 현재 실력 점수를 만듭니다.</p>
        </header>

        {/* 3단계 요약 */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "대회 점수", "한 대회의 성적을 0~1000점으로 바꿉니다"],
            ["2", "현재 점수", "여러 대회를 모아, 최근 대회를 더 크게 반영합니다"],
            ["3", "티어", "점수와 풀 안의 순위로 티어가 정해집니다"],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-lg border border-line bg-panel p-4">
              <div className="mb-1 text-xs font-bold text-brand">STEP {n}</div>
              <div className="font-bold">{t}</div>
              <div className="mt-1 text-xs text-muted">{d}</div>
            </div>
          ))}
        </div>

        <Card step="1" title="대회 점수" lead="한 대회의 성적은 뿔(예선) 20%와 ED(본선) 80%로 계산합니다.">
          <ul className="space-y-2 text-sm">
            <li><b>뿔 점수</b> — 전체 참가자 중 몇 등이었는지. 뿔 1등이면 만점, 꼴찌면 0점입니다.</li>
            <li><b>ED 점수</b> — 본선에서 몇 라운드를 통과했는지. 예선 탈락은 0, 본선에 올라가면 1단계, 한 라운드를 이길 때마다 1단계씩 늘어 우승이면 만점입니다. 같은 라운드에서 떨어지면 같은 점수입니다.</li>
            <li><b>작은 대회 보정</b> — 참가자가 적은 대회는 이기기 쉬우므로 점수를 줄여 반영합니다.</li>
          </ul>
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs text-muted"><tr className="border-b border-line"><th className="py-1.5 text-left font-normal">참가자 수</th><th className="text-right font-normal">3명</th><th className="text-right font-normal">4명</th><th className="text-right font-normal">8명</th><th className="text-right font-normal">12명</th><th className="text-right font-normal">16명 이상</th></tr></thead>
            <tbody><tr><td className="py-1.5 text-muted">반영 비율</td><td className="text-right">40%</td><td className="text-right">50%</td><td className="text-right">75%</td><td className="text-right">90%</td><td className="text-right font-bold">100%</td></tr></tbody>
          </table>
          <Example title="예시: 32명 참가, 뿔 5위, 8강 진출">
            뿔 점수 87.1 × 20% + ED 점수 50.0 × 80% = 57.4 → 대회 점수 <b>574점</b>
            <div className="mt-1 text-xs text-muted">ED 점수 50.0 = 32강 대회 전체 6단계 중 8강 진출이 3단계</div>
          </Example>
        </Card>

        <Card step="2" title="현재 점수" lead="여러 대회의 점수를 모아 현재 실력을 나타내는 점수 하나로 만듭니다.">
          <ul className="space-y-2 text-sm">
            <li><b>최근 대회를 더 크게</b> — 대회가 열린 지 12개월이 지날 때마다 반영 비중이 절반이 됩니다. (1년 전 대회는 50%, 2년 전은 25%)</li>
            <li><b>대회에 자주 나올수록 유리</b> — 최근에 많이 출전한 선수는 보너스를 받습니다. 최대 100점까지 늘어나며, 처음 몇 번의 출전에서 가장 크게 올라갑니다.</li>
            <li><b>기록이 적으면 조심스럽게</b> — 출전 기록이 적을 때는 한두 번의 우연한 성적이 점수를 좌우하지 않도록, 점수를 전체 평균 쪽으로 조금 끌어당깁니다. 대회를 거듭할수록 이 효과는 사라집니다.</li>
            <li><b>오래 쉬면</b> — 기준이 늘 &#39;오늘&#39;이라서 새 대회에 나가지 않으면 예전 대회의 비중이 줄고 점수가 서서히 내려갑니다.</li>
          </ul>
          <Example title="예시: 최근 대회부터 800점, 6개월 전 600점, 12개월 전 400점">
            <div>최근 대회 비중 1.00, 6개월 전 0.71, 12개월 전 0.50 → 가중 평균 <b>645점</b></div>
            <div>기록 보정 후 약 506점 + 참가 보너스 약 55점 = 현재 점수 <b>561점</b></div>
            <div className="mt-1 text-xs text-muted">같은 평균이라도 대회에 꾸준히 나온 선수가 한두 번만 나온 선수보다 조금 더 높게 평가됩니다.</div>
          </Example>
        </Card>

        <Card step="3" title="티어" lead="현재 점수와 풀 안의 순위로 티어가 정해집니다. 풀은 구분(동호인/엘리트/전문선수), 종별, 성별, 종목이 모두 같은 선수들의 묶음입니다.">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {TIERS.map((t) => (
              <div key={t.name} className="flex items-center gap-2 rounded-md bg-panel2 px-3 py-2 text-sm">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: TIER_META[t.name].color }} />
                <span className="w-20 font-semibold" style={{ color: TIER_META[t.name].color }}>{t.name}</span>
                <span className="text-muted">{t.rule}</span>
              </div>
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>· 챌린저와 마스터는 점수가 아니라 <b className="text-foreground">풀 안의 순위</b>로 정해집니다. 풀에 선수가 적으면 대부분이 챌린저·마스터가 될 수 있습니다.</li>
            <li>· 브론즈~다이아몬드는 점수로 정해집니다. 점수가 컷을 넘으면 자동으로 올라갑니다.</li>
            <li>· <b className="text-foreground">배치:</b> 시즌(2년) 안에 같은 풀에서 대회에 2번 이상 출전하면 티어와 순위가 부여됩니다. 그 전에는 &#39;배치 중&#39;으로 표시됩니다.</li>
            <li>· 점수 <b className="text-foreground">100점 차이</b>는 한 경기에서 이길 확률 약 64%, 200점 차이는 약 76%에 해당합니다.</li>
          </ul>
        </Card>

        <Card title="시즌 랭킹" lead="랭킹은 2년을 한 시즌으로 묶어 보여줍니다.">
          <p className="text-sm">예를 들어 2025-26 시즌은 2025년 1월부터 지금까지의 대회로 계산합니다. 지난 시즌은 그 시즌이 끝난 시점의 점수와 순위를 그대로 볼 수 있고, 해마다 새 시즌이 하나씩 추가됩니다. 시즌은 랭킹 화면의 드롭다운에서 고릅니다.</p>
        </Card>

        <Card title="오픈 랭킹과 종합 랭킹" lead="대회 점수와 오픈게임 점수를 함께 쓰는 랭킹도 있습니다.">
          <ul className="space-y-1.5 text-sm">
            <li>· <b>오픈 랭킹</b> — 유펜 회원끼리 확인한 오픈게임 결과로 계산합니다. 자기보다 강한 상대를 이기면 많이 오르고, 약한 상대를 이기면 조금만 오릅니다.</li>
            <li>· <b>종합 랭킹</b> — 대회 점수와 오픈 점수를 섞어 계산하며, 대회 점수를 조금 더 크게 반영합니다. 두 점수는 같은 눈금이라 같은 점수는 비슷한 실력을 뜻합니다.</li>
            <li>· 오픈게임만 하는 선수도 다이아몬드까지는 올라갈 수 있지만, 챌린저·마스터는 대회에 출전한 선수만 될 수 있습니다.</li>
            <li className="text-muted">오픈게임 기록은 아직 쌓이는 중이라, 지금은 종합 랭킹이 대회 랭킹과 같습니다.</li>
          </ul>
        </Card>

        <Card title="자주 묻는 질문">
          <dl className="space-y-3 text-sm">
            <Q q="왜 내 이름이 랭킹에 없나요?">대한펜싱협회 선수 등록(2021년~, 매년 새로 등록)이 그 시즌 기간 안에 한 번이라도 확인된 선수만 랭킹에 오릅니다. 그리고 시즌 안에 같은 풀에서 대회에 2번 이상 나와야 순위가 매겨집니다. 프로필에서는 순위가 없어도 대회 기록을 볼 수 있습니다.</Q>
            <Q q="대회 점수는 높은데 현재 점수가 더 낮아요">현재 점수는 여러 대회의 평균에 가깝고, 기록이 적을 때는 평균 쪽으로 조금 보정됩니다. 대회에 꾸준히 출전하면 그 보정이 사라지고 보너스가 붙습니다.</Q>
            <Q q="예선에서 떨어졌는데 점수가 0점이에요">예선 탈락 선수는 협회 결과에 뿔 순위와 최종 순위가 기록되지 않아, 그 대회 점수를 0점으로 계산합니다. 대회에 출전한 횟수는 그대로 인정됩니다.</Q>
            <Q q="모든 대회가 포함되나요?">대한펜싱협회 사이트에 결과가 올라온 대회를 2022년부터 모두 반영합니다. (실업·중고·대학 연맹 대회, 전국체전, 클럽·동호인 대회 등. 개인전 기준이며 단체전은 아직 반영하지 않습니다.)</Q>
          </dl>
        </Card>

        <p className="pb-4 text-center text-xs text-muted">
          <Link href="/ranking" className="text-brand hover:underline">← 랭킹으로 돌아가기</Link>
        </p>
      </div>
    </AppShell>
  );
}

function Card({ step, title, lead, children }: { step?: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-5">
      {step && <div className="mb-0.5 text-xs font-bold text-brand">STEP {step}</div>}
      <h2 className="text-lg font-bold">{title}</h2>
      {lead && <p className="mb-3 mt-1 text-sm text-muted">{lead}</p>}
      {children}
    </section>
  );
}

function Example({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-line bg-panel2 p-3 text-sm">
      <div className="mb-1 text-xs font-bold text-muted">{title}</div>
      {children}
    </div>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold">{q}</dt>
      <dd className="mt-0.5 text-muted">{children}</dd>
    </div>
  );
}
