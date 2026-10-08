"use client";
// 우측 메뉴바 '+' 버튼으로 여는 게임 기록 생성 팝업.
// 프라이빗 / 오픈 선택 → 상대 선택 → 경기 날짜 → 목표 점수 → 점수 → (피드백 노트) → 완료
// 경기 날짜: 기본은 오늘이고, 오늘이면 저장한 시각(DB 기본값 now())으로 기록한다. 지난 날짜를 고르면 그날 정오로 저장(화면에는 날짜만 보임).
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Input, Label, Textarea } from "./ui/input";
import { PlayerPicker, type PickedPlayer } from "./PlayerPicker";
import { NOTE_MAX, cn, localDay } from "@/lib/utils";

/** 점수 검증 (모든 기록 입력에서 공통 사용). 오류 메시지 또는 null */
export function validateScore(target: number, a: number, b: number): string | null {
  if (!Number.isInteger(target) || target < 1) return "목표 점수를 올바르게 입력하세요";
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return "점수를 올바르게 입력하세요";
  if (a === b) return "무승부는 저장할 수 없습니다";
  const min = Math.min(a, b); // 승자가 목표 점수에 못 미쳐도(시간 종료 등) 저장 가능
  if (min >= target) return "두 선수 모두 목표 점수를 넘을 수 없습니다";
  return null;
}

export function NewRecordModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const { user, profile } = useAuth();
  const [kind, setKind] = useState<"PRIVATE" | "OPEN">("PRIVATE");
  const [opp, setOpp] = useState<PickedPlayer | null>(null);
  const [target, setTarget] = useState("15");
  const [mine, setMine] = useState("");
  const [theirs, setTheirs] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(localDay()); // 경기 날짜 (YYYY-MM-DD)
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setOpp(null); setMine(""); setTheirs(""); setNote(""); setKind("PRIVATE"); setTarget("15"); setDay(localDay());
  };

  const submit = async () => {
    if (!user) return;
    if (!opp) return toast.error("상대를 선택해 주세요");
    const err = validateScore(Number(target), Number(mine), Number(theirs));
    if (err) return toast.error(err);
    const today = localDay();
    if (!day || day > today || day < "1990-01-01") return toast.error("경기 날짜를 확인해 주세요 (오늘 이전 날짜만 고를 수 있어요)");

    // 상대가 비유저이면 수락받을 대상이 없으므로 자동으로 프라이빗 기록으로 저장
    const finalKind = kind === "OPEN" && !opp.userId ? "PRIVATE" : kind;
    if (kind === "OPEN" && !opp.userId) toast.info("상대가 유저가 아니어서 프라이빗 기록으로 저장됩니다");

    setBusy(true);
    const { data, error } = await supabase
      .from("game_records")
      .insert({
        creator_id: user.id,
        kind: finalKind,
        status: finalKind === "OPEN" ? "PENDING" : "PRIVATE", // 오픈은 상대 수락 전까지 '수락 대기'
        opponent_id: opp.userId,
        opponent_name: opp.name,
        target_score: Number(target),
        my_score: Number(mine),
        opp_score: Number(theirs),
        // 오늘이면 보내지 않아 저장 시각(now())이 되고, 지난 날짜면 그날 정오(기기 시간)로 저장
        ...(day !== today && { played_at: new Date(`${day}T12:00:00`).toISOString() }),
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      return toast.error(error?.message ?? "저장에 실패했습니다");
    }
    // 피드백 노트가 있으면 함께 저장 (본인만 열람 가능)
    if (note.trim()) {
      const { error: noteErr } = await supabase.from("feedback_notes").insert({ user_id: user.id, game_id: data.id, content: note.trim() });
      if (noteErr) toast.error(`기록은 저장했지만 노트는 저장하지 못했어요: ${noteErr.message}`); // 예: 하루 노트 50개 초과
    }
    setBusy(false);
    toast.success(finalKind === "OPEN" ? "오픈 기록 등록! 상대방의 수락을 기다립니다" : "기록이 저장되었습니다");
    reset();
    onSaved?.();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="게임 기록 추가">
      {/* 1. 기록 종류 */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["PRIVATE", "OPEN"] as const).map((k) => (
          <button aria-pressed={kind === k}
            key={k}
            onClick={() => setKind(k)}
            className={cn("rounded-md border px-3 py-2 text-sm", kind === k ? "border-brand bg-brand/20" : "border-line")}
          >
            {k === "PRIVATE" ? "프라이빗 (나만 보기)" : "오픈 (상대 수락 후 공개)"}
          </button>
        ))}
      </div>
      {/* 2. 플레이어 */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div>
          <Label>나</Label>
          <div className="flex h-10 items-center rounded-md border border-line bg-panel2 px-3 text-sm">{profile?.nickname}</div>
        </div>
        <div>
          <Label>상대</Label>
          <PlayerPicker value={opp} onChange={setOpp} />
        </div>
      </div>
      {/* 3. 경기 날짜 (기본 오늘 = 저장한 시각) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Label className="mb-0">경기 날짜</Label>
        <Input className="w-40" type="date" value={day} min="1990-01-01" max={localDay()} onChange={(e) => setDay(e.target.value)} />
        {day === localDay() && <span className="text-xs text-muted">오늘 · 저장한 시각으로 기록돼요</span>}
      </div>
      {/* 4. 목표 점수 */}
      <div className="mb-3 flex items-center gap-2">
        <Label className="mb-0">목표 점수</Label>
        <Input className="w-20" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />
        <span className="text-sm text-muted">점 내기</span>
      </div>
      {/* 5. 점수 */}
      <div className="mb-4 flex items-center justify-center gap-3">
        <span className="w-20 truncate text-right text-sm">{profile?.nickname}</span>
        <Input className="w-24 text-center text-lg font-bold" type="number" min={0} value={mine} onChange={(e) => setMine(e.target.value)} />
        <span>:</span>
        <Input className="w-24 text-center text-lg font-bold" type="number" min={0} value={theirs} onChange={(e) => setTheirs(e.target.value)} />
        <span className="w-20 truncate text-sm">{opp?.name ?? "상대"}</span>
      </div>
      <div className="mb-4">
        <Label>피드백 노트 (선택, 나만 볼 수 있어요, {note.length}/{NOTE_MAX}자)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 식스 빠라드 후 반격이 늦었다" maxLength={NOTE_MAX} />
      </div>
      <Button className="w-full" onClick={submit} disabled={busy}>
        완료
      </Button>
    </Modal>
  );
}
