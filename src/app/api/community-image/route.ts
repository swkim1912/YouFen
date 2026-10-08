// 커뮤니티 사진 서버 API (docs/COMMUNITY.md 2·3·4·9장) — 게시판·장터·1:1 채팅·자유톡방·오픈피스트 공용
//  POST multipart(file) ?kind=post|market|dm|chat|openpiste : 사진 한 장 올리기 → 형식 검사 → EXIF(촬영 위치 등) 제거 → 긴 변 1280px webp + 320px 정사각 썸네일 → 버킷 community 저장
//                          → community_uploads(kind)에 기록하고 {id, path, thumb} 를 돌려준다. 저장할 때 board_write·market_write·dm_send·chat_send·op_write 에 이 id 를 넘긴다.
// 규칙: 로그인 + 커뮤니티 정지 아님, 24시간 한도 = 게시판 30장·장터 40장·1:1 채팅 30장·자유톡방 30장·오픈피스트 20장. 장터·1:1 채팅·오픈피스트는 선수 연결 회원만(DB 함수도 다시 검사).
//       부적절성 자동 검사(Vision)는 하지 않는다(사용자 결정 — 신고로 처리).
// 정리: 글·장터 글·1:1 메시지·자유톡방 메시지·오픈피스트 모집글 어디에도 붙지 않은 채 하루가 지난 사진(작성 취소, 수정으로 빠짐, 완전 삭제된 글, 1달 지난 메시지)은
//       이 API 가 불릴 때마다 조금씩(최대 20개) 파일과 기록을 지운다.
//       (Supabase 는 storage.objects 를 SQL 로 지울 수 없어 서버가 저장소 API 로 지워야 한다)
// 용량: 브라우저가 긴 변 2048px 로 줄여 보낸다(Vercel 요청 본문 한도 4.5MB). 서버는 4MB 까지만 받는다.
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authed, fail } from "@/lib/serverAuth";

export const runtime = "nodejs";

const BUCKET = "community";
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 8000 * 8000; // 압축 폭탄 방지
const LIMITS = { post: 30, market: 40, dm: 30, chat: 30, openpiste: 20 } as const; // 종류별 24시간 한도
type Kind = keyof typeof LIMITS;
const DIRS: Record<Kind, string> = { post: "posts", market: "market", dm: "dm", chat: "chat", openpiste: "openpiste" };

/** 어디에도 붙지 않은 채 하루 지난 사진을 최대 n개 정리 */
async function cleanupOrphans(admin: SupabaseClient, n = 20) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await admin.from("community_uploads").select("id,path,thumb")
    .is("post_id", null).is("listing_id", null).is("message_id", null).is("chat_message_id", null).is("op_post_id", null).lt("created_at", since).limit(n);
  if (!data?.length) return;
  await admin.storage.from(BUCKET).remove(data.flatMap((u) => [u.path, u.thumb]));
  await admin.from("community_uploads").delete().in("id", data.map((u) => u.id));
}

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  const { admin, uid } = a;
  const k = new URL(req.url).searchParams.get("kind");
  const kind: Kind = k === "market" || k === "dm" || k === "chat" || k === "openpiste" ? k : "post";

  // 커뮤니티 정지 중이면 올릴 수 없다
  const { data: ban } = await admin.from("community_bans").select("id,until").eq("user_id", uid).is("lifted_at", null)
    .or(`until.is.null,until.gt.${new Date().toISOString()}`).limit(1);
  if (ban?.length) return fail(403, "커뮤니티 이용이 제한되어 사진을 올릴 수 없어요");

  // 장터·1:1 채팅·오픈피스트 모집글은 선수를 연결한 회원만(게시판·자유톡방은 로그인 회원 누구나)
  if (kind === "market" || kind === "dm" || kind === "openpiste") {
    const { count: links } = await admin.from("athlete_links").select("athlete_id", { count: "exact", head: true }).eq("profile_id", uid);
    if (!links) return fail(403, kind === "openpiste" ? "모집글은 선수를 연결한 회원만 쓸 수 있어요" : "장터는 선수를 연결한 회원만 이용할 수 있어요");
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("community_uploads").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("kind", kind).gte("created_at", since);
  if ((count ?? 0) >= LIMITS[kind]) return fail(429, `사진은 하루 ${LIMITS[kind]}장까지 올릴 수 있어요`);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "사진 파일을 선택해 주세요");
  if (file.size > MAX_BYTES) return fail(413, "사진 용량이 너무 커요. 다른 사진으로 시도해 주세요");

  const input = Buffer.from(await file.arrayBuffer());
  let big: Buffer, thumb: Buffer, width = 0, height = 0;
  try {
    // 확장자가 아니라 실제 내용으로 형식 확인(jpeg·png·webp)
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) return fail(415, "JPG, PNG, WEBP 사진만 올릴 수 있어요");
    // rotate(): EXIF 방향을 반영한 뒤 메타데이터(촬영 위치 등)를 모두 버리고 다시 만든다
    const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
    const out = await base.clone().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    big = out.data;
    width = out.info.width;
    height = out.info.height;
    thumb = await base.clone().resize(320, 320, { fit: "cover" }).webp({ quality: 70 }).toBuffer();
  } catch {
    return fail(400, "이미지를 읽을 수 없어요. 다른 사진으로 시도해 주세요");
  }

  // 파일 이름은 추측할 수 없는 임의 값(회원 id 를 경로에 넣지 않는다 — 익명 글의 사진 주소로 작성자를 알 수 없게)
  const key = crypto.randomUUID();
  const path = `${DIRS[kind]}/${key}.webp`;
  const thumbPath = `${DIRS[kind]}/${key}_t.webp`;
  const up1 = await admin.storage.from(BUCKET).upload(path, big, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (up1.error) return fail(500, "사진을 저장하지 못했어요");
  const up2 = await admin.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (up2.error) {
    await admin.storage.from(BUCKET).remove([path]);
    return fail(500, "사진을 저장하지 못했어요");
  }
  const { data: row, error } = await admin.from("community_uploads")
    .insert({ user_id: uid, kind, path, thumb: thumbPath, width, height }).select("id").single();
  if (error || !row) {
    await admin.storage.from(BUCKET).remove([path, thumbPath]);
    return fail(500, "사진을 저장하지 못했어요");
  }

  await cleanupOrphans(admin).catch(() => {}); // 정리 실패는 올리기 결과에 영향 없음
  return Response.json({ ok: true, id: row.id, path, thumb: thumbPath, w: width, h: height });
}
