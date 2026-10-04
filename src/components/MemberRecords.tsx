"use client";
// 선수 페이지에 합쳐지는 '최근 전적': 유펜 회원이 입력한 전적(오픈·대회·프라이빗)과 협회 대회 경기를 같은 양식으로 보여준다.
// 필터: 종합(전부) / 오픈 / 대회(회원이 입력한 대회 전적 + 협회 대회 경기) / 프라이빗(본인만).
// 전적 비공개(hidden)면 본인 외에는 회원 전적이 빠지고(협회 대회 경기는 공개 자료라 그대로), 안내 문구만 보인다.
import { useState } from "react";
import { Dot } from "./ui/dot";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { FeedRow } from "@/lib/members";
import { cn } from "@/lib/utils";

type Filter = "ALL" | "PRIVATE" | "OPEN" | "TOURNAMENT";
const LABEL: Record<Filter, string> = { ALL: "종합", OPEN: "오픈", TOURNAMENT: "대회", PRIVATE: "프라이빗" };

export function MemberRecords({
  rows, nickname, isMe, hidden, loading, onSelect,
}: {
  rows: FeedRow[];
  nickname: string;
  isMe: boolean;
  hidden: boolean; // 회원 전적을 숨김 중(본인 제외)
  loading: boolean;
  onSelect?: (row: FeedRow) => void; // 본인이 회원 전적 줄을 눌러 상세·수정
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [oppQ, setOppQ] = useState("");
  const [shown, setShown] = useState(10);

  const list = rows
    .filter((r) => (filter === "ALL" ? true : r.kind === filter))
    .filter((r) => (oppQ.trim() ? r.oppName.includes(oppQ.trim()) : true));

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-2 font-bold">최근 전적 <span className="text-xs font-normal text-muted">유펜 회원 · {nickname}</span></h3>
        {(["ALL", "OPEN", "TOURNAMENT", ...(isMe ? (["PRIVATE"] as const) : [])] as Filter[]).map((f) => (
          <button key={f} onClick={() => { setFilter(f); setShown(10); }} className={cn("rounded px-2.5 py-1 text-xs", filter === f ? "bg-brand font-semibold text-brand-ink" : "text-muted hover:bg-white/5")}>
            {LABEL[f]}
          </button>
        ))}
        <Input className="ml-auto h-8 w-40" placeholder="상대 이름 검색" value={oppQ} onChange={(e) => setOppQ(e.target.value)} />
      </div>
      {hidden && <p className="mb-2 rounded bg-panel2 px-3 py-2 text-xs text-muted">해당 유저는 유펜 전적(오픈·프라이빗 등)을 비공개로 설정했습니다. 협회 대회 경기만 표시됩니다.</p>}
      {loading ? (
        <p className="py-4 text-center text-sm text-muted">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">기록이 없습니다</p>
      ) : (
        <div className="space-y-1.5">
          {list.slice(0, shown).map((r) => {
            const clickable = !!onSelect && !!r.rec;
            return (
              <button
                key={r.key}
                disabled={!clickable}
                onClick={() => onSelect?.(r)}
                className={cn("w-full rounded-md py-2 pl-4 pr-3 text-left text-sm", r.pending ? "bg-pending/[0.08]" : r.win ? "bg-win/[0.08]" : "bg-loss/[0.07]", clickable && "hover:brightness-125")}
              >
                <span className="flex items-center gap-3">
                  <span className={cn("w-8 shrink-0 font-bold", r.win ? "text-win" : "text-loss")}>{r.pending ? "대기" : r.win ? "승" : "패"}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5"><span className="shrink-0">vs</span><Dot member={r.oppIsMember} /><span className="truncate">{r.oppName}</span></span>
                  <span className="shrink-0 font-semibold">{r.mine ?? "-"} : {r.theirs ?? "-"}</span>
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">{r.kindLabel}</span>
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">{r.dateText}</span>
                </span>
                {/* 좁은 화면 둘째 줄: 기록 종류 · 날짜 */}
                <span className="mt-0.5 flex gap-2 pl-11 text-xs text-muted sm:hidden"><span>{r.kindLabel}</span><span className="ml-auto">{r.dateText}</span></span>
              </button>
            );
          })}
        </div>
      )}
      {shown < list.length && <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setShown((s) => s + 10)}>더보기</Button>}
    </section>
  );
}
