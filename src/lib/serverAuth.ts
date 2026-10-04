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

/** 관리 기록(admin_audit)에 남긴다. 실패해도 본 작업은 막지 않는다 */
export async function audit(a: Authed, action: string, target: string, detail?: Record<string, unknown>) {
  await a.admin.from("admin_audit").insert({ admin_id: a.uid, action, target, detail: detail ?? null });
}
