"use client";
// 프로필 사진 설정(상세 설정 모달 안): 소속팀 이미지(기본) / 기본 프로필 / 사진 올리기(편집기에서 크기·위치 조정).
// 모든 변경은 서버 API(/api/avatar)를 거친다 — 올린 사진은 형식·용량 검사, EXIF 제거, 부적절 이미지 검열을 통과해야 한다.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Avatar, DefaultAvatar } from "./Avatar";
import { AvatarEditor } from "./AvatarEditor";
import { Button } from "./ui/button";
import { Label } from "./ui/input";
import { cn } from "@/lib/utils";

const MAX_PICK_MB = 12; // 사용자가 고를 수 있는 원본 최대 용량

async function call(init: RequestInit): Promise<{ ok: boolean; message?: string }> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/avatar", { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
  return res.json().catch(() => ({ ok: false, message: "요청에 실패했습니다" }));
}

export function AvatarSettings() {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<File | null>(null); // 편집기에 열 파일
  const fileRef = useRef<HTMLInputElement>(null);
  if (!profile) return null;
  const cur = profile.avatar_url;
  const locked = profile.avatar_locked;

  const run = async (p: Promise<{ ok: boolean; message?: string }>, okMsg: string) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message ?? "실패했습니다");
      return false;
    }
    toast.success(okMsg);
    await refreshProfile();
    return true;
  };

  const pick = (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (f.size > MAX_PICK_MB * 1024 * 1024) return toast.error(`사진은 ${MAX_PICK_MB}MB 이하만 올릴 수 있어요`);
    setPicked(f);
  };

  // 편집기에서 만든 512×512 사진을 서버로 올린다 (실패하면 편집기를 열어 둬서 다시 시도할 수 있다)
  const upload = async (blob: Blob) => {
    const fd = new FormData();
    fd.append("file", new File([blob], "avatar.png", { type: "image/png" }));
    if (await run(call({ method: "POST", body: fd }), "프로필 사진을 바꿨어요")) setPicked(null);
  };

  const patch = (body: object, msg: string) =>
    run(call({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), msg);

  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <Label>프로필 사진</Label>
      {locked && <p className="text-xs text-loss">프로필 사진 변경이 제한된 계정입니다. 문의해 주세요.</p>}
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={cur} clubId={profile.club_id} affiliation={profile.affiliation} nickname={profile.nickname} size={64} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || locked} onClick={() => fileRef.current?.click()}>사진 올리기</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy || locked || cur === null} onClick={() => patch({ mode: "club" }, "소속팀 이미지로 바꿨어요")}>소속팀 이미지로</Button>
          <button
            type="button"
            disabled={busy || locked}
            onClick={() => patch({ mode: "default", n: 1 }, "기본 프로필로 바꿨어요")}
            className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm", cur?.startsWith("default:") ? "border-brand" : "border-line hover:bg-white/5")}
          >
            <span className="overflow-hidden rounded-full"><DefaultAvatar size={24} /></span>기본 프로필
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      </div>
      <p className="text-xs text-muted">JPG·PNG·WEBP, 12MB 이하. 사진을 고르면 크기와 위치를 조정할 수 있어요. 사진 변경은 하루 2회까지 가능하고, 올린 사진은 자동 검사를 거쳐 선정적·폭력적인 사진은 등록되지 않아요. 소속팀 이미지는 팀이 등록한 경우 자동으로 쓰이고, 없으면 소속팀 첫 글자가 보여요.</p>
      <AvatarEditor file={picked} busy={busy} onCancel={() => setPicked(null)} onSave={upload} />
    </div>
  );
}
