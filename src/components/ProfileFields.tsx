"use client";
// 회원가입 2단계 / 구글 온보딩 / 마이페이지 설정에서 공통으로 쓰는 '추가 정보' 입력 폼.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input, Label, Select } from "./ui/input";
import { ClubPicker } from "./ClubPicker";
import { DIVISIONS, REGIONS, ROLES, WEAPONS, validateNickname } from "@/lib/utils";

export interface ExtraInfo {
  weapon: string;
  region: string;
  role: string;
  division: string;
  nickname: string;
  affiliation: string; // 클럽 이름 또는 "무소속" (ClubPicker 가 채운다)
  club_id: number | null; // 우리 DB 클럽 id, 무소속이면 null
}

export const emptyExtra: ExtraInfo = { weapon: "", region: "", role: "", division: "", nickname: "", affiliation: "", club_id: null };

/** 필수값/닉네임 형식 검사. 오류 메시지 또는 null */
export function validateExtra(v: ExtraInfo): string | null {
  if (!v.weapon) return "종목을 선택해 주세요";
  if (!v.region) return "지역을 선택해 주세요";
  if (!v.role) return "신분을 선택해 주세요";
  if (!v.division) return "종별을 선택해 주세요";
  if (!v.affiliation.trim()) return "현재 소속을 선택해 주세요 (없으면 '선택안함')";
  return validateNickname(v.nickname);
}

/** 닉네임 입력 + 실시간 중복 확인 (nickname_available RPC 호출) */
export function NicknameField({
  value,
  onChange,
  current,
  onStatus,
}: {
  value: string;
  onChange: (v: string) => void;
  current?: string | null; // 내 기존 닉네임이면 중복 검사 생략
  onStatus?: (ok: boolean) => void;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!value) {
      setMsg(null);
      onStatus?.(false);
      return;
    }
    const fmt = validateNickname(value);
    if (fmt) {
      setMsg({ ok: false, text: fmt });
      onStatus?.(false);
      return;
    }
    if (value === current) {
      setMsg({ ok: true, text: "현재 사용 중인 닉네임입니다" });
      onStatus?.(true);
      return;
    }
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("nickname_available", { n: value });
      const ok = !error && data === true;
      setMsg({ ok, text: ok ? "사용 가능한 닉네임입니다" : "이미 사용 중인 닉네임입니다" });
      onStatus?.(ok);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, current]);

  return (
    <div>
      <Label>닉네임 (2~12자, 특수문자·공백 불가)</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value.trim())} maxLength={12} />
      {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-400" : "text-loss"}`}>{msg.text}</p>}
    </div>
  );
}

export function ExtraFields({
  value,
  onChange,
  onNickStatus,
  currentNickname,
}: {
  value: ExtraInfo;
  onChange: (v: ExtraInfo) => void;
  onNickStatus?: (ok: boolean) => void;
  currentNickname?: string | null;
}) {
  const set = (k: keyof ExtraInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>종목 (하나만 선택)</Label>
          <Select value={value.weapon} onChange={set("weapon")}>
            <option value="">선택</option>
            {WEAPONS.map((w) => <option key={w}>{w}</option>)}
          </Select>
        </div>
        <div>
          <Label>지역</Label>
          <Select value={value.region} onChange={set("region")}>
            <option value="">선택</option>
            {REGIONS.map((w) => <option key={w}>{w}</option>)}
          </Select>
        </div>
        <div>
          <Label>신분</Label>
          <Select value={value.role} onChange={set("role")}>
            <option value="">선택</option>
            {ROLES.map((w) => <option key={w}>{w}</option>)}
          </Select>
        </div>
        <div>
          <Label>종별</Label>
          <Select value={value.division} onChange={set("division")}>
            <option value="">선택</option>
            {DIVISIONS.map((w) => <option key={w}>{w}</option>)}
          </Select>
        </div>
      </div>
      <NicknameField
        value={value.nickname}
        onChange={(nickname) => onChange({ ...value, nickname })}
        current={currentNickname}
        onStatus={onNickStatus}
      />
      <ClubPicker
        clubId={value.club_id}
        affiliation={value.affiliation}
        onChange={(c) => onChange({ ...value, ...c })}
      />
    </div>
  );
}
