"use client";
// 다른 사용자의 프로필 사진 신고(로그인 필요) + 관리자의 즉시 삭제. 신고는 avatar_reports 에 쌓이고 관리자만 읽는다.
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Label, Select, Textarea } from "./ui/input";

const REASONS = ["성적/선정적", "폭력/혐오", "타인 도용", "기타"] as const;

export function AvatarReport({ targetId }: { targetId: string }) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null; // 로그인한 사용자만
  if (user.id === targetId) return null;

  const send = async () => {
    setBusy(true);
    const { error } = await supabase.from("avatar_reports").insert({ reporter_id: user.id, target_id: targetId, reason, detail: detail.trim() || null });
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "이미 신고한 사진입니다" : error.message);
    toast.success("신고를 접수했습니다. 확인 후 조치할게요");
    setOpen(false);
    setDetail("");
  };

  const adminRemove = async () => {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`/api/avatar?target=${targetId}`, { method: "DELETE", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) toast.success("사진을 삭제하고 이후 등록을 막았습니다. 새로고침하면 반영돼요");
    else toast.error(j.message ?? "삭제하지 못했습니다");
  };

  return (
    <>
      <div className="mt-1 flex justify-center gap-2 text-[11px]">
        <button className="text-muted hover:text-loss" onClick={() => setOpen(true)}>사진 신고</button>
        {profile?.is_admin && <button className="text-loss hover:underline" onClick={adminRemove}>삭제(관리자)</button>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="프로필 사진 신고">
        <div className="space-y-3">
          <div>
            <Label>사유</Label>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <Label>상세 내용 (선택, 500자 이내)</Label>
            <Textarea value={detail} maxLength={500} onChange={(e) => setDetail(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy} onClick={send}>신고하기</Button>
        </div>
      </Modal>
    </>
  );
}
