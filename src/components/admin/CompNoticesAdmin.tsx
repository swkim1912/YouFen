"use client";
// 관리자: 다가오는 대회 게시 (대회 화면 위쪽에 보임)
// - 목록: admin_comp_notices(지난 것·숨긴 것 포함, 최근 200개). 고치기·삭제.
// - 쓰기: 대회명, 시작일·종료일(선택 — 종료일이 지나면 대회 화면에서 자동으로 빠짐), 장소, 관련 링크(https), 내용(5,000자),
//   사진 최대 5장(첫 장 = 대표, 누르면 대표로), 첨부 파일 최대 5개(파일당 10MB, PDF·한글·워드·엑셀 등), 게시/숨김.
// - 저장: RPC admin_comp_notice_save. 글에서 뺀 사진·파일과 저장하지 않고 닫은 새 파일은 서버 API(DELETE /api/comp-notice)로 지운다.
// - 삭제: DELETE /api/comp-notice?id= (글 + 사진·파일). 처리 내역은 관리 기록(admin_audit)에 남는다.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { callApi } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  NOTICE_BODY_MAX, NOTICE_FILE_ACCEPT, NOTICE_FILE_MAX, NOTICE_FILE_MB, NOTICE_IMAGE_MAX,
  type CompNotice, type NoticeFile, type NoticeImage, dday, noticeDateText, noticeUrl, sizeText, uploadNoticeFile, uploadNoticeImage,
} from "@/lib/compNotice";
import { cn } from "@/lib/utils";

/** 사진·파일이 쓰는 저장소 경로 모음 */
const pathsOf = (imgs: NoticeImage[], files: NoticeFile[]) => [...imgs.flatMap((i) => [i.path, i.thumb]), ...files.map((f) => f.path)];
const removePaths = (paths: string[]) =>
  paths.length ? callApi("/api/comp-notice", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) }) : Promise.resolve(null);

export function CompNoticesAdmin() {
  const [list, setList] = useState<CompNotice[] | null>(null);
  const [editing, setEditing] = useState<CompNotice | "new" | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_comp_notices");
    setList((data ?? []) as CompNotice[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (n: CompNotice) => {
    if (!window.confirm(`「${n.title}」을(를) 지울까요? 사진·첨부 파일도 함께 지워져요.`)) return;
    const r = await callApi(`/api/comp-notice?id=${n.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error(r.message ?? "지우지 못했어요");
    toast.success("지웠어요");
    load();
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-base font-bold">다가오는 대회</h2>
        <Button size="sm" onClick={() => setEditing("new")}>새 대회 올리기</Button>
      </div>
      <p className="text-xs text-muted">대회 화면 맨 위에 보여요(비로그인 포함). 종료일(없으면 시작일)이 지나면 자동으로 빠져요. 사진 {NOTICE_IMAGE_MAX}장, 첨부 파일 {NOTICE_FILE_MAX}개(파일당 {NOTICE_FILE_MB}MB)까지 올릴 수 있어요.</p>
      {list === null ? <p className="py-4 text-center text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="py-4 text-center text-sm text-muted">올린 대회가 없습니다</p> : (
        <ul className="divide-y divide-line">
          {list.map((n) => {
            const dd = dday(n.start_date, n.end_date);
            return (
              <li key={n.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={cn("w-14 shrink-0 text-center text-[11px] font-bold", dd === "종료" ? "text-muted" : "text-brand")}>{dd}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{n.title}{!n.published && <span className="ml-1.5 text-[11px] font-normal text-pending">(숨김)</span>}</p>
                  <p className="text-xs text-muted">{noticeDateText(n.start_date, n.end_date)}{n.place ? ` · ${n.place}` : ""} · 사진 {n.images.length} · 파일 {n.files.length}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(n)}>고치기</Button>
                <Button size="sm" variant="ghost" className="text-loss" onClick={() => remove(n)}>삭제</Button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <NoticeForm initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </section>
  );
}

function NoticeForm({ initial, onClose, onSaved }: { initial: CompNotice | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [start, setStart] = useState(initial?.start_date ?? "");
  const [end, setEnd] = useState(initial?.end_date ?? "");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [link, setLink] = useState(initial?.link_url ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [published, setPublished] = useState(initial?.published ?? true);
  const [images, setImages] = useState<NoticeImage[]>(initial?.images ?? []);
  const [files, setFiles] = useState<NoticeFile[]>(initial?.files ?? []);
  const [busy, setBusy] = useState<string | null>(null); // 진행 중인 일 문구
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 이 창에서 새로 올린 경로(저장하지 않고 닫으면 지운다)
  const fresh = useRef<string[]>([]);

  const pickImages = async (list: FileList | null) => {
    const picked = Array.from(list ?? []); // 입력칸을 비우기 전에 복사(FileList 는 입력칸과 연결돼 있음)
    if (imgRef.current) imgRef.current.value = "";
    const room = NOTICE_IMAGE_MAX - images.length;
    if (picked.length > room) toast.error(`사진은 ${NOTICE_IMAGE_MAX}장까지 올릴 수 있어요`);
    for (const f of picked.slice(0, Math.max(room, 0))) {
      setBusy("사진 올리는 중…");
      const r = await uploadNoticeImage(f);
      if ("error" in r) { toast.error(r.error); continue; }
      fresh.current.push(r.path, r.thumb);
      setImages((cur) => [...cur, r]);
    }
    setBusy(null);
  };
  const pickFiles = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    const room = NOTICE_FILE_MAX - files.length;
    if (picked.length > room) toast.error(`첨부 파일은 ${NOTICE_FILE_MAX}개까지 올릴 수 있어요`);
    for (const f of picked.slice(0, Math.max(room, 0))) {
      setBusy(`「${f.name}」 올리는 중…`);
      const r = await uploadNoticeFile(f);
      if ("error" in r) { toast.error(`${f.name}: ${r.error}`); continue; }
      fresh.current.push(r.path);
      setFiles((cur) => [...cur, r]);
    }
    setBusy(null);
  };

  const close = () => {
    removePaths(fresh.current); // 저장하지 않은 새 파일 정리(어느 글에서도 안 쓰는 것만 서버가 지움)
    onClose();
  };

  const save = async () => {
    if (title.trim().length < 2) return toast.error("대회명을 2자 이상 적어 주세요");
    if (!start) return toast.error("대회 시작일을 정해 주세요");
    if (end && end < start) return toast.error("종료일이 시작일보다 빨라요");
    if (link.trim() && !/^https:\/\//.test(link.trim())) return toast.error("관련 링크는 https:// 로 시작해야 해요");
    setBusy("저장하는 중…");
    const { error } = await supabase.rpc("admin_comp_notice_save", {
      p_id: initial?.id ?? null,
      p_data: { title: title.trim(), start_date: start, end_date: end || null, place: place.trim(), link_url: link.trim(), body: body.trim(), images, files, published },
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    // 글에서 빠진 예전 사진·파일, 올렸다가 뺀 새 파일 정리
    const keep = new Set(pathsOf(images, files));
    const before = initial ? pathsOf(initial.images, initial.files) : [];
    await removePaths([...before, ...fresh.current].filter((p) => !keep.has(p)));
    toast.success(initial ? "고쳤어요" : "올렸어요");
    onSaved();
  };

  const makeFirst = (i: number) => setImages((cur) => [cur[i], ...cur.filter((_, j) => j !== i)]);

  return (
    <Modal open onClose={close} title={initial ? "다가오는 대회 고치기" : "다가오는 대회 올리기"} wide>
      <div className="space-y-3">
        <div>
          <Label>대회명</Label>
          <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="예: 제00회 ○○배 전국 동호인 펜싱대회" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>시작일</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>종료일 (선택)</Label><Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>장소 (선택)</Label><Input value={place} maxLength={100} onChange={(e) => setPlace(e.target.value)} placeholder="예: ○○체육관" /></div>
          <div><Label>관련 링크 (선택)</Label><Input value={link} maxLength={300} onChange={(e) => setLink(e.target.value)} placeholder="https://… (협회 공지 등)" /></div>
        </div>
        <div>
          <Label>내용</Label>
          <Textarea value={body} maxLength={NOTICE_BODY_MAX} rows={6} onChange={(e) => setBody(e.target.value)} placeholder="종목·종별, 신청 기간, 참가비, 문의처 등" />
          <p className="mt-1 text-right text-[11px] text-muted">{body.length}/{NOTICE_BODY_MAX}</p>
        </div>

        <div className="space-y-1.5">
          <Label>사진 ({images.length}/{NOTICE_IMAGE_MAX}) — 첫 장이 대표 사진, 누르면 대표로</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((im, i) => (
              <div key={im.path} className="relative">
                <button type="button" onClick={() => makeFirst(i)} className={cn("block h-20 w-28 overflow-hidden rounded-md border", i === 0 ? "border-brand" : "border-line")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={noticeUrl(im.thumb)} alt="" className="h-full w-full object-cover" />
                </button>
                {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-brand px-1 text-[10px] font-semibold text-brand-ink">대표</span>}
                <button type="button" aria-label="사진 빼기" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-panel p-0.5 text-muted shadow hover:text-loss"><X size={14} /></button>
              </div>
            ))}
            {images.length < NOTICE_IMAGE_MAX && (
              <button type="button" disabled={!!busy} onClick={() => imgRef.current?.click()}
                className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-xs text-muted hover:text-foreground disabled:opacity-50">
                <ImagePlus size={18} />사진 추가
              </button>
            )}
          </div>
          <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => pickImages(e.target.files)} />
        </div>

        <div className="space-y-1.5">
          <Label>첨부 파일 ({files.length}/{NOTICE_FILE_MAX}, 파일당 {NOTICE_FILE_MB}MB — PDF·한글·워드·엑셀·파워포인트·ZIP 등)</Label>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={f.path} className="flex items-center gap-2 rounded-md bg-panel2 px-3 py-1.5 text-sm">
                  <FileText size={14} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted">{sizeText(f.size)}</span>
                  <button type="button" aria-label="파일 빼기" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} className="text-muted hover:text-loss"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {files.length < NOTICE_FILE_MAX && (
            <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => fileRef.current?.click()}><Paperclip size={14} className="mr-1" />파일 추가</Button>
          )}
          <input ref={fileRef} type="file" accept={NOTICE_FILE_ACCEPT} multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-4 w-4 accent-brand" />
          대회 화면에 게시(끄면 숨김)
        </label>
        <div className="flex items-center justify-end gap-2">
          {busy && <span className="mr-auto text-xs text-muted">{busy}</span>}
          <Button variant="outline" onClick={close} disabled={!!busy}>닫기</Button>
          <Button onClick={save} disabled={!!busy}>{initial ? "저장" : "올리기"}</Button>
        </div>
      </div>
    </Modal>
  );
}
