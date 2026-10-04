"use client";
// 관리자: 프로필 사진 신고 처리. 신고된 사진을 보고 ① 사진 삭제 + 변경 제한 ② 사진만 삭제 ③ 신고 기각 중 고른다.
// 사진 삭제는 서버 API(DELETE /api/avatar)가 저장소 파일까지 지우고 해당 회원의 열린 신고를 처리 완료로 바꾼다.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { callApi, fmtDateTime, rpcOk } from "@/lib/adminApi";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

interface Report {
  id: number; reason: string; detail: string | null; status: "open" | "resolved" | "dismissed"; created_at: string;
  target_id: string; target_nickname: string | null; avatar_url: string | null; avatar_locked: boolean | null;
  reporter_nickname: string | null; target_report_count: number;
}
const STATUS = { open: "미처리", resolved: "처리됨", dismissed: "기각" } as const;

export function ReportsAdmin({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState("open");
  const [list, setList] = useState<Report[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_reports", { p_status: status });
    setList((data ?? []) as Report[]);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const done = (msg: string) => { toast.success(msg); load(); onChanged?.(); };
  const removeAvatar = async (r: Report, lock: boolean) => {
    const res = await callApi(`/api/avatar?target=${r.target_id}${lock ? "" : "&lock=0"}`, { method: "DELETE" });
    if (!res.ok) return toast.error(res.message ?? "처리하지 못했어요");
    done(lock ? "사진을 삭제하고 변경을 제한했어요" : "사진을 삭제했어요");
  };
  const dismiss = async (r: Report) => {
    const err = await rpcOk("admin_resolve_report", { p_id: r.id, p_status: "dismissed" });
    if (err) return toast.error(err);
    done("신고를 기각했어요");
  };
  const toggleLock = async (r: Report) => {
    const err = await rpcOk("admin_set_avatar_lock", { p_target: r.target_id, p_lock: !r.avatar_locked });
    if (err) return toast.error(err);
    done(r.avatar_locked ? "사진 변경 제한을 풀었어요" : "사진 변경을 제한했어요");
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-base font-bold">프로필 사진 신고</h2>
        <Select className="h-8 w-28" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">미처리</option><option value="resolved">처리됨</option><option value="dismissed">기각</option><option value="all">전체</option>
        </Select>
      </div>
      {list === null ? <p className="py-4 text-center text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="py-4 text-center text-sm text-muted">해당하는 신고가 없습니다</p> : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="flex gap-3 rounded-md bg-panel2 p-3 text-sm">
              <Avatar avatarUrl={r.avatar_url} clubId={null} affiliation={null} nickname={r.target_nickname} size={72} className="!rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <b>{r.target_nickname ?? "(탈퇴)"}</b>
                  <span className="rounded bg-loss/20 px-1.5 py-0.5 text-[11px] text-loss">{r.reason}</span>
                  <span className="text-[11px] text-muted">{STATUS[r.status]}</span>
                  {r.target_report_count > 1 && <span className="text-[11px] text-muted">이 회원 신고 {r.target_report_count}건</span>}
                  {r.avatar_locked && <span className="text-[11px] text-loss">변경 제한 중</span>}
                </div>
                {r.detail && <p className="whitespace-pre-wrap text-xs">{r.detail}</p>}
                <p className="text-xs text-muted">신고자 {r.reporter_nickname ?? "(탈퇴)"} · {fmtDateTime(r.created_at)}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {r.avatar_url?.startsWith("http") && <Button size="sm" variant="danger" onClick={() => removeAvatar(r, true)}>사진 삭제 + 변경 제한</Button>}
                  {r.avatar_url?.startsWith("http") && <Button size="sm" variant="outline" onClick={() => removeAvatar(r, false)}>사진만 삭제</Button>}
                  {r.status === "open" && <Button size="sm" variant="outline" onClick={() => dismiss(r)}>기각</Button>}
                  <Button size="sm" variant="ghost" onClick={() => toggleLock(r)}>{r.avatar_locked ? "변경 제한 풀기" : "변경 제한"}</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
