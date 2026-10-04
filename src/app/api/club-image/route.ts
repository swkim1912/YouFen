// 클럽(소속팀) 이미지 서버 API. 이미지는 clubs.image_url 로 쓰이며, 프로필 사진의 기본값(소속팀 이미지)이 된다.
//  POST   multipart(file, club_id)  관리자: 바로 등록 / 해당 클럽 소속 '승인된 지도자'(profiles.role='지도자', leader_status='approved', club_id 일치): 승인 대기 신청(관리자가 눈으로 확인 후 승인)
//  PATCH  {id, action: "approve" | "reject"}  관리자: 신청 승인(이미지 반영) / 반려(파일 삭제)
//  DELETE ?club_id=<id>             관리자: 클럽 이미지 제거(기본 글자 표시로 돌아감)
// 보안: 버킷 club-images 는 읽기만 공개이고 쓰기 정책이 없어 이 API(서비스 키)로만 쓸 수 있다.
//   파일은 형식(jpeg·png·webp)을 실제 내용으로 확인하고 512×512 이내 webp 로 다시 만들어 저장한다(메타데이터 제거).
//   지도자 신청은 자동 검열(Vision) 대신 관리자가 승인 전에 직접 본다 — 승인 전까지는 어디에도 표시되지 않는다.
import sharp from "sharp";
import { audit, authed, fail } from "@/lib/serverAuth";

export const runtime = "nodejs";

const BUCKET = "club-images";
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 6000 * 6000;

async function toWebp(file: File): Promise<Buffer | Response> {
  if (file.size > MAX_BYTES) return fail(413, "이미지 용량이 너무 커요 (4MB 이하)");
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) return fail(415, "JPG, PNG, WEBP 이미지만 올릴 수 있어요");
    // 로고는 잘리지 않게 contain(투명 여백), 최대 512×512
    return await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 85 }).toBuffer();
  } catch {
    return fail(400, "이미지를 읽을 수 없어요");
  }
}

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const clubId = Number(form?.get("club_id"));
  if (!(file instanceof File) || !Number.isInteger(clubId)) return fail(400, "이미지와 클럽을 선택해 주세요");
  const { data: club } = await a.admin.from("clubs").select("id,name").eq("id", clubId).maybeSingle();
  if (!club) return fail(404, "클럽을 찾을 수 없어요");

  if (!a.isAdmin) {
    // 지도자 신청 자격: 관리자 승인을 받은 지도자(leader_status='approved')이고 소속 클럽이 같아야 한다
    const { data: me } = await a.admin.from("profiles").select("role,club_id,leader_status").eq("id", a.uid).maybeSingle();
    if (me?.role !== "지도자" || me.club_id !== clubId) return fail(403, "소속 클럽의 지도자만 신청할 수 있어요");
    if (me.leader_status !== "approved") return fail(403, "관리자의 지도자 승인을 받은 뒤 신청할 수 있어요");
    const { count: pendingClub } = await a.admin.from("club_image_requests").select("id", { count: "exact", head: true }).eq("club_id", clubId).eq("status", "pending");
    if ((pendingClub ?? 0) > 0) return fail(409, "이미 검토 중인 신청이 있어요. 결과가 나온 뒤 다시 신청해 주세요");
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: mine } = await a.admin.from("club_image_requests").select("id", { count: "exact", head: true }).eq("requested_by", a.uid).gte("created_at", since);
    if ((mine ?? 0) >= 3) return fail(429, "하루 3번까지 신청할 수 있어요");
  }

  const webp = await toWebp(file);
  if (webp instanceof Response) return webp;

  if (a.isAdmin) {
    const path = `clubs/${clubId}-${Date.now()}.webp`;
    const up = await a.admin.storage.from(BUCKET).upload(path, webp, { contentType: "image/webp" });
    if (up.error) return fail(500, "이미지를 저장하지 못했어요");
    await removeClubFiles(a.admin, clubId, path);
    const { data: pub } = a.admin.storage.from(BUCKET).getPublicUrl(path);
    await a.admin.from("clubs").update({ image_url: pub.publicUrl }).eq("id", clubId);
    await audit(a, "club_image_set", String(clubId), { club: club.name });
    return Response.json({ ok: true, url: pub.publicUrl });
  }
  const id = crypto.randomUUID();
  const path = `pending/${id}.webp`;
  const up = await a.admin.storage.from(BUCKET).upload(path, webp, { contentType: "image/webp" });
  if (up.error) return fail(500, "이미지를 저장하지 못했어요");
  const { error } = await a.admin.from("club_image_requests").insert({ id, club_id: clubId, requested_by: a.uid, path });
  if (error) return fail(500, "신청을 저장하지 못했어요");
  return Response.json({ ok: true, pending: true });
}

export async function PATCH(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  if (!a.isAdmin) return fail(403, "관리자만 사용할 수 있습니다");
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approve", "reject"].includes(body.action)) return fail(400, "잘못된 요청입니다");
  const { data: r } = await a.admin.from("club_image_requests").select("*").eq("id", id).maybeSingle();
  if (!r || r.status !== "pending") return fail(404, "처리할 신청이 없어요");
  const now = new Date().toISOString();
  if (body.action === "approve") {
    const dest = `clubs/${r.club_id}-${Date.now()}.webp`;
    const mv = await a.admin.storage.from(BUCKET).move(r.path, dest);
    if (mv.error) return fail(500, "이미지를 옮기지 못했어요");
    await removeClubFiles(a.admin, r.club_id, dest);
    const { data: pub } = a.admin.storage.from(BUCKET).getPublicUrl(dest);
    await a.admin.from("clubs").update({ image_url: pub.publicUrl }).eq("id", r.club_id);
    await a.admin.from("club_image_requests").update({ status: "approved", decided_at: now, decided_by: a.uid, path: dest }).eq("id", id);
    await audit(a, "club_image_approve", String(r.club_id), { request: id });
  } else {
    await a.admin.storage.from(BUCKET).remove([r.path]);
    await a.admin.from("club_image_requests").update({ status: "rejected", decided_at: now, decided_by: a.uid }).eq("id", id);
    await audit(a, "club_image_reject", String(r.club_id), { request: id });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  if (!a.isAdmin) return fail(403, "관리자만 사용할 수 있습니다");
  const clubId = Number(new URL(req.url).searchParams.get("club_id"));
  if (!Number.isInteger(clubId)) return fail(400, "잘못된 요청입니다");
  await a.admin.from("clubs").update({ image_url: null }).eq("id", clubId);
  await removeClubFiles(a.admin, clubId, null);
  await audit(a, "club_image_remove", String(clubId));
  return Response.json({ ok: true });
}

/** 클럽의 이전 이미지 파일 삭제(keep 은 남길 새 파일) */
async function removeClubFiles(admin: import("@supabase/supabase-js").SupabaseClient, clubId: number, keep: string | null) {
  const { data } = await admin.storage.from(BUCKET).list("clubs", { search: `${clubId}-` });
  const old = (data ?? []).map((f) => `clubs/${f.name}`).filter((p) => p.startsWith(`clubs/${clubId}-`) && p !== keep);
  if (old.length) await admin.storage.from(BUCKET).remove(old);
}
