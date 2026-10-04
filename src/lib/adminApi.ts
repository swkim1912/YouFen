// 관리자 화면 공용: 서버 API(/api/…) 호출 도우미와 날짜 표시. 브라우저 전용.
import { supabase } from "./supabase";

/** 로그인 토큰을 실어 서버 API 를 부른다. 응답은 {ok, message?} 형태 */
export async function callApi(path: string, init: RequestInit = {}): Promise<{ ok: boolean; message?: string; [k: string]: unknown }> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
  return res.json().catch(() => ({ ok: false, message: "요청에 실패했습니다" }));
}

export const postJson = (path: string, body: unknown) =>
  callApi(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

/** RPC 호출 결과({ok,message})를 한 번에 처리: 실패하면 message 를 돌려준다 */
export async function rpcOk(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.rpc(fn, args);
  const r = data as { ok?: boolean; message?: string } | null;
  if (error) return error.message;
  if (r && r.ok === false) return r.message ?? "처리하지 못했어요";
  return null;
}
