// 관리자: 회원 이용 정지 / 해제 (Supabase Auth 의 ban 기능 사용 → 로그인과 토큰 갱신이 막힌다. 이미 발급된 접속 토큰은 최대 1시간까지 남을 수 있음).
//  POST {target, action: "suspend", days?: number}  days 를 생략하면 영구 정지
//  POST {target, action: "unsuspend"}
// 보호: 관리자만 호출 가능, 자기 자신과 다른 관리자는 정지할 수 없다. 모든 처리는 관리 기록(admin_audit)에 남는다.
import { audit, authed, fail } from "@/lib/serverAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof Response) return a;
  if (!a.isAdmin) return fail(403, "관리자만 사용할 수 있습니다");
  const body = await req.json().catch(() => ({}));
  const target = String(body.target ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(target)) return fail(400, "잘못된 요청입니다");
  if (target === a.uid) return fail(400, "자기 자신은 정지할 수 없어요");
  const { data: t } = await a.admin.from("profiles").select("is_admin,nickname").eq("id", target).maybeSingle();
  if (!t) return fail(404, "회원을 찾을 수 없어요");

  if (body.action === "suspend") {
    if (t.is_admin) return fail(400, "관리자는 정지할 수 없어요. 먼저 관리자 권한을 해제해 주세요");
    const days = body.days == null ? null : Number(body.days);
    if (days != null && (!Number.isInteger(days) || days < 1 || days > 3650)) return fail(400, "정지 기간이 올바르지 않아요");
    const { error } = await a.admin.auth.admin.updateUserById(target, { ban_duration: days == null ? "876000h" : `${days * 24}h` });
    if (error) return fail(500, "처리하지 못했어요");
    await audit(a, "suspend", target, { days: days ?? "permanent", nickname: t.nickname });
    return Response.json({ ok: true });
  }
  if (body.action === "unsuspend") {
    const { error } = await a.admin.auth.admin.updateUserById(target, { ban_duration: "none" });
    if (error) return fail(500, "처리하지 못했어요");
    await audit(a, "unsuspend", target, { nickname: t.nickname });
    return Response.json({ ok: true });
  }
  return fail(400, "잘못된 요청입니다");
}
