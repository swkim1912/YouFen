"use client";
// 마이 펜싱 > 상세정보 탭 맨 아래 '회원 탈퇴'. 무엇이 지워지고 남는지 안내 → 확인 문구 입력 → 서버 API(DELETE /api/account)가 계정을 삭제.
// 삭제가 끝나면 이 기기의 로그인 정보도 지우고 첫 화면으로 보낸다. 관리자 계정은 서버가 거절한다(먼저 관리자 권한 해제 필요).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { callApi } from "@/lib/adminApi";
import { DELETE_CONFIRM } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";

export function AccountDelete() {
  const { profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setOpen(false); setText(""); };

  const submit = async () => {
    setBusy(true);
    const r = await callApi("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: text.trim() }) });
    setBusy(false);
    if (!r.ok) return toast.error(r.message ?? "탈퇴를 처리하지 못했어요");
    // 계정이 이미 지워졌으므로 서버 로그아웃 요청 없이 이 기기의 로그인 정보만 지운다
    await supabase.auth.signOut({ scope: "local" });
    toast.success("탈퇴가 완료되었습니다. 그동안 유펜을 이용해 주셔서 감사합니다");
    router.replace("/");
  };

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">회원 탈퇴</h3>
          <p className="mt-0.5 text-xs text-muted">탈퇴하면 계정과 기록이 바로 삭제되며 되돌릴 수 없어요.</p>
        </div>
        <Button size="sm" variant="outline" className="text-loss hover:border-loss/50" onClick={() => setOpen(true)}>회원 탈퇴</Button>
      </div>

      <Modal open={open} onClose={close} title="회원 탈퇴">
        <div className="space-y-3 text-sm">
          {profile?.is_admin ? (
            <p className="rounded-md border border-pending/40 bg-pending/[0.08] p-3 text-xs">관리자 계정은 탈퇴할 수 없어요. 먼저 Supabase 대시보드에서 관리자 권한을 해제해 주세요.</p>
          ) : null}
          <div>
            <p className="font-semibold">바로 삭제되는 정보</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
              <li>계정(이메일·로그인 정보)과 프로필, 프로필 사진</li>
              <li>내가 등록한 경기 기록과 피드백 노트</li>
              <li>선수 연결 (연결된 선수 페이지에서 내 닉네임이 사라져요)</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">남는 정보</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
              <li>다른 회원이 나를 상대로 등록한 기록 — 상대 이름이 &lsquo;탈퇴 회원&rsquo;으로 바뀌어 남아요</li>
              <li>협회 대회 결과(선수 페이지)는 협회 공개 자료라 그대로 남아요</li>
              <li>고객지원 접수 내용과 체육인번호는 개인정보 처리방침에 따라 보관돼요</li>
            </ul>
          </div>
          <div>
            <Label>확인을 위해 <b className="text-foreground">{DELETE_CONFIRM}</b> 를 입력해 주세요</Label>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={DELETE_CONFIRM} autoComplete="off" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={close}>취소</Button>
            <Button variant="danger" className="flex-1" disabled={busy || text.trim() !== DELETE_CONFIRM || !!profile?.is_admin} onClick={submit}>
              {busy ? "처리 중…" : "탈퇴하기"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
