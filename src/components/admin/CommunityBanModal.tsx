"use client";
// 관리자: 커뮤니티 이용 정지 창 (신고 화면·회원 화면 공용)
// 기간 1일/7일/30일/영구 + 사유(2~300자, 회원에게 알림으로 그대로 전달됨) → RPC admin_community_ban.
// 사이트 전체 로그인 정지(회원 탭의 '이용 정지')와는 다르다: 커뮤니티(게시판·채팅·장터·오픈피스트) 쓰기만 막고 읽기는 허용.
import { useState } from "react";
import { toast } from "sonner";
import { rpcOk } from "@/lib/adminApi";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";

export function CommunityBanModal({ target, onClose, onDone }: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target) return;
    if (reason.trim().length < 2) return toast.error("정지 사유를 적어 주세요(회원에게 전달돼요)");
    setBusy(true);
    const err = await rpcOk("admin_community_ban", { p_target: target.id, p_days: days === "perm" ? null : Number(days), p_reason: reason.trim() });
    setBusy(false);
    if (err) return toast.error(err);
    setReason("");
    onClose();
    onDone();
  };

  return (
    <Modal open={!!target} onClose={onClose} title="커뮤니티 이용 정지">
      <div className="space-y-3">
        <p className="text-sm">{target?.name} 님의 커뮤니티 이용을 정지할까요? 정지 중에는 게시판·채팅·장터·오픈피스트에 글을 쓸 수 없고 읽기만 할 수 있어요. 사이트 로그인은 막지 않아요.</p>
        <div>
          <Label>정지 기간</Label>
          <Select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">1일</option><option value="7">7일</option><option value="30">30일</option><option value="perm">영구</option>
          </Select>
        </div>
        <div>
          <Label>사유 (회원에게 알림으로 전달돼요, 300자 이내)</Label>
          <Textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="예: 다른 회원에 대한 반복적인 비하 표현" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button variant="danger" disabled={busy} onClick={submit}>정지</Button>
        </div>
      </div>
    </Modal>
  );
}
