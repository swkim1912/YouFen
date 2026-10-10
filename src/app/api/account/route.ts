// 회원 탈퇴: DELETE /api/account  body {confirm: "회원 탈퇴"}  (마이 펜싱 > 상세정보 > 회원 탈퇴 — components/AccountDelete.tsx)
// 로그인한 본인만, 확인 문구를 정확히 입력해야 처리한다. 계정 삭제는 서비스 키가 필요해 서버에서만 한다.
// 삭제되는 것(DB 의 연쇄 삭제 규칙): 프로필, 내가 등록한 경기 기록, 피드백 노트, 선수 연결, 연결 문의, 사진 신고·사진 기록, 로그인 정보,
//   커뮤니티 프로필·알림·알림 설정·차단 목록·커뮤니티 정지 기록·좋아요. (내가 한 커뮤니티 신고는 신고자만 비워진 채 남는다)
//   커뮤니티 게시글·댓글은 지우지 않고 작성자만 비워 '탈퇴 회원'으로 남긴다(다른 회원의 댓글·답글이 달려 있으므로 — 처리방침 개정 때 명시).
// 남는 것: ① 다른 회원이 나를 상대로 등록한 기록 — 상대 칸은 회원 연결이 끊기고 이름은 '탈퇴 회원' 으로 바꾼다(닉네임 삭제)
//          ② 고객지원 접수 — 처리방침대로 계정과 분리되어 1년 보관 ③ 체육인번호 — 처리방침대로 선수 정보에 연결된 형태로 보관.
// 내가 신청한 클럽 마크: 검토 중인 신청만 삭제하고, 승인되어 등록된 마크는 클럽 정보로 그대로 둔다.
// 관리자 계정은 탈퇴할 수 없다(관리자가 사라지는 사고 방지 — 먼저 Supabase 대시보드에서 관리자 권한을 해제).
// 재확인(2026-10-10): 로그인 토큰을 누가 훔쳐도 계정을 지울 수 없게 "방금(REAUTH_SECONDS 안에) 다시 로그인한" 토큰만 받는다.
//   비밀번호 회원 = 탈퇴 창에서 비밀번호를 다시 입력(봇 확인 포함)하면 화면이 새로 로그인한 뒤 이 API 를 부른다.
//   구글 회원 = 비밀번호가 없어 구글로 다시 로그인한 뒤 10분 안에 탈퇴한다. 오래된 로그인이면 403 + code 'reauth'.
import { authed, fail, secondsSinceSignIn } from "@/lib/serverAuth";
import { DELETE_CONFIRM as CONFIRM_TEXT } from "@/lib/utils";

export const runtime = "nodejs";

const REAUTH_SECONDS = 10 * 60; // '방금 로그인'으로 인정하는 시간(10분) — 화면 안내 문구(AccountDelete)와 같이 바꿀 것

export async function DELETE(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  const body = await req.json().catch(() => ({}));
  if (String(body.confirm ?? "").trim() !== CONFIRM_TEXT) return fail(400, `확인 문구 '${CONFIRM_TEXT}' 를 정확히 입력해 주세요`);
  if (a.isAdmin) return fail(400, "관리자 계정은 탈퇴할 수 없어요. 먼저 관리자 권한을 해제해 주세요");
  const age = secondsSinceSignIn(req);
  if (age === null || age > REAUTH_SECONDS) {
    return Response.json({ ok: false, code: "reauth", message: "보안을 위해 다시 로그인한 뒤 10분 안에 탈퇴할 수 있어요" }, { status: 403 });
  }

  // ① 다른 회원 기록의 상대 이름(내 닉네임)을 지운다. 회원 연결(opponent_id)은 계정 삭제 때 DB 가 비운다.
  const { error: e1 } = await a.admin.from("game_records").update({ opponent_name: "탈퇴 회원" }).eq("opponent_id", a.uid);
  if (e1) return fail(500, "탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요");

  // ② 올린 프로필 사진 파일 삭제 (버킷 avatars/<회원 id>/ 와 커뮤니티 전용 사진 avatars/community/<회원 id>/)
  for (const dir of [a.uid, `community/${a.uid}`]) {
    const { data: files } = await a.admin.storage.from("avatars").list(dir);
    const real = (files ?? []).filter((f) => f.id); // 폴더 항목 제외
    if (real.length) await a.admin.storage.from("avatars").remove(real.map((f) => `${dir}/${f.name}`));
  }

  // ③ 검토 중인 클럽 마크 신청은 파일과 함께 지운다(처리 전 개인 제출물). 승인되어 등록된 마크는 클럽 정보라 그대로 둔다.
  const { data: pendingReqs } = await a.admin.from("club_image_requests").select("id,path").eq("requested_by", a.uid).eq("status", "pending");
  if (pendingReqs?.length) {
    await a.admin.storage.from("club-images").remove(pendingReqs.map((r) => r.path));
    await a.admin.from("club_image_requests").delete().in("id", pendingReqs.map((r) => r.id));
  }

  // ④ 계정 삭제 → profiles 와 연결된 표들이 연쇄 삭제된다
  const { error } = await a.admin.auth.admin.deleteUser(a.uid);
  if (error) return fail(500, "탈퇴를 처리하지 못했어요. 잠시 후 다시 시도하거나 고객지원으로 알려 주세요");
  return Response.json({ ok: true });
}
