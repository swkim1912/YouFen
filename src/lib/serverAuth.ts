// 서버 API 공용: 서비스 키 클라이언트 + 요청자(로그인·관리자 여부) 확인. 서버 전용 — 브라우저 코드에서 import 하지 말 것.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const fail = (status: number, message: string) => Response.json({ ok: false, message }, { status });

export interface Authed { admin: SupabaseClient; uid: string; isAdmin: boolean }

export async function authed(req: Request): Promise<Authed | Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail(503, "서버 설정이 준비되지 않았습니다");
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "로그인이 필요합니다");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return fail(401, "로그인이 필요합니다");
  const { data: p } = await admin.from("profiles").select("is_admin").eq("id", data.user.id).maybeSingle();
  return { admin, uid: data.user.id, isAdmin: !!p?.is_admin };
}

/**
 * 이 요청의 로그인 토큰이 "로그인한 지 몇 초 지났는지" (탈퇴처럼 되돌릴 수 없는 작업 전에 '방금 다시 로그인했는가'를 확인할 때 쓴다).
 * - Supabase 로그인 토큰(JWT) 안의 amr 에는 로그인 방법(password·oauth 등)과 그 시각이 들어 있고, 토큰을 자동 갱신해도 이 시각은 바뀌지 않는다.
 *   → 누가 예전에 발급된 토큰을 훔쳐 써도 '최근 로그인'으로 인정되지 않는다.
 * - 토큰이 진짜인지(서명)는 authed() 의 getUser 가 이미 확인했으므로 여기서는 내용만 읽는다. **반드시 authed() 통과 뒤에 쓸 것.**
 * - 읽을 수 없으면 null(= 최근 로그인 아님으로 처리).
 */
export function secondsSinceSignIn(req: Request): number | null {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    const times = ((payload.amr ?? []) as { timestamp?: number }[]).map((a) => Number(a.timestamp)).filter(Number.isFinite);
    if (!times.length) return null;
    return Math.floor(Date.now() / 1000) - Math.max(...times);
  } catch {
    return null;
  }
}

/** 관리 기록(admin_audit)에 남긴다. 실패해도 본 작업은 막지 않는다 */
export async function audit(a: Authed, action: string, target: string, detail?: Record<string, unknown>) {
  await a.admin.from("admin_audit").insert({ admin_id: a.uid, action, target, detail: detail ?? null });
}
