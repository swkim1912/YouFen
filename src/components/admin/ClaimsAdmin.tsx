"use client";
// 관리자: 선수 연결 문의 처리 + 선수 연결 상태 조회. 체육인번호는 처음 입력한 사람이 정하는 구조라, 잘못 선점된 연결은 여기서 해제한다.
// - '연결 해제'는 선수와 계정의 연결을 끊을 뿐(선수 데이터·체육인번호 기록은 그대로) 문의한 본인이 다시 연결할 수 있게 된다.
// - 해제 전에 문의 내용과 현재 연결한 회원(닉네임·연결일)을 확인하고, 필요하면 문의자에게 이메일로 본인 확인을 한다(문의자 이메일 표시).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fmtDateTime, rpcOk } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";

interface Claim {
  id: number; message: string; status: "open" | "resolved" | "rejected"; created_at: string; athlete_id: number; athlete_name: string | null;
  athlete_club: string | null; reg_years: number[] | null; requester_nickname: string | null; requester_email: string | null;
  owner_id: string | null; owner_nickname: string | null; owner_reg_year: number | null; linked_at: string | null;
}
interface AthleteHit { id: number; name: string; gender: string | null; club: string | null; reg_years: number[] | null; owner_nickname: string | null; owner_id: string | null; linked_at: string | null }
const STATUS = { open: "미처리", resolved: "처리됨", rejected: "반려" } as const;

export function ClaimsAdmin({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState("open");
  const [list, setList] = useState<Claim[] | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AthleteHit[] | null>(null);
  const [unlink, setUnlink] = useState<{ athleteId: number; name: string; owner: string | null } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_claims", { p_status: status });
    setList((data ?? []) as Claim[]);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const search = async () => {
    const { data } = await supabase.rpc("admin_athlete_search", { p_q: q });
    setHits((data ?? []) as AthleteHit[]);
  };
  const resolve = async (c: Claim, next: "resolved" | "rejected" | "open") => {
    const err = await rpcOk("admin_resolve_claim", { p_id: c.id, p_status: next });
    if (err) return toast.error(err);
    load();
    onChanged?.();
  };
  const doUnlink = async () => {
    if (!unlink) return;
    const err = await rpcOk("admin_unlink_athlete", { p_athlete_id: unlink.athleteId });
    setUnlink(null);
    if (err) return toast.error(err);
    toast.success("연결을 해제했어요");
    load();
    if (hits) search();
  };

  return (
    <section className="space-y-4 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-base font-bold">선수 연결 문의</h2>
        <Select className="h-8 w-28" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">미처리</option><option value="resolved">처리됨</option><option value="rejected">반려</option><option value="all">전체</option>
        </Select>
      </div>
      {list === null ? <p className="py-3 text-center text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="py-3 text-center text-sm text-muted">해당하는 문의가 없습니다</p> : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="space-y-1.5 rounded-md bg-panel2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-2">
                <b>{c.athlete_name ?? "(삭제된 선수)"}</b>
                <span className="text-xs text-muted">{c.athlete_club ?? "소속 없음"} · 등록 {c.reg_years?.join(", ") || "-"}</span>
                <span className="ml-auto text-[11px] text-muted">{STATUS[c.status]} · {fmtDateTime(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.message}</p>
              <p className="text-xs text-muted">문의자 <b className="text-foreground">{c.requester_nickname ?? "(탈퇴)"}</b> <span className="select-all">{c.requester_email}</span></p>
              <p className="text-xs text-muted">
                현재 연결: {c.owner_id ? <><b className="text-foreground">{c.owner_nickname}</b> ({c.owner_reg_year}년 등록 기준, {fmtDateTime(c.linked_at)})</> : "없음 — 문의자가 직접 연결할 수 있어요"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {c.owner_id && c.owner_id !== undefined && <Button size="sm" variant="danger" onClick={() => setUnlink({ athleteId: c.athlete_id, name: c.athlete_name ?? "", owner: c.owner_nickname })}>기존 연결 해제</Button>}
                {c.status === "open" ? (
                  <>
                    <Button size="sm" onClick={() => resolve(c, "resolved")}>처리 완료</Button>
                    <Button size="sm" variant="outline" onClick={() => resolve(c, "rejected")}>반려</Button>
                  </>
                ) : <Button size="sm" variant="ghost" onClick={() => resolve(c, "open")}>미처리로 되돌리기</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-line pt-3">
        <h3 className="text-sm font-bold">선수 연결 상태 조회</h3>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} aria-label="선수 이름" placeholder="선수 이름" />
          <Button variant="outline">조회</Button>
        </form>
        {hits && (hits.length === 0 ? <p className="text-sm text-muted">검색 결과가 없습니다</p> : (
          <ul className="space-y-1">
            {hits.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-md bg-panel2 px-3 py-1.5 text-sm">
                <b>{h.name}</b><span className="text-xs text-muted">{h.gender} · {h.club ?? "소속 없음"} · 등록 {h.reg_years?.join(", ") || "-"}</span>
                <span className="ml-auto text-xs">{h.owner_id ? <>연결: <b>{h.owner_nickname}</b> ({fmtDateTime(h.linked_at)})</> : <span className="text-muted">연결 없음</span>}</span>
                {h.owner_id && <Button size="sm" variant="outline" onClick={() => setUnlink({ athleteId: h.id, name: h.name, owner: h.owner_nickname })}>해제</Button>}
              </li>
            ))}
          </ul>
        ))}
      </div>
      <Confirm open={!!unlink} message={`${unlink?.name} 선수와 ${unlink?.owner ?? "회원"} 계정의 연결을 해제할까요? 선수 기록은 그대로 남고, 본인이 다시 연결할 수 있어요.`} okText="연결 해제" onOk={doUnlink} onCancel={() => setUnlink(null)} />
    </section>
  );
}
