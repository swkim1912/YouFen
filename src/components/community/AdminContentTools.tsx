"use client";
// 관리자 전용: 게시글·댓글 처리 도구 (게시글 상세 화면과 관리자 신고 화면 공용)
// - 숨김 / 복구 / 삭제(사유 입력 → 작성자에게 알림, 다음 달 1일 완전 삭제): RPC admin_set_content_status
// - 작성자 확인: RPC admin_reveal_author — 익명·전용 프로필 글의 실제 회원을 보여 준다. 문제가 되거나 신고가 들어온 경우에만 쓰고,
//   누를 때마다 관리 기록(admin_audit 'reveal_author')에 남는다.
// 화면 보호는 보조이고 실제 권한 검사는 DB 함수(is_admin_user)가 한다.
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { rpcOk } from "@/lib/adminApi";
import { cn } from "@/lib/utils";

export function AdminContentTools({ kind, refId, status, onChanged, compact }: {
  kind: "post" | "comment";
  refId: string;
  status: string;
  onChanged: () => void;
  compact?: boolean;
}) {
  const [who, setWho] = useState<string | null>(null);

  const setStatus = async (next: "active" | "hidden" | "deleted") => {
    let reason: string | null = null;
    if (next === "deleted") {
      reason = window.prompt("삭제 사유를 적어 주세요(작성자에게 알림으로 전달돼요)", "커뮤니티 운영원칙 위반");
      if (reason === null) return; // 취소
    }
    const err = await rpcOk("admin_set_content_status", { p_kind: kind, p_ref: refId, p_status: next, p_reason: reason });
    if (err) return toast.error(err);
    toast.success(next === "active" ? "복구했어요" : next === "hidden" ? "숨겼어요" : "삭제했어요(다음 달 1일 완전 삭제)");
    onChanged();
  };
  const reveal = async () => {
    if (!window.confirm("작성자를 확인할까요? 확인 기록이 관리 기록에 남아요. 문제가 되거나 신고가 들어온 경우에만 확인해 주세요.")) return;
    const { data, error } = await supabase.rpc("admin_reveal_author", { p_kind: kind, p_ref: refId });
    if (error) return toast.error(error.message);
    const r = data as { found: boolean; nickname?: string | null; community_nickname?: string | null };
    setWho(r.found ? `${r.nickname ?? "(닉네임 없음)"}${r.community_nickname ? ` · 커뮤니티 ${r.community_nickname}` : ""}` : "탈퇴했거나 찾을 수 없어요");
  };

  const btn = "rounded border border-line px-2 py-0.5 hover:bg-white/5";
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-[11px]", compact ? "text-muted" : "rounded-md bg-panel2 px-2 py-1.5")}>
      <span className="font-semibold text-brand">관리자</span>
      {status !== "active" && <button className={btn} onClick={() => setStatus("active")}>복구</button>}
      {status === "active" && <button className={btn} onClick={() => setStatus("hidden")}>숨김</button>}
      {status !== "deleted" && <button className={cn(btn, "text-loss")} onClick={() => setStatus("deleted")}>삭제</button>}
      <button className={btn} onClick={reveal}>작성자 확인</button>
      {who && <span className="text-foreground">→ {who}</span>}
    </div>
  );
}
