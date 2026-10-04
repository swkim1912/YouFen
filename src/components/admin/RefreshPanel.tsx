"use client";
// 관리자: 협회 데이터(팀·선수·대회) 갱신. 버튼은 '갱신 요청'을 admin_jobs 에 넣을 뿐이고,
// 실제 수집은 DB 의 pg_cron 이 20초마다 private.advance_job() 으로 조금씩 처리한다(웹 요청은 몇 초 만에 끊기기 때문).
// - 모든 갱신은 이전과 달라진 것만: 새 팀(목록은 최신순이라 새 팀이 없는 쪽에서 멈춤), 새 선수 등록, 새 대회·최근 14일 안 대회의 정정 결과.
// - 진행 상황은 4초마다 다시 읽어 보여준다. 끝나면 늘어난 개수를 요약해 준다.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Job {
  id: number;
  kind: "teams" | "players" | "comps" | "all";
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  phase: string | null;
  progress: Record<string, unknown>;
  message: string | null;
  result: Record<string, number> | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const KIND: Record<Job["kind"], string> = { teams: "팀", players: "선수", comps: "대회", all: "전체" };
const STATUS: Record<Job["status"], string> = { queued: "대기 중", running: "진행 중", done: "완료", failed: "실패", cancelled: "중단됨" };
const PHASES: Record<Job["kind"], [string, string][]> = {
  teams: [["teams", "팀 목록"]],
  players: [["players", "선수 등록"], ["scores", "점수 계산"]],
  comps: [["comps_list", "대회 목록"], ["comps_events", "종목 등록"], ["comps_raw", "결과 수집"], ["comps_build", "결과 반영"], ["scores", "점수 계산"]],
  all: [["teams", "팀"], ["players", "선수"], ["comps_list", "대회 목록"], ["comps_events", "종목 등록"], ["comps_raw", "결과 수집"], ["comps_build", "결과 반영"], ["scores", "점수 계산"]],
};
const RESULT_LABEL: [string, string][] = [
  ["teams", "새 팀"], ["clubs", "새 클럽"], ["players", "새 선수"], ["registrations", "새 선수 등록"],
  ["competitions", "새 대회"], ["events", "새 종목"], ["entries", "새 참가 기록"], ["matches", "새 경기"],
];

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const summary = (r: Job["result"]) => {
  if (!r) return "";
  const parts = RESULT_LABEL.filter(([k]) => (r[k] ?? 0) > 0).map(([k, l]) => `${l} ${r[k]}`);
  return parts.length ? parts.join(" · ") : "달라진 것 없음";
};

export function RefreshPanel({ lastDone }: { lastDone: Record<string, string> }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("admin_jobs").select("*").order("id", { ascending: false }).limit(10);
    setJobs((data ?? []) as Job[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = jobs.find((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    const t = setInterval(load, active ? 4000 : 30000);
    return () => clearInterval(t);
  }, [active, load]);

  const start = async (kind: Job["kind"]) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_enqueue_job", { p_kind: kind });
    setBusy(false);
    const r = data as { ok: boolean; message?: string } | null;
    if (error || !r?.ok) return toast.error(r?.message ?? "요청하지 못했어요");
    toast.success("갱신을 요청했어요. 20초 안에 시작합니다");
    load();
  };
  const cancel = async (id: number) => {
    await supabase.rpc("admin_cancel_job", { p_id: id });
    load();
  };

  const CARDS: { kind: Job["kind"]; title: string; desc: string }[] = [
    { kind: "all", title: "전체 갱신", desc: "팀 → 선수 → 대회 → 점수 순서로 한꺼번에" },
    { kind: "teams", title: "팀", desc: "새로 등록된 팀만 추가, 기존 팀은 인원·연락처 갱신" },
    { kind: "players", title: "선수 등록", desc: `${new Date().getFullYear()}년 새 등록 선수만 추가` },
    { kind: "comps", title: "대회", desc: "새 대회 + 최근 14일 안 대회의 정정 결과만" },
  ];

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <h2 className="text-base font-bold">협회 데이터 갱신</h2>
      <p className="text-xs text-muted">대한펜싱협회 사이트에서 이전과 달라진 것만 가져옵니다. 요청하면 서버가 몇 분에 걸쳐 나눠 처리하니 창을 닫아도 계속 진행돼요.</p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <div key={c.kind} className={cn("flex flex-col rounded-md border bg-panel2 p-3", c.kind === "all" ? "border-brand/50" : "border-line")}>
            <div className="font-semibold">{c.title}</div>
            <div className="mt-0.5 flex-1 text-xs text-muted">{c.desc}</div>
            <div className="mt-2 text-[11px] text-muted">마지막 갱신: {lastDone[c.kind] ? fmtTime(lastDone[c.kind]) : "기록 없음"}</div>
            <Button size="sm" className="mt-2" variant={c.kind === "all" ? "primary" : "outline"} disabled={busy || !!active} onClick={() => start(c.kind)}>
              <RefreshCw size={14} />갱신
            </Button>
          </div>
        ))}
      </div>

      {active && <ActiveJob job={active} onCancel={() => cancel(active.id)} />}

      <div>
        <h3 className="mb-1.5 text-sm font-bold">최근 갱신 기록</h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted">아직 갱신한 기록이 없습니다</p>
        ) : (
          <ul className="space-y-1">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-panel2 px-3 py-1.5 text-xs">
                <span className="font-semibold">{KIND[j.kind]}</span>
                <span className={cn("rounded px-1.5 py-0.5", j.status === "done" ? "bg-win/20 text-win" : j.status === "failed" ? "bg-loss/20 text-loss" : "bg-white/10 text-muted")}>{STATUS[j.status]}</span>
                <span className="text-muted">{fmtTime(j.started_at ?? j.created_at)}</span>
                <span className="min-w-0 flex-1 text-muted">{j.status === "done" ? summary(j.result) : j.status === "failed" ? j.message : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActiveJob({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const phases = PHASES[job.kind];
  const cur = phases.findIndex(([k]) => k === job.phase);
  return (
    <div className="space-y-2 rounded-md border border-brand/40 bg-brand/5 p-3">
      <div className="flex items-center gap-2">
        <RefreshCw size={14} className="animate-spin text-brand" />
        <span className="text-sm font-semibold">{KIND[job.kind]} 갱신 {STATUS[job.status]}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onCancel}>중단</Button>
      </div>
      <ol className="flex flex-wrap gap-1 text-[11px]">
        {phases.map(([k, label], i) => (
          <li key={k} className={cn("rounded px-2 py-0.5", i < cur ? "bg-win/20 text-win" : i === cur ? "bg-brand text-white" : "bg-white/10 text-muted")}>{label}</li>
        ))}
      </ol>
      <p className="text-xs text-muted">{job.message}</p>
    </div>
  );
}
