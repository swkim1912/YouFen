"use client";
// 지도자 전용(상세 설정 안): 소속 클럽의 이미지(프로필 사진 기본값으로 쓰임) 등록을 관리자에게 신청한다.
// - 신분이 '지도자'이고 소속 클럽이 선택된 회원에게만 보인다(관리자의 지도자 승인 전에는 안내 문구만). 올린 이미지는 관리자가 확인·승인해야 클럽 이미지로 적용된다(서버 /api/club-image).
// - 이미 검토 중인 신청이 있으면 새로 신청할 수 없고, 하루 3번까지 신청할 수 있다.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { callApi } from "@/lib/adminApi";
import { useAuth } from "./AuthProvider";
import { Button } from "./ui/button";
import { Label } from "./ui/input";
import { AvatarEditor } from "./AvatarEditor";

const MAX_MB = 12; // 고르는 원본 최대 용량(편집기가 512px 로 줄여서 올린다)
const STATUS: Record<string, string> = { pending: "검토 중", approved: "승인됨", rejected: "반려됨" };

export function ClubImageRequest() {
  const { profile } = useAuth();
  const [last, setLast] = useState<{ status: string; created_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<File | null>(null); // 편집기에 열 파일
  const fileRef = useRef<HTMLInputElement>(null);
  const clubId = profile?.club_id ?? null;

  const load = useCallback(async () => {
    if (!profile || clubId == null) return;
    const { data } = await supabase.from("club_image_requests").select("status,created_at").eq("requested_by", profile.id).eq("club_id", clubId).order("created_at", { ascending: false }).limit(1);
    setLast((data?.[0] as { status: string; created_at: string } | undefined) ?? null);
  }, [profile, clubId]);
  useEffect(() => { load(); }, [load]);

  if (!profile || profile.role !== "지도자" || clubId == null) return null;
  // 지도자 승인 전·반려 상태면 신청 대신 안내만 보여준다
  if (profile.leader_status !== "approved")
    return (
      <div className="rounded-md border border-line p-3 text-xs text-muted">
        <b className="text-foreground">소속 클럽 이미지 신청 (지도자)</b>
        <p className="mt-1">{profile.leader_status === "rejected" ? "지도자 신청이 반려되었어요. 신분·소속을 확인한 뒤 고객지원으로 문의해 주세요." : "관리자가 지도자 신청을 확인하고 있어요. 승인되면 클럽 이미지를 신청할 수 있어요."}</p>
      </div>
    );

  const pick = (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) return toast.error(`이미지는 ${MAX_MB}MB 이하만 올릴 수 있어요`);
    setPicked(f);
  };
  // 편집기에서 조정한 512×512 이미지를 서버로 보낸다
  const send = async (blob: Blob) => {
    const fd = new FormData();
    fd.append("file", new File([blob], "club.png", { type: "image/png" }));
    fd.append("club_id", String(clubId));
    setBusy(true);
    const res = await callApi("/api/club-image", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) return toast.error(res.message ?? "신청하지 못했어요");
    toast.success("신청했어요. 관리자가 확인한 뒤 적용돼요");
    setPicked(null);
    load();
  };

  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <Label>소속 클럽 이미지 신청 (지도자)</Label>
      <p className="text-xs text-muted">클럽 이미지는 회원들의 기본 프로필 사진으로 쓰여요. 로고 이미지를 올리면 관리자가 확인한 뒤 적용합니다. (JPG·PNG·WEBP, {MAX_MB}MB 이하, 올리기 전에 크기·위치를 조정할 수 있어요)</p>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={busy || last?.status === "pending"} onClick={() => fileRef.current?.click()}>{busy ? "올리는 중…" : "이미지 신청"}</Button>
        {last && <span className="text-xs text-muted">최근 신청: {STATUS[last.status] ?? last.status} ({last.created_at.slice(0, 10)})</span>}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <AvatarEditor file={picked} busy={busy} title="클럽 이미지 크기·위치 조정" transparent onCancel={() => setPicked(null)} onSave={send} />
    </div>
  );
}
