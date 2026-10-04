"use client";
// 관리자: 회원 관리 — 검색(닉네임·이메일), 가입일·마지막 접속·연결 선수 수, 이용 정지/해제, 프로필 사진 변경 제한.
// - 이용 정지는 서버 API(/api/admin/users)가 Supabase Auth 의 ban 으로 처리한다(로그인·토큰 갱신 차단). 생년월일 등 민감 정보는 관리자에게도 보여주지 않는다.
// - 관리자 권한의 부여·해제는 웹에서 하지 않고 Supabase 대시보드 SQL 로만 한다(아래 안내 문구 참고).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fmtDateTime, postJson, rpcOk } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select } from "@/components/ui/input";

interface Member {
  id: string; nickname: string | null; email: string | null; role: string | null; weapon: string | null; region: string | null; affiliation: string | null;
  avatar_locked: boolean; is_admin: boolean; consent_version: string | null; onboarded: boolean; created_at: string; last_sign_in_at: string | null;
  banned_until: string | null; linked: number; tickets: number;
}
const isBanned = (m: Member) => !!m.banned_until && new Date(m.banned_until).getTime() > Date.now();

export function MembersAdmin() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Member[] | null>(null);
  const [days, setDays] = useState("7");
  const [ban, setBan] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_members", { p_q: q, p_limit: 40 });
    setList((data ?? []) as Member[]);
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const suspend = async () => {
    if (!ban) return;
    const res = await postJson("/api/admin/users", { target: ban.id, action: "suspend", days: days === "perm" ? null : Number(days) });
    setBan(null);
    if (!res.ok) return toast.error(res.message ?? "처리하지 못했어요");
    toast.success("이용을 정지했어요");
    load();
  };
  const unsuspend = async (m: Member) => {
    const res = await postJson("/api/admin/users", { target: m.id, action: "unsuspend" });
    if (!res.ok) return toast.error(res.message ?? "처리하지 못했어요");
    toast.success("정지를 풀었어요");
    load();
  };
  const lock = async (m: Member) => {
    const err = await rpcOk("admin_set_avatar_lock", { p_target: m.id, p_lock: !m.avatar_locked });
    if (err) return toast.error(err);
    toast.success(m.avatar_locked ? "사진 변경 제한을 풀었어요" : "사진 변경을 제한했어요");
    load();
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-bold">회원 관리</h2>
        <Input className="h-8 w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임 또는 이메일 검색" />
      </div>
      <p className="text-xs text-muted">검색하지 않으면 최근 가입한 회원 40명이 보여요. 관리자 권한은 이 화면이 아니라 Supabase 대시보드에서만 줄 수 있어요.</p>
      {list === null ? <p className="py-3 text-center text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="py-3 text-center text-sm text-muted">검색 결과가 없습니다</p> : (
        <ul className="space-y-1.5">
          {list.map((m) => (
            <li key={m.id} className="space-y-1 rounded-md bg-panel2 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <b>{m.nickname ?? "(닉네임 없음)"}</b>
                {m.is_admin && <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[11px] text-brand">관리자</span>}
                {isBanned(m) && <span className="rounded bg-loss/20 px-1.5 py-0.5 text-[11px] text-loss">정지 ~{fmtDateTime(m.banned_until)}</span>}
                {m.avatar_locked && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-muted">사진 제한</span>}
                {!m.onboarded && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-muted">가입 미완료</span>}
                <span className="select-all text-xs text-muted">{m.email}</span>
              </div>
              <div className="text-xs text-muted">
                {[m.role, m.weapon, m.region, m.affiliation].filter(Boolean).join(" · ")} · 가입 {fmtDateTime(m.created_at)} · 마지막 접속 {fmtDateTime(m.last_sign_in_at)} · 연결 선수 {m.linked}명 · 문의 {m.tickets}건 · 약관 {m.consent_version ?? "미동의"}
              </div>
              {!m.is_admin && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {isBanned(m) ? <Button size="sm" variant="outline" onClick={() => unsuspend(m)}>정지 해제</Button> : <Button size="sm" variant="danger" onClick={() => setBan(m)}>이용 정지</Button>}
                  <Button size="sm" variant="outline" onClick={() => lock(m)}>{m.avatar_locked ? "사진 제한 풀기" : "사진 변경 제한"}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!ban} onClose={() => setBan(null)} title="이용 정지">
        <div className="space-y-3">
          <p className="text-sm">{ban?.nickname ?? "이 회원"} 님의 이용을 정지할까요? 정지 중에는 로그인할 수 없어요.</p>
          <div>
            <Label>정지 기간</Label>
            <Select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="1">1일</option><option value="7">7일</option><option value="30">30일</option><option value="perm">영구</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBan(null)}>취소</Button>
            <Button variant="danger" onClick={suspend}>정지</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
