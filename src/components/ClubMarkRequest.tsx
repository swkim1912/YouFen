"use client";
// 마이 펜싱 > 상세정보 탭: 소속 클럽의 마크(클럽 이미지 = 회원 기본 프로필 사진으로 쓰임)를 관리자에게 신청한다. 신분과 관계없이 소속이 있으면 누구나.
// 흐름: 이미지 고르기 → 편집기(AvatarEditor, 투명 배경)로 크기·위치 조정 → 미리보기 확인 → 신청 사유(3~500자) + 마크 사용 권한·공개 동의 → 신청.
// 서버 /api/club-image 가 형식 검사·512px webp 변환 후 '승인 대기'로 저장하고, 관리자 페이지 > 클럽에서 승인해야 적용된다(승인 전에는 어디에도 안 보임).
// 한도: 검토 중인 신청은 한 번에 하나, 하루 3번. 신청자가 탈퇴하면 검토 중인 신청만 지워지고, 승인되어 등록된 마크는 그대로 남는다(/api/account).
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { callApi, fmtDateTime } from "@/lib/adminApi";
import { useAuth } from "./AuthProvider";
import { Button } from "./ui/button";
import { Label, Textarea } from "./ui/input";
import { AvatarEditor } from "./AvatarEditor";
import { cn } from "@/lib/utils";

const MAX_MB = 12; // 고르는 원본 최대 용량(편집기가 512px 로 줄여서 올린다)
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "검토 중", cls: "bg-pending/15 text-pending" },
  approved: { label: "승인됨", cls: "bg-win/15 text-win" },
  rejected: { label: "반려됨", cls: "bg-loss/15 text-loss" },
};
const IMG_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/club-images/`;

interface MyReq { id: string; status: string; created_at: string; path: string; reason: string | null; club: { name: string } | null }

export function ClubMarkRequest() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<MyReq[] | null>(null);
  const [picked, setPicked] = useState<File | null>(null); // 편집기에 열 원본
  const [mark, setMark] = useState<{ blob: Blob; url: string } | null>(null); // 조정을 마친 미리보기
  const [reason, setReason] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const clubId = profile?.club_id ?? null;

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from("club_image_requests").select("id,status,created_at,path,reason,club:clubs(name)")
      .eq("requested_by", profile.id).order("created_at", { ascending: false }).limit(10);
    setHistory((data ?? []) as unknown as MyReq[]);
  }, [profile]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (mark) URL.revokeObjectURL(mark.url); }, [mark]);

  if (!profile) return null;
  const pending = history?.some((h) => h.status === "pending");

  const pick = (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) return toast.error(`이미지는 ${MAX_MB}MB 이하만 올릴 수 있어요`);
    setPicked(f);
  };
  const adjusted = (blob: Blob) => {
    setMark({ blob, url: URL.createObjectURL(blob) });
    setPicked(null);
  };

  const reasonLen = reason.trim().length;
  const canSend = !!mark && reasonLen >= 3 && reasonLen <= 500 && agree && !busy && !pending;

  const submit = async () => {
    if (!mark || clubId == null) return;
    const fd = new FormData();
    fd.append("file", new File([mark.blob], "club.png", { type: "image/png" }));
    fd.append("club_id", String(clubId));
    fd.append("reason", reason.trim());
    fd.append("consent", "true");
    setBusy(true);
    const res = await callApi("/api/club-image", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) return toast.error(res.message ?? "신청하지 못했어요");
    toast.success(res.pending === false ? "관리자 계정이라 바로 적용했어요" : "신청했어요. 운영자가 확인한 뒤 적용돼요");
    setMark(null); setReason(""); setAgree(false);
    load();
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">소속 클럽 마크 신청</h3>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw size={13} />새로고침</Button>
      </div>
      <p className="text-sm text-muted">현재 연결된 소속의 마크를 신청할 수 있어요. 관리자 승인을 거쳐 마크가 등록됩니다.</p>

      {clubId == null ? (
        <p className="rounded-md bg-panel2 p-3 text-sm text-muted">소속 클럽이 없어요. 상세 설정에서 소속을 고르면 신청할 수 있어요.</p>
      ) : (
        <>
          <p className="text-sm font-semibold">신청 소속: {profile.affiliation}</p>
          <div>
            <Label>클럽 마크 이미지</Label>
            <div className="flex flex-wrap items-center gap-3">
              {mark && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mark.url} alt="조정한 클럽 마크 미리보기" className="h-20 w-20 rounded-xl border border-line bg-white/10 object-contain" />
              )}
              <Button type="button" size="sm" variant="outline" disabled={busy || pending} onClick={() => fileRef.current?.click()}>
                {mark ? "다른 이미지 선택" : "이미지 선택"}
              </Button>
              {mark && <button type="button" className="text-xs text-muted hover:text-foreground" onClick={() => setMark(null)}>지우기</button>}
            </div>
            <p className="mt-1.5 text-xs text-muted">선택 후 확대·위치를 조정할 수 있어요. 권장 512×512px 이상, 원본 {MAX_MB}MB 이하. 투명 배경은 PNG를 권장합니다.</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          <div>
            <Label>신청 사유·클럽과의 관계</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="클럽 대표 또는 마크 사용 허락을 받은 경위를 알려주세요. (3~500자)" />
            <p className="mt-1 text-xs text-muted">{reason.length}/500자</p>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>마크 사용 권한이 있으며 서비스 내 공개에 동의합니다. 조정한 미리보기대로 신청합니다.</span>
          </label>
          {pending && <p className="text-xs text-pending">검토 중인 신청이 있어요. 결과가 나온 뒤 다시 신청할 수 있어요.</p>}
          <Button disabled={!canSend} onClick={submit}>{busy ? "신청 중…" : "마크 승인 신청"}</Button>
        </>
      )}

      {/* 내 신청 내역 */}
      <div className="border-t border-line pt-3">
        {history === null ? <p className="text-center text-sm text-muted">불러오는 중…</p> : history.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted">아직 신청 내역이 없어요.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-md bg-panel2 p-2 text-sm">
                {h.status !== "rejected" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={IMG_BASE + h.path} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="h-10 w-10 rounded-lg bg-white/10 object-contain" />
                ) : <span className="h-10 w-10 rounded-lg bg-white/5" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.club?.name ?? "-"}</span>
                  <span className="block text-xs text-muted">{fmtDateTime(h.created_at)}</span>
                </span>
                <span className={cn("rounded px-2 py-0.5 text-xs", STATUS[h.status]?.cls)}>{STATUS[h.status]?.label ?? h.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AvatarEditor file={picked} busy={busy} title="클럽 마크 크기·위치 조정" transparent onCancel={() => setPicked(null)} onSave={adjusted} />
    </section>
  );
}
