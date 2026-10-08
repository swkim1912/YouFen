// 다가오는 대회(관리자 게시) 파일 서버 API — 관리자만. 글 내용 저장은 RPC admin_comp_notice_save 가 한다.
//  POST ?type=image (multipart file) : 사진 한 장 → 형식 검사 → EXIF 제거 → 긴 변 1600px webp + 480×320 썸네일 → 버킷 comp-notices/images/
//                                      → {path, thumb, w, h}. 브라우저가 긴 변 2048px 로 줄여 보낸다(Vercel 요청 본문 한도 4.5MB, 서버는 4MB 까지).
//  POST ?type=file  (JSON {name, size}) : 첨부 파일(요강·신청서 등) 올릴 '서명된 업로드 주소'를 만든다 → {path, token, contentType}.
//                                      브라우저가 저장소에 직접 올린다(파일당 10MB — 버킷 설정·여기서 모두 검사, 허용 확장자만).
//  DELETE (JSON {paths}) : 글에서 빠진 사진·파일 지우기(어느 글에서도 쓰지 않는 것만) / DELETE ?id= : 글과 그 사진·파일을 함께 삭제.
// 정리: 올리고 저장하지 않은 채 하루 지난 파일(작성 취소)은 POST 가 불릴 때 조금씩 지운다.
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audit, authed, fail } from "@/lib/serverAuth";

export const runtime = "nodejs";

const BUCKET = "comp-notices";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 8000 * 8000;
/** 첨부 파일로 받는 확장자 → 저장할 형식(버킷 allowed_mime_types 와 같은 목록 — 한쪽만 바꾸지 말 것) */
const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf", hwp: "application/x-hwp", hwpx: "application/vnd.hancom.hwpx",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip", txt: "text/plain", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
};

/** 지금 어떤 글이든 쓰고 있는 파일 경로 모음 */
async function usedPaths(admin: SupabaseClient): Promise<Set<string>> {
  const { data } = await admin.from("comp_notices").select("images,files");
  const s = new Set<string>();
  for (const n of data ?? []) {
    for (const i of (n.images ?? []) as { path: string; thumb: string }[]) { s.add(i.path); s.add(i.thumb); }
    for (const f of (n.files ?? []) as { path: string }[]) s.add(f.path);
  }
  return s;
}

/** 어느 글에도 붙지 않은 채 하루 지난 파일 정리(폴더마다 오래된 것부터 최대 100개 확인) */
async function cleanup(admin: SupabaseClient) {
  const used = await usedPaths(admin);
  const old = Date.now() - 24 * 3600 * 1000;
  const remove: string[] = [];
  for (const dir of ["images", "files"]) {
    const { data } = await admin.storage.from(BUCKET).list(dir, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
    for (const o of data ?? []) {
      const path = `${dir}/${o.name}`;
      if (o.created_at && new Date(o.created_at).getTime() < old && !used.has(path)) remove.push(path);
    }
  }
  if (remove.length) await admin.storage.from(BUCKET).remove(remove);
}

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  if (!a.isAdmin) return fail(403, "관리자만 사용할 수 있습니다");
  const type = new URL(req.url).searchParams.get("type");

  if (type === "file") {
    const body = (await req.json().catch(() => null)) as { name?: string; size?: number } | null;
    const name = (body?.name ?? "").trim();
    const size = Number(body?.size ?? 0);
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    if (!name || name.length > 150) return fail(400, "파일 이름을 확인해 주세요(150자 이내)");
    if (!FILE_TYPES[ext]) return fail(415, "PDF·한글(hwp/hwpx)·워드·엑셀·파워포인트·ZIP·TXT·JPG·PNG 파일만 올릴 수 있어요");
    if (!(size > 0) || size > MAX_FILE_BYTES) return fail(413, "파일은 10MB 까지 올릴 수 있어요");
    const path = `files/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await a.admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return fail(500, "업로드 주소를 만들지 못했어요");
    await cleanup(a.admin).catch(() => {});
    return Response.json({ ok: true, path, token: data.token, contentType: FILE_TYPES[ext] });
  }

  // 사진
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "사진 파일을 선택해 주세요");
  if (file.size > MAX_IMAGE_BYTES) return fail(413, "사진 용량이 너무 커요. 다른 사진으로 시도해 주세요");
  const input = Buffer.from(await file.arrayBuffer());
  let big: Buffer, thumb: Buffer, width = 0, height = 0;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) return fail(415, "JPG, PNG, WEBP 사진만 올릴 수 있어요");
    const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate(); // EXIF 방향 반영 후 메타데이터(촬영 위치 등)를 버리고 다시 만든다
    const out = await base.clone().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    big = out.data; width = out.info.width; height = out.info.height;
    thumb = await base.clone().resize(480, 320, { fit: "cover" }).webp({ quality: 72 }).toBuffer();
  } catch {
    return fail(400, "이미지를 읽을 수 없어요. 다른 사진으로 시도해 주세요");
  }
  const key = crypto.randomUUID();
  const path = `images/${key}.webp`;
  const thumbPath = `images/${key}_t.webp`;
  const up1 = await a.admin.storage.from(BUCKET).upload(path, big, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (up1.error) return fail(500, "사진을 저장하지 못했어요");
  const up2 = await a.admin.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (up2.error) {
    await a.admin.storage.from(BUCKET).remove([path]);
    return fail(500, "사진을 저장하지 못했어요");
  }
  await cleanup(a.admin).catch(() => {});
  return Response.json({ ok: true, path, thumb: thumbPath, w: width, h: height });
}

export async function DELETE(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  if (!a.isAdmin) return fail(403, "관리자만 사용할 수 있습니다");
  const id = Number(new URL(req.url).searchParams.get("id"));

  if (id) {
    // 글 삭제: 행을 지운 뒤 그 글의 사진·파일을 지운다
    const { data: n } = await a.admin.from("comp_notices").select("id,title,images,files").eq("id", id).maybeSingle();
    if (!n) return fail(404, "글을 찾을 수 없어요");
    const paths = [
      ...((n.images ?? []) as { path: string; thumb: string }[]).flatMap((i) => [i.path, i.thumb]),
      ...((n.files ?? []) as { path: string }[]).map((f) => f.path),
    ];
    const { error } = await a.admin.from("comp_notices").delete().eq("id", id);
    if (error) return fail(500, "지우지 못했어요");
    if (paths.length) await a.admin.storage.from(BUCKET).remove(paths);
    await audit(a, "comp_notice_delete", `comp_notice:${id}`, { title: n.title });
    return Response.json({ ok: true });
  }

  // 글에서 빠진 파일 지우기: images/·files/ 아래이고 어느 글에서도 쓰지 않는 것만
  const body = (await req.json().catch(() => null)) as { paths?: string[] } | null;
  const used = await usedPaths(a.admin);
  const paths = (body?.paths ?? []).filter((p) => typeof p === "string" && /^(images|files)\/[0-9a-f-]{36}(_t)?\.[a-z0-9]{1,5}$/.test(p) && !used.has(p)).slice(0, 30);
  if (paths.length) await a.admin.storage.from(BUCKET).remove(paths);
  return Response.json({ ok: true, removed: paths.length });
}
