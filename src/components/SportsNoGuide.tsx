"use client";
// 체육인번호 찾는 방법 안내 (선수 연결 창 LinkAthleteModal 에서 사용).
// - 체육인번호는 협회 선수번호와 다른, 스포츠지원포털(g1.sports.or.kr)에서 발급되는 번호다.
// - 포털 경로(2026-10 확인): 로그인 → 상단 '내 생애주기' → 화면 속 '내 생애주기 개인정보' 영역의 '체육인번호'.
//   포털 화면이 바뀌면 아래 STEPS 문구만 고치면 된다.
// - 주의: 실제 번호를 예시로 적지 말 것(형식 설명만). 번호는 어디에도 저장하지 않고 이 화면은 안내 문구만 보여 준다.
import Link from "next/link";
import { ExternalLink } from "lucide-react";

/** 스포츠지원포털 주소 */
export const SPORTS_PORTAL = "https://g1.sports.or.kr/index.do";

// 안내 순서. 굵게 보일 부분은 [] 로 감싸 두었다가 아래에서 <b> 로 바꾼다
const STEPS = [
  "아래 [스포츠지원포털 열기]를 눌러 포털에 접속하고, 연결할 선수 본인의 계정으로 로그인해요. (계정이 없으면 포털에서 회원가입·본인 인증을 먼저 해야 해요)",
  "로그인한 뒤 상단 메뉴의 [내 생애주기]를 눌러요.",
  "화면 안의 [내 생애주기 개인정보] 영역에서 [체육인번호] 항목을 찾아요. 생년월일 6자리와 영문·숫자로 이어진 번호예요.",
  "번호를 그대로 복사해 이 창의 체육인번호 칸에 붙여넣어요. (영문은 대문자로 바뀌어 들어가요)",
];

/** [굵게] 표시를 <b> 로 바꿔 보여 주는 한 줄 */
function Line({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/g).map((part, i) =>
        part.startsWith("[") ? <b key={i} className="text-foreground">{part.slice(1, -1)}</b> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export function SportsNoGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-md border border-line bg-panel2 text-xs text-muted">
      <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-brand">체육인번호는 어디서 찾나요?</summary>
      <div className="space-y-2 border-t border-line px-3 py-3">
        <ol className="list-decimal space-y-1.5 pl-4">
          {STEPS.map((s) => <li key={s}><Line text={s} /></li>)}
        </ol>
        <a href={SPORTS_PORTAL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
          스포츠지원포털 열기 <ExternalLink size={12} />
        </a>
        <p>
          번호가 보이지 않거나 입력해도 연결되지 않으면 <Link href="/support?type=account" className="text-brand hover:underline">고객지원</Link>으로 알려 주세요.
          이 번호는 협회 선수번호와 다른 번호예요.
        </p>
      </div>
    </details>
  );
}
