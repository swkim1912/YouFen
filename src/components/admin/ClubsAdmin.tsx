"use client";
// 관리자: 클럽 관리 — ① 클럽 이미지(마크) 등록·제거 ② 회원의 클럽 마크 신청(사유·동의 포함) 승인/반려 ③ 협회 팀을 묶은 결과 중 '확인 필요(medium)' 클럽 검토(확인 완료 / 이름 변경 / 다른 클럽에 병합).
// - 이미지는 서버 API(/api/club-image)가 형식 검사·512px webp 변환 후 저장한다. 관리자가 올리면 바로 적용, 회원 신청은 승인해야 적용된다.
// - 병합은 팀·회원 소속·선수·대회 기록의 소속을 모두 대상 클럽으로 옮기고 원래 클럽을 지운다(되돌릴 수 없음).
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { callApi, fmtDateTime, rpcOk } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Confirm, Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { AvatarEditor } from "@/components/AvatarEditor";
import { cn } from "@/lib/utils";

// phones: 협회 팀 연락처(개인 휴대폰 포함) — 관리자 RPC 로만 받는다(일반 사용자는 API 로도 못 읽음)
interface Club { id: number; name: string; sido: string | null; confidence: "high" | "medium"; image_url: string | null; phones: string[] | null; teams: number; members: number; team_names: string[] | null; member_profiles: number }
interface Req { id: string; club_id: number; club_name: string; current_image: string | null; path: string; status: string; created_at: string; requester_nickname: string | null; requester_role: string | null; requester_club_id: number | null; reason: string | null; consented_at: string | null }

const CLUB_IMG_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/club-images/`;

export function ClubsAdmin({ onChanged }: { onChanged?: () => void }) {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [q, setQ] = useState("");
  const [review, setReview] = useState(true);
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [mergeFrom, setMergeFrom] = useState<Club | null>(null);
  const [rename, setRename] = useState<Club | null>(null);
  const [newName, setNewName] = useState("");
  const [uploadFor, setUploadFor] = useState<number | null>(null);
  const [picked, setPicked] = useState<File | null>(null); // 편집기에 열 파일
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadReqs = useCallback(async () => {
    const { data } = await supabase.rpc("admin_club_image_requests", { p_status: "pending" });
    setReqs((data ?? []) as Req[]);
  }, []);
  const loadClubs = useCallback(async () => {
    const { data } = await supabase.rpc("admin_clubs", { p_q: q, p_review: review, p_limit: 40 });
    setClubs((data ?? []) as Club[]);
  }, [q, review]);
  useEffect(() => { loadReqs(); }, [loadReqs]);
  useEffect(() => { const t = setTimeout(loadClubs, 250); return () => clearTimeout(t); }, [loadClubs]);

  const decide = async (r: Req, action: "approve" | "reject") => {
    const res = await callApi("/api/club-image", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, action }) });
    if (!res.ok) return toast.error(res.message ?? "처리하지 못했어요");
    toast.success(action === "approve" ? "승인해서 클럽 마크에 반영했어요" : "반려했어요");
    loadReqs(); loadClubs();
  };
  // 파일을 고르면 편집기(크기·위치 조정)를 열고, 저장하면 512×512 로 올린다
  const pickFile = (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (file) setPicked(file);
  };
  const upload = async (blob: Blob) => {
    if (uploadFor == null) return;
    const fd = new FormData();
    fd.append("file", new File([blob], "club.png", { type: "image/png" }));
    fd.append("club_id", String(uploadFor));
    setUploading(true);
    const res = await callApi("/api/club-image", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) return toast.error(res.message ?? "올리지 못했어요");
    toast.success("클럽 마크를 등록했어요");
    setPicked(null);
    loadClubs();
  };
  const removeImage = async (c: Club) => {
    const res = await callApi(`/api/club-image?club_id=${c.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(res.message ?? "처리하지 못했어요");
    toast.success("이미지를 제거했어요");
    loadClubs();
  };
  const confirmOk = async (c: Club) => {
    const err = await rpcOk("admin_club_set_confidence", { p_id: c.id, p_confidence: "high" });
    if (err) return toast.error(err);
    toast.success("확인 완료로 표시했어요");
    loadClubs();
  };
  const doRename = async () => {
    if (!rename) return;
    const err = await rpcOk("admin_rename_club", { p_id: rename.id, p_name: newName });
    if (err) return toast.error(err);
    setRename(null);
    toast.success("이름을 바꿨어요");
    loadClubs();
  };
  const merged = async () => { loadClubs(); onChanged?.(); };

  return (
    <section className="space-y-4 rounded-lg border border-line bg-panel p-4">
      <h2 className="text-base font-bold">클럽 관리</h2>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      <AvatarEditor file={picked} busy={uploading} title="클럽 마크 크기·위치 조정" transparent onCancel={() => setPicked(null)} onSave={upload} />

      <div>
        <h3 className="mb-1.5 text-sm font-bold">클럽 마크 신청 <span className="font-normal text-muted">{reqs.length}건 대기</span></h3>
        {reqs.length === 0 ? <p className="text-sm text-muted">대기 중인 신청이 없습니다</p> : (
          <ul className="space-y-2">
            {reqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-md bg-panel2 p-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CLUB_IMG_BASE + r.path} alt="신청 이미지" className="h-20 w-20 rounded-lg bg-white/10 object-contain" />
                {r.current_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <span className="text-center text-[10px] text-muted"><img src={r.current_image} alt="현재 이미지" className="mx-auto mb-0.5 h-10 w-10 rounded object-contain" />현재</span>
                )}
                <div className="min-w-0 flex-1">
                  <div><b>{r.club_name}</b></div>
                  <div className="text-xs text-muted">{r.requester_nickname ?? "(탈퇴)"} ({r.requester_role}{r.requester_club_id === r.club_id ? " · 소속 일치" : " · 소속 불일치"}) · {fmtDateTime(r.created_at)}</div>
                  {/* 신청 사유와 마크 사용 권한·공개 동의 (지도자 전용이던 시절의 신청은 사유가 없음) */}
                  {r.reason && <p className="mt-1 whitespace-pre-wrap break-words rounded bg-white/5 px-2 py-1 text-xs">{r.reason}</p>}
                  <div className="mt-0.5 text-[11px] text-muted">{r.consented_at ? `사용 권한·공개 동의 ${fmtDateTime(r.consented_at)}` : "동의 기록 없음"}</div>
                </div>
                <Button size="sm" onClick={() => decide(r, "approve")}>승인</Button>
                <Button size="sm" variant="outline" onClick={() => decide(r, "reject")}>반려</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-bold">클럽 목록</h3>
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />확인 필요(medium)만</label>
          <Input className="h-8 w-44" value={q} onChange={(e) => setQ(e.target.value)} aria-label="클럽·팀 이름 검색" placeholder="클럽·팀 이름 검색" />
        </div>
        {clubs === null ? <p className="py-3 text-center text-sm text-muted">불러오는 중…</p> : clubs.length === 0 ? <p className="py-3 text-center text-sm text-muted">해당하는 클럽이 없습니다</p> : (
          <ul className="space-y-1.5">
            {clubs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-md bg-panel2 px-3 py-2 text-sm">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={c.image_url} alt="" className="h-10 w-10 rounded-lg bg-white/10 object-contain" />
                ) : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-xs text-muted">없음</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <b className="truncate">{c.name}</b><span className="text-xs text-muted">#{c.id} · {c.sido ?? "시도 없음"}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px]", c.confidence === "medium" ? "bg-pending/20 text-pending" : "bg-win/20 text-win")}>{c.confidence === "medium" ? "확인 필요" : "확인됨"}</span>
                  </div>
                  <div className="truncate text-xs text-muted">팀 {c.teams}개 · 선수 {c.members}명 · 가입 회원 {c.member_profiles}명 — {c.team_names?.join(", ")}</div>
                  {!!c.phones?.length && <div className="truncate text-xs text-muted">연락처 <span className="select-all">{c.phones.join(", ")}</span></div>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setUploadFor(c.id); setTimeout(() => fileRef.current?.click(), 0); }}>이미지</Button>
                  {c.image_url && <Button size="sm" variant="ghost" onClick={() => removeImage(c)}>이미지 제거</Button>}
                  {c.confidence === "medium" && <Button size="sm" onClick={() => confirmOk(c)}>확인 완료</Button>}
                  <Button size="sm" variant="outline" onClick={() => { setRename(c); setNewName(c.name); }}>이름</Button>
                  <Button size="sm" variant="outline" onClick={() => setMergeFrom(c)}>병합</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MergeModal from={mergeFrom} onClose={() => setMergeFrom(null)} onDone={merged} />
      <Modal open={!!rename} onClose={() => setRename(null)} title="클럽 이름 변경">
        <div className="space-y-3">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
          <Button className="w-full" onClick={doRename}>저장</Button>
        </div>
      </Modal>
    </section>
  );
}

/** 병합 대상 클럽을 검색해서 고르는 창 */
function MergeModal({ from, onClose, onDone }: { from: Club | null; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Club[]>([]);
  const [target, setTarget] = useState<Club | null>(null);

  useEffect(() => {
    if (!from || !q.trim()) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("admin_clubs", { p_q: q, p_review: false, p_limit: 8 });
      setHits(((data ?? []) as Club[]).filter((c) => c.id !== from.id));
    }, 250);
    return () => clearTimeout(t);
  }, [q, from]);

  const close = () => { setQ(""); setHits([]); setTarget(null); onClose(); };
  const run = async () => {
    if (!from || !target) return;
    const res = await supabase.rpc("admin_merge_clubs", { p_from: from.id, p_to: target.id });
    const r = res.data as { ok: boolean; message?: string; teams?: number; profiles?: number } | null;
    if (res.error || !r?.ok) return toast.error(r?.message ?? res.error?.message ?? "병합하지 못했어요");
    toast.success(`병합했어요 (팀 ${r.teams}개, 회원 ${r.profiles}명 이동)`);
    close();
    onDone();
  };
  return (
    <>
      <Modal open={!!from && !target} onClose={close} title={`'${from?.name}' 을(를) 합칠 클럽 선택`}>
        <div className="space-y-2">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="남길 클럽 이름 검색" placeholder="남길 클럽 이름 검색" />
          {hits.map((c) => (
            <button key={c.id} onClick={() => setTarget(c)} className="flex w-full items-center gap-2 rounded-md bg-panel2 px-3 py-2 text-left text-sm hover:bg-white/5">
              <b>{c.name}</b><span className="text-xs text-muted">#{c.id} · {c.sido ?? "-"} · 팀 {c.teams}개</span>
            </button>
          ))}
        </div>
      </Modal>
      <Confirm open={!!from && !!target} message={`'${from?.name}'(#${from?.id})의 팀·회원·선수 소속을 모두 '${target?.name}'(#${target?.id}) 로 옮기고 '${from?.name}' 클럽을 삭제합니다. 되돌릴 수 없어요.`} okText="병합" onOk={run} onCancel={() => setTarget(null)} />
    </>
  );
}
