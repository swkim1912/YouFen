// 다가오는 대회(관리자 게시) 공용: 타입, 공개 주소, 사진·파일 올리기(브라우저 전용).
// DB: comp_notices (supabase/community_6_photos_notices.sql), 서버 API: /api/comp-notice
import { supabase } from "./supabase";
import { callApi } from "./adminApi";
import { shrinkImage } from "./communityUpload";

export const NOTICE_BUCKET = "comp-notices";
export const NOTICE_IMAGE_MAX = 5;
export const NOTICE_FILE_MAX = 5;
export const NOTICE_FILE_MB = 10;
export const NOTICE_BODY_MAX = 5000;
/** 첨부 파일 고르기 창에 보일 확장자(서버 FILE_TYPES 와 같은 목록) */
export const NOTICE_FILE_ACCEPT = ".pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.jpg,.jpeg,.png";

export interface NoticeImage { path: string; thumb: string; w: number | null; h: number | null }
export interface NoticeFile { path: string; name: string; size: number; type: string }
export interface CompNotice {
  id: number;
  title: string;
  start_date: string;       // YYYY-MM-DD
  end_date: string | null;
  place: string | null;
  body: string;
  link_url: string | null;
  images: NoticeImage[];
  files: NoticeFile[];
  published?: boolean;
  updated_at: string;
}

/** 공개 주소. download 를 주면 그 이름으로 내려받는 주소 */
export function noticeUrl(path: string, download?: string): string {
  return supabase.storage.from(NOTICE_BUCKET).getPublicUrl(path, download ? { download } : undefined).data.publicUrl;
}

/** 파일 크기 표시 */
export const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 대회 일자 표시: '10.12(일)' 또는 '10.12(일) ~ 10.14(화)' */
export function noticeDateText(start: string, end: string | null): string {
  const f = (s: string) => {
    const d = new Date(`${s}T00:00:00`);
    return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}(${"일월화수목금토"[d.getDay()]})`;
  };
  return end && end !== start ? `${f(start)} ~ ${f(end)}` : f(start);
}

/** 대회까지 남은 날: 'D-3', 당일·진행 중이면 'D-DAY'/'진행 중' */
export function dday(start: string, end: string | null): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const s = new Date(`${start}T00:00:00`).getTime();
  const e = new Date(`${end ?? start}T00:00:00`).getTime();
  const t = today.getTime();
  if (t < s) return `D-${Math.round((s - t) / 86400000)}`;
  if (t <= e) return t === s ? "D-DAY" : "진행 중";
  return "종료";
}

/** 사진 한 장 올리기(관리자) */
export async function uploadNoticeImage(file: File): Promise<NoticeImage | { error: string }> {
  if (file.size > 20 * 1024 * 1024) return { error: "20MB 이하 사진만 올릴 수 있어요" };
  const fd = new FormData();
  fd.append("file", new File([await shrinkImage(file)], "photo.jpg", { type: "image/jpeg" }));
  const r = await callApi("/api/comp-notice?type=image", { method: "POST", body: fd });
  if (!r.ok) return { error: r.message ?? "사진을 올리지 못했어요" };
  return { path: r.path as string, thumb: r.thumb as string, w: (r.w as number) ?? null, h: (r.h as number) ?? null };
}

/** 첨부 파일 하나 올리기(관리자): 서버에서 서명된 업로드 주소를 받아 저장소에 직접 올린다(10MB 까지) */
export async function uploadNoticeFile(file: File): Promise<NoticeFile | { error: string }> {
  if (file.size > NOTICE_FILE_MB * 1024 * 1024) return { error: `파일은 ${NOTICE_FILE_MB}MB 까지 올릴 수 있어요` };
  const r = await callApi("/api/comp-notice?type=file", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }),
  });
  if (!r.ok) return { error: r.message ?? "파일을 올리지 못했어요" };
  const path = r.path as string;
  const contentType = r.contentType as string;
  const { error } = await supabase.storage.from(NOTICE_BUCKET).uploadToSignedUrl(path, r.token as string, file, { contentType });
  if (error) return { error: "파일을 올리지 못했어요" };
  return { path, name: file.name, size: file.size, type: contentType };
}
