"use client";
// 단체전 기록지 (Team Match Scoresheet, USFA 양식 참고)
// - 팀 A(1·2·3, 교체, 주장) / 팀 B(4·5·6, 교체, 주장) — 팀명은 직접 입력 선수 입력
// - 9개 라운드: 매 라운드 종료 시점의 누적 점수(TS)를 입력하면 라운드별 득점이 자동 계산됨
// - 단체전은 오픈 게임 등록 기능이 없음 (저장/초기화만)
import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PlayerPicker, type PickedPlayer } from "@/components/PlayerPicker";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Confirm } from "@/components/ui/modal";

export default function TeamPage() {
  return (
    <AppShell>
      <Team />
    </AppShell>
  );
}

// 표준 9라운드 경기 순서: [A팀 선수 번호(1~3), B팀 선수 번호(4~6)]
const ORDER: [number, number][] = [
  [3, 6], [1, 5], [2, 4], [1, 6], [3, 4], [2, 5], [1, 4], [2, 6], [3, 5],
];
const today = () => new Date().toISOString().slice(0, 10);

// 선수 슬롯 키: A1..A3, B4..B6 + 교체(SubA/SubB) + 주장(CaptA/CaptB)
type Slots = Record<string, PickedPlayer | null>;

/**
 * 총점 입력칸. 타이핑 중에는 검사하지 않고(예: 10을 치려고 '1'을 입력하는 순간),
 * 입력을 마치거나(포커스 이동/Enter) 다른 칸을 누르는 시점에 onCommit 으로 검사한다.
 */
function TsCell({ value, onCommit }: { value: string; onCommit: (v: string) => boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]); // 초기화 등 외부 변경 반영
  return (
    <input
      value={draft}
      inputMode="numeric"
      onChange={(e) => /^\d*$/.test(e.target.value) && setDraft(e.target.value)} // 숫자만
      onBlur={() => {
        if (draft === value) return;
        if (!onCommit(draft)) setDraft(value); // 검사 실패 → 이전 값으로 복구
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-9 w-14 bg-transparent text-center outline-none focus:bg-white/10"
    />
  );
}

function Team() {
  const [info, setInfo] = useState({ title: "", weapon: "에페", date: today() });
  const [slots, setSlots] = useState<Slots>({});
  const [teamName, setTeamName] = useState({ A: "", B: "" }); // 팀명 (비어 있으면 "팀 A"/"팀 B")
  const tn = (t: "A" | "B") => teamName[t].trim() || `팀 ${t}`;
  const [tsA, setTsA] = useState<string[]>(Array(9).fill(""));
  const [tsB, setTsB] = useState<string[]>(Array(9).fill(""));
  // 라운드별 교체: 해당 라운드에 대신 뛴 선수의 슬롯 키(예: "P2", "SubA"). null 이면 원래 배정 선수
  const [subA, setSubA] = useState<(string | null)[]>(Array(9).fill(null));
  const [subB, setSubB] = useState<(string | null)[]>(Array(9).fill(null));
  const [swapOpen, setSwapOpen] = useState<string | null>(null); // 교체 드롭다운이 열린 칸 ("A3" = A팀 3라운드)
  const [confirmReset, setConfirmReset] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const setSlot = (k: string) => (p: PickedPlayer | null) => setSlots((s) => ({ ...s, [k]: p }));
  const nameOf = (num: number, swap: string | null) =>
    (swap ? slots[swap]?.name : slots[`P${num}`]?.name) ?? (swap ? "교체" : `선수 ${num}`);

  // 교체 후보: 그 팀에 등록된 모든 선수(1~3번/4~6번, 교체, 주장) 중 원래 선수를 뺀 나머지
  const swapOptions = (team: "A" | "B", num: number) =>
    (team === "A" ? [1, 2, 3] : [4, 5, 6])
      .map((n) => `P${n}`)
      .concat([`Sub${team}`, `Capt${team}`])
      .filter((k) => k !== `P${num}` && slots[k]);

  // 총점(TS) 확정 처리: 칸 입력을 마치거나 다른 칸으로 이동할 때(TsCell 의 blur) 호출된다.
  // 이전 라운드 총점보다 작으면 에러, 이후 라운드와도 모순되면 에러. 실패 시 false 반환 → 칸이 원래 값으로 복구됨
  const changeTs = (team: "A" | "B", round: number, v: string): boolean => {
    const arr = team === "A" ? [...tsA] : [...tsB];
    if (v !== "") {
      const prev = [...arr.slice(0, round)].reverse().find((x) => x !== "");
      if (prev !== undefined && Number(v) < Number(prev)) {
        toast.error("이전 라운드 점수보다 낮을 수 없습니다");
        return false;
      }
      const nextVal = arr.slice(round + 1).find((x) => x !== "");
      if (nextVal !== undefined && Number(v) > Number(nextVal)) {
        toast.error("다음 라운드 점수보다 높을 수 없습니다");
        return false;
      }
    }
    arr[round] = v;
    (team === "A" ? setTsA : setTsB)(arr);
    return true;
  };

  // 라운드별 득점 = 이번 TS - 직전 입력된 TS (첫 라운드는 TS 그대로)
  const roundScore = (arr: string[], i: number) => {
    if (arr[i] === "") return "";
    const prev = [...arr.slice(0, i)].reverse().find((x) => x !== "");
    return Number(arr[i]) - Number(prev ?? 0);
  };

  const lastOf = (arr: string[]) => [...arr].reverse().find((x) => x !== "");
  const finalA = Number(lastOf(tsA) ?? 0), finalB = Number(lastOf(tsB) ?? 0);

  // 화살표 버튼: 교체 드롭다운 열기/닫기
  const toggleSwap = (team: "A" | "B", i: number) => {
    const key = `${team}${i}`;
    if (swapOpen === key) return setSwapOpen(null);
    setSwapOpen(key);
  };
  const chooseSwap = (team: "A" | "B", i: number, v: string) => {
    (team === "A" ? setSubA : setSubB)((arr) => arr.map((x, k) => (k === i ? v || null : x)));
    setSwapOpen(null);
  };

  const save = async () => {
    if (!sheetRef.current) return;
    try {
      const url = await toPng(sheetRef.current, { backgroundColor: "#1c1c1f", pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${info.title || "team-match-sheet"}.png`;
      a.click();
    } catch {
      toast.error("이미지 저장에 실패했습니다");
    }
  };

  const reset = () => {
    setInfo({ title: "", weapon: "에페", date: today() });
    setSlots({});
    setTeamName({ A: "", B: "" });
    setTsA(Array(9).fill(""));
    setTsB(Array(9).fill(""));
    setSubA(Array(9).fill(null));
    setSubB(Array(9).fill(null));
    setSwapOpen(null);
    setConfirmReset(false);
  };

  const picker = (k: string, ph: string) => <PlayerPicker allowSelf value={slots[k] ?? null} onChange={setSlot(k)} placeholder={ph} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={save}>저장</Button>
        <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)}>초기화</Button>
      </div>

      <div ref={sheetRef} className="space-y-4 rounded-lg border border-line bg-background p-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Label>경기 이름</Label><Input placeholder="예: 10월 1일 연습경기" value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} /></div>
          <div>
            <Label>무기</Label>
            <Select value={info.weapon} onChange={(e) => setInfo({ ...info, weapon: e.target.value })}>
              <option>플뢰레</option><option>에페</option><option>사브르</option>
            </Select>
          </div>
          <div><Label>날짜</Label><Input type="date" value={info.date} onChange={(e) => setInfo({ ...info, date: e.target.value })} /></div>
        </div>

        {/* 팀 선수 입력: 1~6번을 입력하면 아래 라운드 표의 이름에 자동 연동 */}
        <div className="grid gap-4 sm:grid-cols-2">
          {(["A", "B"] as const).map((team) => {
            const nums = team === "A" ? [1, 2, 3] : [4, 5, 6];
            return (
              <div key={team} className="space-y-1.5 rounded-md border border-line p-3">
                <Input className="font-bold" placeholder={`팀 ${team} 이름`} value={teamName[team]} onChange={(e) => setTeamName({ ...teamName, [team]: e.target.value })} />
                {nums.map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="w-5 text-sm font-bold">{n}</span>
                    <div className="flex-1">{picker(`P${n}`, `${n}번 선수`)}</div>
                  </div>
                ))}
                <div className="flex items-center gap-2"><span className="w-5 text-xs text-muted">Sub</span><div className="flex-1">{picker(`Sub${team}`, "교체 선수")}</div></div>
                <div className="flex items-center gap-2"><span className="w-5 text-xs text-muted">Capt</span><div className="flex-1">{picker(`Capt${team}`, "주장")}</div></div>
              </div>
            );
          })}
        </div>

        {/* 라운드 표 */}
        <table className="w-full border-collapse text-center text-sm">
          <thead>
            <tr className="bg-panel">
              {["득점", "선수", "총점", "라운드", "총점", "선수", "득점"].map((h, i) => <th key={i} className="border border-line p-1.5">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {ORDER.map(([a, b], i) => (
              <tr key={i}>
                <td className="border border-line p-1.5 font-bold text-win">{roundScore(tsA, i)}</td>
                <td className="border border-line p-1.5 text-left">
                  <span className="flex items-center justify-between gap-1">
                    <span>{a}. {nameOf(a, subA[i])}</span>
                    {/* 작은 화살표: 이 라운드에 뛸 선수를 등록된 팀 선수 중에서 선택 */}
                    <button onClick={() => toggleSwap("A", i)} aria-label="교체" className={subA[i] ? "text-brand" : "text-muted"}><ArrowLeftRight size={14} /></button>
                  </span>
                  {swapOpen === `A${i}` && (
                    <Select className="mt-1 h-8 text-xs" value={subA[i] ?? ""} onChange={(e) => chooseSwap("A", i, e.target.value)}>
                      <option value="">원래 선수 ({slots[`P${a}`]?.name ?? `선수 ${a}`})</option>
                      {swapOptions("A", a).map((k) => <option key={k} value={k}>{slots[k]!.name}{k.startsWith("Sub") ? " (교체)" : k.startsWith("Capt") ? " (주장)" : ""}</option>)}
                    </Select>
                  )}
                </td>
                <td className="border border-line p-0"><TsCell value={tsA[i]} onCommit={(v) => changeTs("A", i, v)} /></td>
                <td className="border border-line p-1.5 text-muted">{i + 1}</td>
                <td className="border border-line p-0"><TsCell value={tsB[i]} onCommit={(v) => changeTs("B", i, v)} /></td>
                <td className="border border-line p-1.5 text-left">
                  <span className="flex items-center justify-between gap-1">
                    <span>{b}. {nameOf(b, subB[i])}</span>
                    {/* 작은 화살표: 이 라운드에 뛸 선수를 등록된 팀 선수 중에서 선택 */}
                    <button onClick={() => toggleSwap("B", i)} aria-label="교체" className={subB[i] ? "text-brand" : "text-muted"}><ArrowLeftRight size={14} /></button>
                  </span>
                  {swapOpen === `B${i}` && (
                    <Select className="mt-1 h-8 text-xs" value={subB[i] ?? ""} onChange={(e) => chooseSwap("B", i, e.target.value)}>
                      <option value="">원래 선수 ({slots[`P${b}`]?.name ?? `선수 ${b}`})</option>
                      {swapOptions("B", b).map((k) => <option key={k} value={k}>{slots[k]!.name}{k.startsWith("Sub") ? " (교체)" : k.startsWith("Capt") ? " (주장)" : ""}</option>)}
                    </Select>
                  )}
                </td>
                <td className="border border-line p-1.5 font-bold text-loss">{roundScore(tsB, i)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="rounded-md bg-panel p-3 text-center font-bold">
          {finalA === 0 && finalB === 0
            ? "최종 결과: -"
            : `최종 ${finalA} : ${finalB} · ${finalA === finalB ? "동점" : finalA > finalB ? `${tn("A")} 승` : `${tn("B")} 승`}`}
        </div>
      </div>

      <Confirm open={confirmReset} message="입력한 모든 정보를 초기화할까요?" onOk={reset} onCancel={() => setConfirmReset(false)} okText="초기화" />
    </div>
  );
}
