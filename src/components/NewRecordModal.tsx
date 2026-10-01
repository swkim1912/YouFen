"use client";
// 우측 메뉴바 '+' 버튼으로 여는 게임 기록 생성 팝업.
// 프라이빗 / 오픈 선택 → 상대 선택 → 목표 점수 → 점수 → (피드백 노트) → 완료
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Input, Label, Textarea } from "./ui/input";
import { PlayerPicker, type PickedPlayer } from "./PlayerPicker";
import { cn } from "@/lib/utils";

/** 점수 검증 (모든 기록 입력에서 공통 사용). 오류 메시지 또는 null */
export function validateScore(target: number, a: number, b: number): string | null {
  if (!Number.isInteger(target) || target < 1) return "목표 점수를 올바르게 입력하세요";
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return "점수를 올바르게 입력하세요";
  if (a === b) return "무승부는 저장할 수 없습니다";
  const max = Math.max(a, b), min = Math.min(a, b);
  if (min >= target) return "두 선수 모두 목표 점수를 넘을 수 없습니다";
  if (max < target) return `승자의 점수가 ${target}점에 도달하지 않았습니다 (예: ${target}:${Math.max(0, target - 3)})`;
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
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setOpp(null); setMine(""); setTheirs(""); setNote(""); setKind("PRIVATE"); setTarget("15");
  };

  const submit = async () => {
    if (!user) return;
    if (!opp) return toast.error("상대를 선택해 주세요");
    const err = validateScore(Number(target), Number(mine), Number(theirs));
    if (err) return toast.error(err);

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
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      return toast.error(error?.message ?? "저장에 실패했습니다");
    }
    // 피드백 노트가 있으면 함께 저장 (본인만 열람 가능)
    if (note.trim()) {
      await supabase.from("feedback_notes").insert({ user_id: user.id, game_id: data.id, content: note.trim() });
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
          <button
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
      {/* 3. 목표 점수 */}
      <div className="mb-3 flex items-center gap-2">
        <Label className="mb-0">목표 점수</Label>
        <Input className="w-20" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />
        <span className="text-sm text-muted">점 내기</span>
      </div>
      {/* 4. 점수 */}
      <div className="mb-4 flex items-center justify-center gap-3">
        <span className="w-24 truncate text-right text-sm">{profile?.nickname}</span>
        <Input className="w-16 text-center" type="number" min={0} value={mine} onChange={(e) => setMine(e.target.value)} />
        <span>:</span>
        <Input className="w-16 text-center" type="number" min={0} value={theirs} onChange={(e) => setTheirs(e.target.value)} />
        <span className="w-24 truncate text-sm">{opp?.name ?? "상대"}</span>
      </div>
      <div className="mb-4">
        <Label>피드백 노트 (선택, 나만 볼 수 있어요)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 식스 빠라드 후 반격이 늦었다" />
      </div>
      <Button className="w-full" onClick={submit} disabled={busy}>
        완료
      </Button>
    </Modal>
  );
}
