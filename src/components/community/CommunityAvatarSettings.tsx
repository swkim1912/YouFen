"use client";
// 커뮤니티 전용 프로필 사진: 사진 올리기(편집기에서 크기·위치 조정) / 기본 프로필 / 사진 없음(닉네임 첫 글자).
// 유펜 사진(AvatarSettings)과 같은 서버 API(/api/avatar?slot=community)를 거친다 → 같은 부적절성 검사·하루 2회(유펜 사진과 합산)·변경 제한.
// 소속팀 이미지는 쓰지 않는다(전용 프로필에서 소속이 드러나지 않게).
import { useRef, useState } from "react";
import { toast } from "sonner";
import { callApi } from "@/lib/adminApi";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, DefaultAvatar } from "@/components/Avatar";
import { AvatarEditor } from "@/components/AvatarEditor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_PICK_MB = 12; // 사용자가 고를 수 있는 원본 최대 용량 (AvatarSettings 와 같음)
const API = "/api/avatar?slot=community";

export function CommunityAvatarSettings({ avatarUrl, nickname, onChanged }: {
  avatarUrl: string | null;
  nickname: string | null;
  onChanged: () => void; // 바뀐 뒤 내 커뮤니티 설정을 다시 읽는다
}) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = !!profile?.avatar_locked;

  const run = async (p: Promise<{ ok: boolean; message?: string }>, okMsg: string) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message ?? "실패했습니다");
      return false;
    }
    toast.success(okMsg);
    onChanged();
    return true;
  };

  const pick = (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (f.size > MAX_PICK_MB * 1024 * 1024) return toast.error(`사진은 ${MAX_PICK_MB}MB 이하만 올릴 수 있어요`);
    setPicked(f);
  };

  // 편집기에서 만든 512×512 사진을 서버로 올린다(실패하면 편집기를 열어 둬서 다시 시도)
  const upload = async (blob: Blob) => {
    const fd = new FormData();
    fd.append("file", new File([blob], "avatar.png", { type: "image/png" }));
    if (await run(callApi(API, { method: "POST", body: fd }), "커뮤니티 사진을 바꿨어요")) setPicked(null);
  };
  const patch = (body: object, msg: string) =>
    run(callApi(API, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), msg);

  return (
    <div className="space-y-2">
      <Label>커뮤니티 사진</Label>
      {locked && <p className="text-xs text-loss">프로필 사진 변경이 제한된 계정입니다. 문의해 주세요.</p>}
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={avatarUrl} clubId={null} affiliation={null} nickname={nickname} size={56} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || locked} onClick={() => fileRef.current?.click()}>사진 올리기</Button>
          <button aria-pressed={!!avatarUrl?.startsWith("default:")}
            type="button"
            disabled={busy || locked}
            onClick={() => patch({ mode: "default", n: 1 }, "기본 프로필로 바꿨어요")}
            className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm disabled:opacity-50", avatarUrl?.startsWith("default:") ? "border-brand" : "border-line hover:bg-white/5")}
          >
            <span className="overflow-hidden rounded-full"><DefaultAvatar size={24} /></span>기본 프로필
          </button>
          <Button type="button" size="sm" variant="outline" disabled={busy || locked || avatarUrl === null} onClick={() => patch({ mode: "none" }, "사진을 없앴어요")}>사진 없음</Button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      </div>
      <p className="text-xs text-muted">유펜 프로필 사진과 같은 기준으로 자동 검사하며, 사진 변경은 유펜 사진과 합쳐 하루 2회까지 가능해요. 사진이 없으면 닉네임 첫 글자가 보여요.</p>
      <AvatarEditor file={picked} busy={busy} onCancel={() => setPicked(null)} onSave={upload} />
    </div>
  );
}
