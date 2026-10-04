"use client";
// 개인전 기록지 (Poole Sheet)
// - 상단: 경기 정보 입력 / 중앙: 풀 결과 매트릭스 / 하단: 순위 집계표
// - 순위는 결과를 입력할 때마다 즉시 재계산된다 (lib/pool.ts, 승률 → Ind → TS, 동률 시 공동 순위)
// - 내용은 하나의 문서(PoolDoc)로 관리한다. 기본은 혼자 편집, '공동 편집'을 누르면 링크(?share=)로 들어온 회원끼리 실시간으로 함께 편집(lib/sharedSheet.ts).
//   문서 구조: players·results 는 칸 번호를 키로 하는 객체(results["2-5"] = 2번이 5번에게 낸 점수) — 서로 다른 칸을 동시에 고쳐도 겹치지 않게.
import { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PlayerPicker, playerLabel, type PickedPlayer } from "@/components/PlayerPicker";
import { validateScore } from "@/components/NewRecordModal";
import { SheetShareBar, SheetShareButton } from "@/components/SheetShareBar";
import { Modal, Confirm } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/ui/dot";
import { Input, Label, Select } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { calcPool, type PoolPlayer, type PoolResults } from "@/lib/pool";
import { useSheetDoc, type Op } from "@/lib/sharedSheet";
import { localDay } from "@/lib/utils";

export default function PoolPage() {
  return (
    <AppShell>
      <Suspense>
        <Pool />
      </Suspense>
    </AppShell>
  );
}

const MAX = 12, MIN = 2;
const today = () => localDay(); // 기기 시간 기준 오늘 (UTC 로 자르면 오전 9시 전엔 어제가 됨)

type Info = { title: string; horn: string; strip: string; referee: string; date: string; hits: string };
interface PoolDoc {
  info: Info;
  n: number; // 참가자 칸 수
  players: Record<string, PoolPlayer>; // 칸 번호 → 참가자 (빈 칸은 키 없음)
  results: Record<string, number>; // "i-j" → i번이 j번과 싸워 낸 점수
}
const newPool = (): PoolDoc => ({ info: { title: "", horn: "", strip: "", referee: "", date: today(), hits: "5" }, n: 6, players: {}, results: {} });

function Pool() {
  const { user } = useAuth();
  const shareId = useSearchParams().get("share");
  const sheet = useSheetDoc<PoolDoc>("pool", newPool, shareId);
  const { doc, patch } = sheet;
  const { info, n } = doc;
  const [registered, setRegistered] = useState(false);

  // 팝업 상태 (각자 화면에만 있는 상태 — 공동 편집해도 공유하지 않음)
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<PickedPlayer | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const [selA, setSelA] = useState("");
  const [selB, setSelB] = useState("");
  const [sa, setSa] = useState("");
  const [sb, setSb] = useState("");
  const [confirmShrink, setConfirmShrink] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const setInfo = (k: keyof Info, v: string) => patch([{ p: ["info", k], v }], { debounceKey: `info.${k}` });

  // 참가자 슬롯: 비어 있으면 null (지도자·관전자도 기록지를 만들 수 있도록 본인을 자동으로 넣지 않는다)
  const slots: (PoolPlayer | null)[] = useMemo(
    () => Array.from({ length: n }, (_, i) => doc.players[i] ?? null),
    [n, doc.players]
  );
  // 결과 객체 → 계산용 2차원 배열
  const results: PoolResults = useMemo(() => {
    const arr: PoolResults = Array.from({ length: n }, () => []);
    for (const [k, v] of Object.entries(doc.results)) {
      const [i, j] = k.split("-").map(Number);
      if (i < n && j < n) arr[i][j] = v;
    }
    return arr;
  }, [n, doc.results]);

  const rows = useMemo(() => calcPool(n, results), [n, results]);
  const placeOf = (i: number) => rows.find((r) => r.idx === i)!;

  // ---- 참가자 수 조절 ----
  const hasDataAt = (i: number) => !!slots[i] || Object.keys(doc.results).some((k) => k.split("-").includes(String(i)));
  const changeN = (d: 1 | -1) => {
    if (d === 1) return n < MAX ? patch([{ p: ["n"], v: n + 1 }]) : toast.error(`참가자는 최대 ${MAX}명입니다`);
    if (n <= MIN) return toast.error(`참가자는 최소 ${MIN}명입니다`);
    if (hasDataAt(n - 1)) return setConfirmShrink(true); // 경고 팝업
    shrink();
  };
  const shrink = () => {
    const keep = n - 1;
    // 마지막 참가자와 그 참가자의 경기 결과도 함께 삭제
    const ops: Op[] = [{ p: ["n"], v: keep }, { p: ["players", String(keep)], d: 1 }];
    for (const k of Object.keys(doc.results)) if (k.split("-").includes(String(keep))) ops.push({ p: ["results", k], d: 1 });
    patch(ops);
    setConfirmShrink(false);
  };

  // ---- 참가자 추가 ----
  const addPlayer = () => {
    if (!picked) return toast.error("참가자를 선택해 주세요");
    if (slots.some((s) => s && s.name === picked.name && s.userId === picked.userId))
      return toast.error("이미 추가된 참가자입니다");
    let idx = slots.findIndex((s) => !s);
    const ops: Op[] = [];
    if (idx === -1) {
      if (n >= MAX) return toast.error(`참가자는 최대 ${MAX}명입니다`);
      idx = n;
      ops.push({ p: ["n"], v: n + 1 });
    }
    ops.push({ p: ["players", String(idx)], v: { id: crypto.randomUUID(), name: picked.name, userId: picked.userId, realName: picked.realName ?? null } });
    patch(ops);
    setPicked(null);
    setAddOpen(false);
  };

  // ---- 결과 입력 ----
  const openInput = (a = "", b = "") => {
    setSelA(a); setSelB(b); setSa(""); setSb("");
    setInputOpen(true);
  };
  const tryApply = () => {
    const hits = Number(info.hits);
    const A = Number(selA), B = Number(selB);
    // 입력 검증: 선택 안 함 / 숫자가 아님 / 음수·소수 / Hits to win 초과 / 동점 → "잘못된 입력입니다"
    const bad =
      selA === "" || selB === "" || sa.trim() === "" || sb.trim() === "" ||
      !Number.isInteger(Number(sa)) || !Number.isInteger(Number(sb)) ||
      Number(sa) < 0 || Number(sb) < 0 || Number(sa) > hits || Number(sb) > hits || Number(sa) === Number(sb);
    if (bad) return toast.error("잘못된 입력입니다"); // 팝업은 그대로 열려 있어 다시 입력 가능
    if (results[A]?.[B] !== undefined) return setConfirmOverwrite(true);
    apply(A, B);
  };
  const apply = (A: number, B: number) => {
    patch([{ p: ["results", `${A}-${B}`], v: Number(sa) }, { p: ["results", `${B}-${A}`], v: Number(sb) }]);
    setRegistered(false);
    setConfirmOverwrite(false);
    setInputOpen(false);
  };

  // ---- 저장 (이미지) ----
  const save = async () => {
    if (!sheetRef.current) return;
    try {
      const url = await toPng(sheetRef.current, { backgroundColor: "#0b1520", pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${info.title || "poole-sheet"}.png`;
      a.click();
    } catch {
      toast.error("이미지 저장에 실패했습니다");
    }
  };

  const reset = () => {
    patch([{ p: [], v: newPool() }]); // 공동 편집 중이면 모두의 기록지가 초기화된다
    setRegistered(false);
    setConfirmReset(false);
  };

  // ---- 오픈 기록 등록: 내가 참가한 경기를 오픈 기록으로 서버에 등록 (공동 편집 중에도 각자 자기 경기만) ----
  const register = async () => {
    if (!user) return toast.error("오픈 기록 등록은 로그인 후 이용할 수 있습니다");
    const me = slots.findIndex((s) => s?.userId === user.id);
    if (me === -1) return toast.error("내가 참가자에 포함되어 있어야 등록할 수 있습니다");
    const hits = Number(info.hits);
    const inserts: Record<string, unknown>[] = [];
    let skipped = 0;
    for (let j = 0; j < n; j++) {
      const opp = slots[j];
      const a = results[me]?.[j], b = results[j]?.[me];
      if (j === me || !opp || a === undefined || b === undefined) continue;
      if (validateScore(hits, a, b)) { skipped++; continue; } // 두 선수 모두 Hits to win 이상 등 잘못된 점수
      const isOpen = !!opp.userId; // 비유저 상대는 자동으로 프라이빗
      inserts.push({
        creator_id: user.id,
        kind: isOpen ? "OPEN" : "PRIVATE",
        status: isOpen ? "PENDING" : "PRIVATE",
        opponent_id: opp.userId,
        opponent_name: opp.name,
        target_score: hits,
        my_score: a,
        opp_score: b,
        played_at: info.date ? new Date(info.date).toISOString() : undefined,
      });
    }
    if (!inserts.length) return toast.error("등록할 경기가 없습니다 (내가 참가한 유효한 경기 결과가 없습니다)");
    const { error } = await supabase.from("game_records").insert(inserts);
    if (error) return toast.error(error.message);
    setRegistered(true);
    toast.success(`${inserts.length}경기를 등록했습니다. 유펜 유저 상대에게 수락 요청이 발송됩니다${skipped ? ` (${skipped}경기 제외)` : ""}`);
  };

  const names = slots.map((s, i) => (s ? playerLabel(s) : `참가자 ${i + 1}`));
  const available = (except: string) => slots.map((s, i) => ({ s, i })).filter(({ s, i }) => s && String(i) !== except);

  const editable = sheet.mode === "local" || sheet.mode === "live";
  return (
    <div className="space-y-3">
      <SheetShareBar sheet={sheet} kind="pool" />
      {editable && <>
      {/* 컨트롤 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => changeN(-1)} aria-label="참가자 감소"><Minus size={14} /></Button>
        <span className="text-sm">참가자 {n}명</span>
        <Button variant="outline" size="sm" onClick={() => changeN(1)} aria-label="참가자 증가"><Plus size={14} /></Button>
        <Button size="sm" onClick={() => setAddOpen(true)}>참가자 추가</Button>
        <Button size="sm" onClick={() => openInput()}>결과 입력</Button>
        <span className="ml-auto flex gap-2">
          {sheet.mode === "local" && <SheetShareButton onShare={sheet.startShare} />}
          <Button size="sm" variant="outline" onClick={save}>저장</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)}>초기화</Button>
          <Button size="sm" onClick={register} disabled={registered}>{registered ? "등록 완료" : "등록"}</Button>
        </span>
      </div>

      {/* ===== 캡처 영역 (저장 버튼 시 이미지로 변환) ===== */}
      <div ref={sheetRef} className="space-y-4 rounded-lg border border-line bg-background p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-3"><Label>경기 이름</Label><Input placeholder="예: 10월 1일 연습경기" value={info.title} onChange={(e) => setInfo("title", e.target.value)} /></div>
          <div><Label>뿔 넘버</Label><Input value={info.horn} onChange={(e) => setInfo("horn", e.target.value)} /></div>
          <div><Label>피스트 넘버</Label><Input value={info.strip} onChange={(e) => setInfo("strip", e.target.value)} /></div>
          <div><Label>심판</Label><Input value={info.referee} onChange={(e) => setInfo("referee", e.target.value)} /></div>
          <div><Label>날짜</Label><Input type="date" value={info.date} onChange={(e) => setInfo("date", e.target.value)} /></div>
          <div><Label>Hits to win</Label><Input type="number" min={1} value={info.hits} onChange={(e) => setInfo("hits", e.target.value)} /></div>
        </div>

        {/* 풀 매트릭스 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-sm">
            <thead>
              <tr className="bg-panel">
                <th className="border border-line p-1.5">이름</th>
                <th className="border border-line p-1.5">#</th>
                {Array.from({ length: n }, (_, j) => <th key={j} className="w-10 border border-line p-1.5">{j + 1}</th>)}
                {["승패", "득점", "실점", "지수", "순위"].map((h) => <th key={h} className="border border-line p-1.5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: n }, (_, i) => {
                const r = placeOf(i);
                return (
                  <tr key={i}>
                    <td className="min-w-24 border border-line p-1.5 text-left"><span className="flex items-center gap-1.5">{slots[i] && <Dot member={!!slots[i]!.userId} />}{names[i]}</span></td>
                    <td className="border border-line bg-panel p-1.5 font-bold">{i + 1}</td>
                    {Array.from({ length: n }, (_, j) =>
                      i === j ? (
                        // 자기 자신과의 대결 칸은 입력 불가 (검은색 처리)
                        <td key={j} className="border border-line bg-[#060c13]" />
                      ) : (
                        <td
                          key={j}
                          className="cursor-pointer border border-line p-1.5 hover:bg-white/10"
                          onClick={() => slots[i] && slots[j] ? openInput(String(i), String(j)) : toast.error("먼저 두 참가자를 추가해 주세요")}
                        >
                          {results[i]?.[j] !== undefined && (
                            // 승자: 목표 점수로 끝났으면 "V", 그보다 낮은 점수로 끝났으면 "V4" 처럼 점수를 붙여 표시
                            <span className={results[i][j]! > (results[j]?.[i] ?? 0) ? "font-bold text-win" : "text-muted"}>
                              {results[i][j]! > (results[j]?.[i] ?? 0)
                                ? results[i][j] === Number(info.hits) ? "V" : `V${results[i][j]}`
                                : results[i][j]}
                            </span>
                          )}
                        </td>
                      )
                    )}
                    <td className="border border-line p-1.5">{r.games ? `${r.v}승 ${r.games - r.v}패` : "-"}</td>
                    <td className="border border-line p-1.5">{r.ts}</td>
                    <td className="border border-line p-1.5">{r.tr}</td>
                    <td className="border border-line p-1.5">{r.ind > 0 ? `+${r.ind}` : r.ind}</td>
                    <td className="border border-line p-1.5 font-bold">{r.games ? r.place : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 결과 집계표 (순위순) */}
        <table className="w-full border-collapse text-center text-sm">
          <thead>
            <tr className="bg-panel">
              {["순위", "이름", "승", "승률", "득점", "실점", "지수"].map((h) => <th key={h} className="border border-line p-1.5">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.idx}>
                <td className="border border-line p-1.5 font-bold">{r.games ? r.place : "-"}</td>
                <td className="border border-line p-1.5"><span className="flex items-center justify-center gap-1.5">{slots[r.idx] && <Dot member={!!slots[r.idx]!.userId} />}{names[r.idx]}</span></td>
                <td className="border border-line p-1.5">{r.v}</td>
                <td className="border border-line p-1.5">{r.games ? `${Math.round(r.rate * 100)}%` : "-"}</td>
                <td className="border border-line p-1.5">{r.ts}</td>
                <td className="border border-line p-1.5">{r.tr}</td>
                <td className="border border-line p-1.5">{r.ind > 0 ? `+${r.ind}` : r.ind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}

      {/* 참가자 추가 팝업 */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="참가자명 입력">
        <div className="space-y-3">
          <PlayerPicker allowSelf value={picked} onChange={setPicked} placeholder="유펜 유저 검색 또는 이름 입력" />
          <p className="text-xs text-muted">녹색 점은 유펜 회원, 회색 점은 비회원입니다. 회원이 아니면 이름을 입력해 회색 점 항목을 선택하세요.</p>
          <Button className="w-full" onClick={addPlayer}>추가</Button>
        </div>
      </Modal>

      {/* 결과 입력 팝업: [A 드롭박스] [점수] : [점수] [B 드롭박스] */}
      <Modal open={inputOpen} onClose={() => setInputOpen(false)} title="경기 결과 입력" wide>
        <div className="flex items-center gap-2">
          <Select value={selA} onChange={(e) => setSelA(e.target.value)}>
            <option value="">선수 A</option>
            {/* 중복 선택 방지: B에서 고른 사람은 A 목록에서 제외 */}
            {available(selB).map(({ s, i }) => <option key={i} value={i}>{i + 1}. {playerLabel(s!)}</option>)}
          </Select>
          <Input className="w-16 text-center" value={sa} onChange={(e) => setSa(e.target.value)} />
          <span>:</span>
          <Input className="w-16 text-center" value={sb} onChange={(e) => setSb(e.target.value)} />
          <Select value={selB} onChange={(e) => setSelB(e.target.value)}>
            <option value="">선수 B</option>
            {available(selA).map(({ s, i }) => <option key={i} value={i}>{i + 1}. {playerLabel(s!)}</option>)}
          </Select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setInputOpen(false)}>취소</Button>
          <Button onClick={tryApply}>확인</Button>
        </div>
      </Modal>

      <Confirm open={confirmShrink} message="참가자를 줄이면 해당 참가자의 경기 결과가 삭제됩니다. 계속하시겠습니까?" onOk={shrink} onCancel={() => setConfirmShrink(false)} />
      <Confirm open={confirmOverwrite} message="경기 결과를 덮어쓰시겠습니까?" onOk={() => apply(Number(selA), Number(selB))} onCancel={() => setConfirmOverwrite(false)} />
      <Confirm open={confirmReset} message={sheet.mode === "live" ? "함께 편집 중인 모든 사람의 기록지가 초기화돼요. 초기화할까요?" : "입력한 모든 정보를 초기화할까요?"} onOk={reset} onCancel={() => setConfirmReset(false)} okText="초기화" />
    </div>
  );
}
