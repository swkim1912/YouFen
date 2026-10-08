"use client";
// 선수 연결 모달: ① 이름으로 선수 검색(소속·성별·등록연도로 확인) → ② 등록 연도 + 체육인번호 입력 → 서버(link_athlete RPC)가 검증.
// 체육인번호(스포츠지원포털 발급)는 협회 선수번호와 다른 번호이며, DB 의 private 에만 저장되고 화면에는 다시 나오지 않는다.
// 이미 다른 계정에 연결된 선수면 막고, '본인이 맞다면 문의' 로 문의(athlete_claim_requests)를 남기게 한다.
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { publicData } from "@/lib/fencing";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Input, Label, Select, Textarea } from "./ui/input";

const LIMIT = 30; // 한 번에 보여줄 후보 수(DB 함수 최대값). 같은 이름 선수는 현재 최대 19명이라 이름을 끝까지 입력하면 모두 나온다

interface Cand {
  id: number;
  name: string;
  gender: string | null;
  reg_years: number[];
  is_linked: boolean;
  club: { name: string } | null;
}

const PORTAL = "https://g1.sports.or.kr/index.do";

export function LinkAthleteModal({ open, onClose, onLinked }: { open: boolean; onClose: () => void; onLinked: () => void }) {
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Cand[]>([]);
  const [sel, setSel] = useState<Cand | null>(null);
  const [year, setYear] = useState("");
  const [no, setNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [claimMsg, setClaimMsg] = useState("");

  // 이름 검색 (협회 등록 이력이 있는 선수만, 연결 가능한 선수를 위로)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setCands([]);
    const t = setTimeout(async () => {
      // 선수 연결용 검색(p_link): 협회 등록 이력 있는 선수만. 순서 = 이름이 정확히 같은 선수 → 입력으로 시작하는 이름 → 포함, 그 안에서 연결 안 된 선수 먼저 (DB 함수 data_search_athletes)
      setCands(await publicData<Cand[]>("data_search_athletes", { p_q: term, p_limit: LIMIT, p_link: true }, []));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const reset = () => { setQ(""); setCands([]); setSel(null); setYear(""); setNo(""); setErr(null); setClaimMsg(""); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!sel) return;
    if (!year) return toast.error("등록 연도를 선택해 주세요");
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("link_athlete", { p_athlete_id: sel.id, p_reg_year: Number(year), p_sports_no: no });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data as { ok: boolean; code: string; message: string };
    if (!r.ok) return setErr({ code: r.code, message: r.message });
    toast.success(r.message);
    reset();
    onLinked();
  };

  const sendClaim = async () => {
    if (!sel) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("athlete_claim_requests").insert({ profile_id: u.user.id, athlete_id: sel.id, message: claimMsg.trim() });
    if (error) return toast.error(error.message.includes("check") ? "문의 내용은 5자 이상 입력해 주세요" : error.message);
    toast.success("문의를 접수했습니다. 확인 후 안내드릴게요");
    close();
  };

  return (
    <Modal open={open} onClose={close} title="선수 연결" wide>
      {!sel ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">협회에 등록된 내 이름(또는 자녀 이름)을 검색하고, 소속·등록연도를 보고 맞는 선수를 선택하세요.</p>
          <Input value={q} onChange={(e) => setQ(e.target.value)} aria-label="선수 이름 전체 (예: 홍길동)" placeholder="선수 이름 전체 (예: 홍길동)" autoFocus />
          {/* 결과가 한도만큼 차면 잘렸을 수 있으므로 이름 전체 입력을 안내 */}
          {cands.length >= LIMIT && <p className="text-xs text-pending">검색 결과가 많아 {LIMIT}명까지만 보여요. 이름을 끝까지 입력하면 같은 이름의 선수가 맨 위에 모두 나와요.</p>}
          <div className="max-h-72 space-y-1.5 overflow-auto">
            {cands.map((c) => (
              <button key={c.id} onClick={() => setSel(c)} className="flex w-full items-center gap-3 rounded-md bg-panel2 px-3 py-2 text-left text-sm hover:bg-white/5">
                <span className="font-semibold">{c.name}</span>
                <span className="text-xs text-muted">{c.gender === "남" ? "남" : c.gender === "여" ? "여" : ""}</span>
                <span className="flex-1 truncate text-xs text-muted">{c.club?.name ?? "소속 정보 없음"}</span>
                <span className="text-xs text-muted">등록 {c.reg_years.join("·")}</span>
                {c.is_linked && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-muted">연결됨</span>}
              </button>
            ))}
            {q.trim().length >= 2 && cands.length === 0 && <p className="py-4 text-center text-sm text-muted">협회 등록 이력이 있는 선수를 찾지 못했습니다</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md bg-panel2 px-3 py-2 text-sm">
            <span><b>{sel.name}</b> <span className="text-muted">· {sel.club?.name ?? "소속 정보 없음"}</span></span>
            <button className="text-xs text-brand hover:underline" onClick={() => { setSel(null); setErr(null); }}>다시 선택</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>등록 연도</Label>
              <Select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">선택</option>
                {[...sel.reg_years].reverse().map((y) => <option key={y} value={y}>{y}년</option>)}
              </Select>
            </div>
            <div>
              <Label>체육인번호</Label>
              <Input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="체육인번호 입력" maxLength={16} />
            </div>
          </div>
          <a href={PORTAL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
            체육인번호는 스포츠지원포털에서 확인할 수 있어요 <ExternalLink size={12} />
          </a>
          <p className="text-xs text-muted">입력한 번호는 선수 본인 확인과 동명이인 구분에만 쓰이며, 다른 사용자에게 보이지 않습니다. 한 선수는 한 계정에만 연결할 수 있고, 자녀 등 여러 선수를 연결할 수 있습니다.</p>
          {/* 실명 공개 안내: 연결하면 닉네임 ↔ 실명이 공개적으로 이어진다(학부모 신분은 합치지 않음 — lib/members.ts isMergeable) */}
          <p className="rounded-md border border-pending/40 bg-pending/[0.08] p-2.5 text-xs text-foreground">
            <b className="text-pending">공개 안내</b> 연결하면 이 선수 페이지(실명)에 내 <b>닉네임·프로필 사진·공개 전적</b>이 함께 표시되고, 닉네임으로 검색해도 이 선수 페이지가 나와요. 즉 <b>닉네임과 실명이 연결되어 공개</b>됩니다. (신분이 학부모면 합쳐 보이지 않아요.) 원하지 않으면 언제든 연결을 해제할 수 있어요.
          </p>

          {err && (
            <div className="rounded-md border border-loss/50 bg-loss/10 p-3 text-sm">
              <p className="text-loss">{err.message}</p>
              {err.code === "taken" && (
                <div className="mt-2 space-y-2">
                  <Label>본인이 맞다면 문의 내용을 남겨주세요</Label>
                  <Textarea value={claimMsg} onChange={(e) => setClaimMsg(e.target.value)} maxLength={1000} placeholder="예: 제가 본인입니다. 예전 계정을 더 이상 쓸 수 없어요." />
                  <Button size="sm" variant="outline" onClick={sendClaim}>문의 보내기</Button>
                </div>
              )}
            </div>
          )}
          <Button className="w-full" disabled={busy || !year || !no} onClick={submit}>연결하기</Button>
        </div>
      )}
    </Modal>
  );
}
