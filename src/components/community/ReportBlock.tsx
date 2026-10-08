"use client";
// 커뮤니티 공용 신고·차단 버튼. 대상은 (종류, 참조값)으로만 넘긴다 — 상대 회원 id 를 화면이 알 필요가 없다(익명·전용 프로필 보호).
// - 신고: report_target RPC (사유 7가지 + 상세 500자, 하루 20건, 같은 대상 중복 불가, 서로 다른 3명이 신고하면 자동 임시 숨김)
// - 차단: block_target RPC (차단한 회원의 글·댓글·채팅·1:1 채팅을 숨기고 나에게 알림을 못 보냄). 해제는 커뮤니티 설정 탭.
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Modal, Confirm } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { REPORT_REASONS, communityError } from "@/lib/community";
import { cn } from "@/lib/utils";

export function ReportBlock({ kind, refId, label, what = "글", onBlocked, className }: {
  kind: string;          // 'cprofile' | 'yprofile' | (2단계부터) 'post' | 'comment' …
  refId: string;
  label: string;         // 확인창에 보일 이름(예: 닉네임, '익명')
  what?: string;         // 신고 창 제목에 쓸 대상 이름(글·댓글·프로필·메시지)
  onBlocked?: () => void; // 차단 후 목록 새로고침 등
  className?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [askBlock, setAskBlock] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user) return null; // 로그인한 회원만

  const report = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("report_target", { p_kind: kind, p_ref: refId, p_reason: reason, p_detail: detail.trim() || null });
    setBusy(false);
    if (error) return toast.error(communityError(error.message));
    toast.success("신고를 접수했어요. 확인 후 조치할게요");
    setOpen(false);
    setDetail("");
  };

  const block = async () => {
    setAskBlock(false);
    const { error } = await supabase.rpc("block_target", { p_kind: kind, p_ref: refId });
    if (error) return toast.error(communityError(error.message));
    toast.success("차단했어요. 커뮤니티 설정에서 해제할 수 있어요");
    onBlocked?.();
  };

  return (
    <>
      <span className={cn("inline-flex gap-2 text-xs text-muted", className)}>
        <button className="hover:text-loss" onClick={() => setOpen(true)}>신고</button>
        <button className="hover:text-loss" onClick={() => setAskBlock(true)}>차단</button>
      </span>
      <Modal open={open} onClose={() => setOpen(false)} title={`${what} 신고`}>
        <div className="space-y-3">
          <div>
            <Label>사유</Label>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <Label>상세 내용 (선택, 500자 이내)</Label>
            <Textarea value={detail} maxLength={500} onChange={(e) => setDetail(e.target.value)} />
          </div>
          <p className="text-xs text-muted">신고한 사람은 상대에게 알려지지 않아요. 여러 명이 신고한 내용은 운영자 확인 전까지 자동으로 가려질 수 있어요. 허위 신고를 반복하면 이용이 제한될 수 있어요.</p>
          <Button className="w-full" disabled={busy} onClick={report}>신고하기</Button>
        </div>
      </Modal>
      <Confirm
        open={askBlock}
        message={`${label} 님을 차단할까요? 이 회원의 글·댓글·채팅이 보이지 않고, 나에게 알림이나 1:1 채팅을 보낼 수 없어요.`}
        okText="차단"
        onOk={block}
        onCancel={() => setAskBlock(false)}
      />
    </>
  );
}
