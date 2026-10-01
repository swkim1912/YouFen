"use client";
// 마이페이지 톱니바퀴 → 상세 설정: 비밀번호, 생년월일, 종목, 신분, 닉네임(30일 1회), 테두리/뱃지, 전적 비공개
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";
import { BirthSelect, isCompleteBirth } from "./BirthSelect";
import { ExtraFields, validateExtra, type ExtraInfo } from "./ProfileFields";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, profile, refreshProfile } = useAuth();
  const [extra, setExtra] = useState<ExtraInfo>({
    weapon: profile?.weapon ?? "",
    region: profile?.region ?? "",
    role: profile?.role ?? "",
    division: profile?.division ?? "",
    nickname: profile?.nickname ?? "",
    affiliation: profile?.affiliation ?? "",
  });
  const [birth, setBirth] = useState(profile?.birth_date ?? "");
  const [pw, setPw] = useState("");
  const [frame, setFrame] = useState(profile?.use_frame ?? true);
  const [badge, setBadge] = useState(profile?.use_badge ?? true);
  const [hide, setHide] = useState(profile?.hide_records ?? false);
  const [nickOk, setNickOk] = useState(true);

  if (!user || !profile) return null;

  const save = async () => {
    const err = validateExtra(extra);
    if (err) return toast.error(err);
    if (!nickOk) return toast.error("사용할 수 없는 닉네임입니다");
    if (birth && !isCompleteBirth(birth)) return toast.error("생년월일(연/월/일)을 모두 선택해 주세요");
    if (pw && pw.length < 6) return toast.error("비밀번호는 6자 이상이어야 합니다");

    // 닉네임 30일 제한은 DB 트리거가 최종 검증 → 에러 메시지를 그대로 보여준다
    const { error } = await supabase
      .from("profiles")
      .update({ ...extra, birth_date: birth || null, use_frame: frame, use_badge: badge, hide_records: hide })
      .eq("id", user.id);
    if (error) {
      return toast.error(error.message.includes("duplicate") ? "이미 사용 중인 닉네임입니다" : error.message);
    }
    if (pw) {
      const { error: pwErr } = await supabase.auth.updateUser({ password: pw });
      if (pwErr) return toast.error(pwErr.message);
    }
    await refreshProfile();
    toast.success("저장했습니다");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="상세 설정" wide>
      <div className="space-y-3">
        <ExtraFields value={extra} onChange={setExtra} onNickStatus={setNickOk} currentNickname={profile.nickname} />
        <p className="text-xs text-muted">※ 닉네임은 30일에 1번만 변경할 수 있어요. 종목·지역은 언제든 바로 변경됩니다.</p>
        <div><Label>생년월일</Label><BirthSelect value={birth} onChange={setBirth} /></div>
        <div><Label>새 비밀번호 (변경 시에만 입력)</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} />커뮤니티 테두리 사용</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)} />커뮤니티 뱃지 사용</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />내 전적 비공개</label>
        <Button className="w-full" onClick={save}>저장</Button>
      </div>
    </Modal>
  );
}
