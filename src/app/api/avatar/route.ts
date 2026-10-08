// 프로필 사진 서버 API.
//  POST   multipart(file)          : 사진 올리기 → 형식·용량 검사 → EXIF 제거·512px 정사각 webp 재인코딩 → Google Vision SafeSearch 검열 → 버킷 저장 → profiles.avatar_url
//  PATCH  {mode:"default", n:1} | {mode:"club"} : 기본 프로필 N번 / 소속팀 이미지(기본)로 되돌리기 (올린 파일은 삭제)
//  DELETE ?target=<uid>[&lock=0]   : 관리자가 다른 사용자의 사진을 지우고 이후 등록을 막는다 (신고 처리). lock=0 이면 지우기만
//  ?slot=community 를 붙이면 유펜 프로필 대신 '커뮤니티 전용 프로필' 사진(community_profiles.avatar_url)을 다룬다.
//    파일 위치 avatars/community/<uid>/, PATCH 는 {mode:"default", n:1} | {mode:"none"}(사진 없음 = 닉네임 첫 글자).
//    검사·한도(하루 2회는 유펜·커뮤니티 사진 합산, 월 950건)와 변경 제한(avatar_locked)은 유펜 사진과 같다(docs/COMMUNITY.md 0-3).
// 보안: 클라이언트는 버킷에 직접 쓸 수 없고(쓰기 정책 없음), avatar_url 에 사진 URL 을 직접 넣을 수도 없다(DB 트리거) → 항상 이 API(검열)를 거친다.
// 필요한 서버 환경변수: SUPABASE_SERVICE_ROLE_KEY, GOOGLE_VISION_API_KEY. 없으면 올리기는 닫는다(검열 없이 열지 않음).
// 비용 보호: Vision 은 월 1,000건까지만 무료 → 이번 달 호출이 VISION_MONTHLY_LIMIT 에 닿으면 사진 올리기를 막는다(기본 950, 시간대·동시 요청 오차 여유).
//   사용자별로는 24시간에 DAILY_LIMIT(2)회까지(검사에서 거절된 시도도 1회로 센다). 기본 프로필/소속팀 이미지로 바꾸기(PATCH)는 Vision 을 쓰지 않으므로 제한 없음.
// 용량: 사용자는 12MB 까지 고를 수 있고, 브라우저가 1024px 로 줄여 보낸다(Vercel 함수 요청 본문 한도 4.5MB). 서버는 줄어든 파일을 MAX_BYTES 로 다시 확인한다.
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // 서버가 받는 파일(브라우저가 줄인 뒤) — Vercel 본문 한도 4.5MB 미만
const MAX_PIXELS = 6000 * 6000; // 압축 폭탄 방지
const DAILY_LIMIT = 2; // 사용자당 24시간 Vision 검사 횟수
const MONTHLY_LIMIT = Number(process.env.VISION_MONTHLY_LIMIT) || 950; // 월 무료 1,000건 직전에서 막는다
const BUCKET = "avatars";
const LEVELS = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"];
const lv = (s?: string) => Math.max(0, LEVELS.indexOf(s ?? "UNKNOWN"));

const fail = (status: number, message: string) => Response.json({ ok: false, message }, { status });

/** 서비스 키 클라이언트 + 요청자 확인 */
async function authed(req: Request): Promise<{ admin: SupabaseClient; uid: string; isAdmin: boolean } | Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail(503, "프로필 사진 등록은 준비 중입니다");
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "로그인이 필요합니다");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return fail(401, "로그인이 필요합니다");
  const { data: p } = await admin.from("profiles").select("is_admin").eq("id", data.user.id).maybeSingle();
  return { admin, uid: data.user.id, isAdmin: !!p?.is_admin };
}

type Slot = "youfen" | "community";
/** 요청 주소의 ?slot= 값. community 가 아니면 모두 유펜 프로필 사진 */
const slotOf = (req: Request): Slot => (new URL(req.url).searchParams.get("slot") === "community" ? "community" : "youfen");
/** 사진 파일을 두는 폴더: 유펜 = <uid>/, 커뮤니티 = community/<uid>/ */
const dirOf = (uid: string, slot: Slot) => (slot === "community" ? `community/${uid}` : uid);

/** 이 사용자의 이전 사진 파일을 모두 삭제 (해당 slot 폴더만) */
async function clearFiles(admin: SupabaseClient, uid: string, slot: Slot = "youfen") {
  const dir = dirOf(uid, slot);
  const { data } = await admin.storage.from(BUCKET).list(dir);
  // 유펜 폴더(<uid>/) 목록에는 파일만 있다. 폴더 항목(id 없음)은 지우지 않는다
  const files = (data ?? []).filter((f) => f.id);
  if (files.length) await admin.storage.from(BUCKET).remove(files.map((f) => `${dir}/${f.name}`));
}

/** 사진 주소 저장: 유펜 = profiles.avatar_url, 커뮤니티 = community_profiles.avatar_url(행이 없으면 만든다) */
async function saveUrl(admin: SupabaseClient, uid: string, slot: Slot, value: string | null) {
  if (slot === "community") {
    return admin.from("community_profiles").upsert({ user_id: uid, avatar_url: value }, { onConflict: "user_id" });
  }
  return admin.from("profiles").update({ avatar_url: value }).eq("id", uid);
}

/** SafeSearch 로 부적절한 이미지인지 검사. 통과하면 null, 아니면 거절 사유. 검사 자체가 실패하면 예외(=거절) */
async function moderate(jpeg: Buffer): Promise<string | null> {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) throw new Error("no-vision-key");
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: jpeg.toString("base64") }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }] }),
  });
  if (!res.ok) throw new Error(`vision-${res.status}`);
  const j = await res.json();
  const s = j?.responses?.[0]?.safeSearchAnnotation;
  if (!s) throw new Error("vision-empty");
  if (lv(s.adult) >= lv("POSSIBLE") || lv(s.racy) >= lv("LIKELY")) return "선정적인 이미지는 사용할 수 없어요";
  if (lv(s.violence) >= lv("LIKELY")) return "폭력적인 이미지는 사용할 수 없어요";
  return null;
}

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  const { admin, uid } = a;
  const slot = slotOf(req);
  if (!process.env.GOOGLE_VISION_API_KEY) return fail(503, "프로필 사진 등록은 준비 중입니다");

  const { data: me } = await admin.from("profiles").select("avatar_locked").eq("id", uid).maybeSingle();
  if (me?.avatar_locked) return fail(403, "프로필 사진 등록이 제한된 계정입니다. 문의해 주세요");

  // 한도 미리 확인 (Vision 호출 기록 기준, 사진 처리 전에 빨리 거절하기 위함): 사용자별 24시간 + 전체 이번 달(UTC 월초부터)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: mine } = await admin.from("avatar_vision_calls").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
  if ((mine ?? 0) >= DAILY_LIMIT) return fail(429, `사진 변경은 하루 ${DAILY_LIMIT}회까지 가능해요. 내일 다시 시도해 주세요`);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count: month } = await admin.from("avatar_vision_calls").select("id", { count: "exact", head: true }).gte("created_at", monthStart);
  if ((month ?? 0) >= MONTHLY_LIMIT) return fail(503, "이번 달 사진 등록 가능 횟수를 모두 사용했어요. 기본 프로필은 계속 쓸 수 있고, 사진 등록은 다음 달에 다시 열려요");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "사진 파일을 선택해 주세요");
  if (file.size > MAX_BYTES) return fail(413, "사진 용량이 너무 커요. 다른 사진으로 시도해 주세요");

  const input = Buffer.from(await file.arrayBuffer());
  let webp: Buffer, jpeg: Buffer;
  try {
    // 확장자/MIME 이 아니라 실제 이미지 내용으로 형식을 확인한다 (jpeg·png·webp 만)
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) return fail(415, "JPG, PNG, WEBP 사진만 올릴 수 있어요");
    // rotate(): EXIF 방향을 반영한 뒤 메타데이터(위치정보 등)를 모두 버리고 512px 정사각으로 다시 만든다(편집기가 이미 512 정사각으로 보내므로 사실상 재인코딩)
    const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().resize(512, 512, { fit: "cover" });
    webp = await base.clone().webp({ quality: 82 }).toBuffer();
    jpeg = await base.clone().jpeg({ quality: 85 }).toBuffer();
  } catch {
    return fail(400, "이미지를 읽을 수 없어요. 다른 사진으로 시도해 주세요");
  }

  // 여기부터 Vision 을 실제로 호출한다 → 한도 확인과 호출 기록을 DB 함수 하나로 한 번에 처리한다(거절·실패한 시도도 한도에 센다).
  // 위의 확인은 빠른 안내용이고, 동시에 여러 요청을 보내 한도를 넘는 것은 이 함수(잠금 후 확인·기록)가 막는다.
  const { data: reserved, error: slotErr } = await admin.rpc("reserve_vision_call", { p_uid: uid, p_daily: DAILY_LIMIT, p_monthly: MONTHLY_LIMIT });
  if (slotErr) return fail(503, "사진 검사를 할 수 없어 지금은 등록할 수 없어요. 잠시 후 다시 시도해 주세요");
  if (reserved === "daily") return fail(429, `사진 변경은 하루 ${DAILY_LIMIT}회까지 가능해요. 내일 다시 시도해 주세요`);
  if (reserved !== "ok") return fail(503, "이번 달 사진 등록 가능 횟수를 모두 사용했어요. 기본 프로필은 계속 쓸 수 있고, 사진 등록은 다음 달에 다시 열려요");
  try {
    const reason = await moderate(jpeg);
    if (reason) return fail(422, reason);
  } catch {
    return fail(503, "사진 검사를 할 수 없어 지금은 등록할 수 없어요. 잠시 후 다시 시도해 주세요");
  }

  await clearFiles(admin, uid, slot);
  const path = `${dirOf(uid, slot)}/${Date.now()}.webp`;
  const up = await admin.storage.from(BUCKET).upload(path, webp, { contentType: "image/webp", upsert: false });
  if (up.error) return fail(500, "사진을 저장하지 못했어요");
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const { error } = await saveUrl(admin, uid, slot, pub.publicUrl);
  if (error) return fail(500, "프로필에 반영하지 못했어요");
  await admin.from("avatar_uploads").insert({ user_id: uid });
  return Response.json({ ok: true, url: pub.publicUrl });
}

export async function PATCH(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  const { admin, uid } = a;
  const slot = slotOf(req);
  const body = await req.json().catch(() => ({}));
  const { data: me } = await admin.from("profiles").select("avatar_locked").eq("id", uid).maybeSingle();
  if (me?.avatar_locked) return fail(403, "프로필 사진 변경이 제한된 계정입니다");
  let value: string | null;
  if (body.mode === "default" && Number.isInteger(body.n) && body.n === 1) value = `default:${body.n}`;
  else if (slot === "youfen" && body.mode === "club") value = null; // 유펜: 소속팀 이미지
  else if (slot === "community" && body.mode === "none") value = null; // 커뮤니티: 사진 없음(닉네임 첫 글자) — 소속은 쓰지 않는다
  else return fail(400, "잘못된 요청입니다");
  const { error } = await saveUrl(admin, uid, slot, value);
  if (error) return fail(500, "저장하지 못했어요");
  await clearFiles(admin, uid, slot);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  if (!a.isAdmin) return fail(403, "관리자만 사용할 수 있습니다");
  const target = new URL(req.url).searchParams.get("target");
  if (!target || !/^[0-9a-f-]{36}$/i.test(target)) return fail(400, "잘못된 요청입니다");
  // lock=0 이면 사진만 지우고 변경 제한은 걸지 않는다(기본은 제한)
  const lock = new URL(req.url).searchParams.get("lock") !== "0";
  const slot = slotOf(req);
  if (slot === "community") {
    // 커뮤니티 사진: 행이 있을 때만 지운다(없으면 지울 사진도 없음). 변경 제한은 유펜 사진과 같은 avatar_locked 를 쓴다
    const { error } = await a.admin.from("community_profiles").update({ avatar_url: null }).eq("user_id", target);
    if (error) return fail(500, "처리하지 못했어요");
    if (lock) await a.admin.from("profiles").update({ avatar_locked: true }).eq("id", target);
  } else {
    const { error } = await a.admin.from("profiles").update(lock ? { avatar_url: null, avatar_locked: true } : { avatar_url: null }).eq("id", target);
    if (error) return fail(500, "처리하지 못했어요");
    await a.admin.from("avatar_reports").update({ status: "resolved" }).eq("target_id", target).eq("status", "open");
  }
  await clearFiles(a.admin, target, slot);
  await a.admin.from("admin_audit").insert({ admin_id: a.uid, action: (slot === "community" ? "c" : "") + (lock ? "avatar_remove_lock" : "avatar_remove"), target });
  return Response.json({ ok: true });
}
