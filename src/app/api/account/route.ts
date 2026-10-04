// 회원 탈퇴: DELETE /api/account  body {confirm: "회원 탈퇴"}  (마이 펜싱 > 상세정보 > 회원 탈퇴 — components/AccountDelete.tsx)
// 로그인한 본인만, 확인 문구를 정확히 입력해야 처리한다. 계정 삭제는 서비스 키가 필요해 서버에서만 한다.
// 삭제되는 것(DB 의 연쇄 삭제 규칙): 프로필, 내가 등록한 경기 기록, 피드백 노트, 선수 연결, 연결 문의, 사진 신고·사진 기록, 로그인 정보.
// 남는 것: ① 다른 회원이 나를 상대로 등록한 기록 — 상대 칸은 회원 연결이 끊기고 이름은 '탈퇴 회원' 으로 바꾼다(닉네임 삭제)
//          ② 고객지원 접수 — 처리방침대로 계정과 분리되어 1년 보관 ③ 체육인번호 — 처리방침대로 선수 정보에 연결된 형태로 보관.
// 관리자 계정은 탈퇴할 수 없다(관리자가 사라지는 사고 방지 — 먼저 Supabase 대시보드에서 관리자 권한을 해제).
import { authed, fail } from "@/lib/serverAuth";
import { DELETE_CONFIRM as CONFIRM_TEXT } from "@/lib/utils";

export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  const body = await req.json().catch(() => ({}));
  if (String(body.confirm ?? "").trim() !== CONFIRM_TEXT) return fail(400, `확인 문구 '${CONFIRM_TEXT}' 를 정확히 입력해 주세요`);
  if (a.isAdmin) return fail(400, "관리자 계정은 탈퇴할 수 없어요. 먼저 관리자 권한을 해제해 주세요");

  // ① 다른 회원 기록의 상대 이름(내 닉네임)을 지운다. 회원 연결(opponent_id)은 계정 삭제 때 DB 가 비운다.
  const { error: e1 } = await a.admin.from("game_records").update({ opponent_name: "탈퇴 회원" }).eq("opponent_id", a.uid);
  if (e1) return fail(500, "탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요");

  // ② 올린 프로필 사진 파일 삭제 (버킷 avatars/<회원 id>/)
  const { data: files } = await a.admin.storage.from("avatars").list(a.uid);
  if (files?.length) await a.admin.storage.from("avatars").remove(files.map((f) => `${a.uid}/${f.name}`));

  // ③ 계정 삭제 → profiles 와 연결된 표들이 연쇄 삭제된다
  const { error } = await a.admin.auth.admin.deleteUser(a.uid);
  if (error) return fail(500, "탈퇴를 처리하지 못했어요. 잠시 후 다시 시도하거나 고객지원으로 알려 주세요");
  return Response.json({ ok: true });
}
