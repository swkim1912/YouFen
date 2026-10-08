"use client";
// 관리자: 오픈피스트 승인 (docs/COMMUNITY.md 5장·6장)
// - 목록: admin_op_queue — 새 모집(승인 대기)과 게시 중인 글의 수정 요청. 오래된 요청부터.
// - 새 모집: 내용 전체 + 주최자 유펜 닉네임·지난 모집 수. 승인하면 게시되고 주최자·새 모집 알림을 켠 회원에게 알림이 간다.
// - 수정 요청: 바뀐 항목만 '지금 → 수정안'으로 보여 준다. 승인하면 반영되고 참가자에게도 알림.
// - 반려: 사유를 적으면 주최자에게 알림(새 모집은 '반려됨' — 주최자가 고쳐서 다시 요청 가능, 수정 요청은 수정안만 버림).
// 처리 내역은 관리 기록(admin_audit op_approve/op_reject)에 남는다. 실제 권한 검사는 DB 함수가 한다.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { rpcOk, fmtDateTime } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { type OpDraft, durationText, feeText, opDateText } from "@/lib/openpiste";

interface QueueItem extends OpDraft {
  id: number;
  status: string;
  kind: "new" | "edit";
  pending_edit: OpDraft | null;
  submitted_at: string;
  count: number;
  host_nickname: string | null;
  host_hosted: number;
}

/** 화면에 보일 항목(이름, 값 → 문구) */
const FIELDS: [keyof OpDraft, string, (d: OpDraft) => string][] = [
  ["title", "제목", (d) => d.title],
  ["weapon", "종목", (d) => d.weapon],
  ["levels", "레벨", (d) => d.levels.join("·")],
  ["starts_at", "일시", (d) => opDateText(d.starts_at)],
  ["duration_h", "진행 시간", (d) => durationText(d.duration_h)],
  ["region", "지역", (d) => d.region],
  ["place", "장소", (d) => d.place],
  ["capacity", "정원", (d) => `${d.capacity}명`],
  ["fee", "참가비", (d) => feeText(d.fee)],
  ["chat_url", "오픈채팅", (d) => d.chat_url ?? "없음"],
  ["body", "상세 내용", (d) => d.body || "(없음)"],
];

export function OpenpisteAdmin({ onChanged }: { onChanged?: () => void }) {
  const [list, setList] = useState<QueueItem[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_op_queue");
    setList((data ?? []) as QueueItem[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (q: QueueItem, approve: boolean) => {
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt("반려 사유를 적어 주세요(주최자에게 알림으로 전달돼요)", "운영 기준에 맞지 않음");
      if (reason === null) return;
    }
    const err = await rpcOk("admin_op_review", { p_id: q.id, p_approve: approve, p_reason: reason });
    if (err) return toast.error(err);
    toast.success(approve ? (q.kind === "new" ? "승인했어요(게시 + 알림)" : "수정 내용을 반영했어요") : "반려했어요");
    load();
    onChanged?.();
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <h2 className="text-base font-bold">오픈피스트 승인</h2>
      <p className="text-xs text-muted">새 모집과 게시 중인 글의 수정 요청이에요. 수정 요청은 승인 전까지 기존 내용이 그대로 게시돼요. 장소·일시가 실제로 가능한지, 연락처·광고가 본문에 없는지 확인해 주세요.</p>
      {list === null ? <p className="py-4 text-center text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="py-4 text-center text-sm text-muted">승인을 기다리는 글이 없습니다</p> : (
        <ul className="space-y-3">
          {list.map((q) => {
            const next = q.kind === "edit" ? q.pending_edit : null;
            return (
              <li key={`${q.id}-${q.kind}`} className="space-y-2 rounded-md bg-panel2 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={q.kind === "new" ? "rounded bg-brand/15 px-1.5 py-0.5 text-[11px] text-brand" : "rounded bg-pending/15 px-1.5 py-0.5 text-[11px] text-pending"}>
                    {q.kind === "new" ? "새 모집" : "수정 요청"}
                  </span>
                  <b className="min-w-0 truncate">{q.title}</b>
                  <Link href={`/openpiste/${q.id}`} target="_blank" className="text-xs text-brand">글 열기</Link>
                  <span className="ml-auto text-[11px] text-muted">요청 {fmtDateTime(q.submitted_at)}</span>
                </div>
                <p className="text-xs text-muted">
                  주최자 {q.host_nickname ?? "(탈퇴)"} · 지난 모집 {q.host_hosted}건{q.kind === "edit" && ` · 지금 신청 ${q.count}명`}
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {FIELDS.map(([key, label, fmt]) => {
                      const cur = fmt(q);
                      const after = next ? fmt(next) : null;
                      const changed = after !== null && after !== cur;
                      if (next && !changed) return null; // 수정 요청은 바뀐 항목만
                      return (
                        <tr key={key} className="align-top">
                          <td className="w-20 py-0.5 pr-2 text-muted">{label}</td>
                          <td className="whitespace-pre-wrap break-all py-0.5">
                            {changed ? <><span className="text-muted line-through">{cur}</span><span className="mx-1 text-muted">→</span><span className="text-pending">{after}</span></> : cur}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex gap-1.5 pt-1">
                  <Button size="sm" onClick={() => review(q, true)}>승인</Button>
                  <Button size="sm" variant="outline" onClick={() => review(q, false)}>반려</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
