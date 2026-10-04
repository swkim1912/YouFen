"use client";
// 게임 상세 팝업: 점수/상대 정보 + 피드백 노트 작성 + (프라이빗) 수정·삭제 / (수락 대기) 요청 취소
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Modal, Confirm } from "./ui/modal";
import { Button } from "./ui/button";
import { Input, Label, Textarea } from "./ui/input";
import { Dot } from "./ui/dot";
import { validateScore } from "./NewRecordModal";
import type { RecordView } from "@/lib/records";
import { NOTE_MAX, fmtDate } from "@/lib/utils";

const KIND_LABEL = { PRIVATE: "프라이빗", OPEN: "오픈", TOURNAMENT: "대회" } as const;

export function GameDetailModal({
  view,
  onClose,
  onChanged,
}: {
  view: RecordView | null;
  onClose: () => void;
  onChanged: () => void; // 수정/삭제/취소 후 목록 새로고침
}) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const rec = view?.rec;
  // 이 경기에 대한 내 피드백 노트 불러오기 (RLS 덕분에 내 것만 조회됨)
  useEffect(() => {
    if (!rec || !user) return;
    setEditing(false);
    setNote("");
    setNoteId(null);
    supabase
      .from("feedback_notes")
      .select("id,content")
      .eq("game_id", rec.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setNote(data.content);
          setNoteId(data.id);
        }
      });
  }, [rec, user]);

  if (!view || !rec || !user) return null;
  const canEdit = rec.status === "PRIVATE" && view.isCreator; // 확정된 오픈 기록은 수정/삭제 불가

  const saveNote = async () => {
    if (!note.trim()) return toast.error("노트 내용을 입력해 주세요");
    const q = noteId
      ? supabase.from("feedback_notes").update({ content: note.trim() }).eq("id", noteId)
      : supabase.from("feedback_notes").insert({ user_id: user.id, game_id: rec.id, content: note.trim() });
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success("피드백 노트를 저장했습니다");
    onChanged();
  };

  const saveEdit = async () => {
    const err = validateScore(Number(target), Number(a), Number(b));
    if (err) return toast.error(err);
    const { error } = await supabase
      .from("game_records")
      .update({ target_score: Number(target), my_score: Number(a), opp_score: Number(b) })
      .eq("id", rec.id);
    if (error) return toast.error(error.message);
    toast.success("수정했습니다");
    onChanged();
    onClose();
  };

  const del = async () => {
    const { error } = await supabase.from("game_records").delete().eq("id", rec.id);
    if (error) return toast.error(error.message);
    toast.success("삭제했습니다");
    setConfirmDel(false);
    onChanged();
    onClose();
  };

  // 수락 대기 중인 요청을 등록자가 취소 → 프라이빗 기록으로 전환
  const cancelPending = async () => {
    const { error } = await supabase.rpc("cancel_pending_record", { rid: rec.id });
    if (error) return toast.error(error.message);
    toast.success("요청을 취소했습니다 (프라이빗 기록으로 전환)");
    onChanged();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="게임 상세">
      <div className="mb-3 text-center">
        <div className="text-xs text-muted">
          {KIND_LABEL[rec.kind]} · {fmtDate(rec.played_at)} · {rec.target_score}점 내기
          {rec.tournament_name && ` · ${rec.tournament_name} ${rec.round_label ?? ""}`}
        </div>
        <div className={`my-2 text-3xl font-extrabold ${view.win ? "text-win" : "text-loss"}`}>
          {view.mine} : {view.theirs}
        </div>
        <div className="flex items-center justify-center gap-1.5 text-sm">vs <Dot member={!!view.oppId} />{view.oppName} · {view.win ? "승" : "패"}</div>
        {rec.status === "PENDING" && <div className="mt-1 text-xs text-pending">수락 대기 중 (전적 미반영)</div>}
      </div>

      {rec.status === "PENDING" && view.isCreator && (
        <Button variant="outline" className="mb-3 w-full" onClick={cancelPending}>요청 취소</Button>
      )}

      {canEdit && !editing && (
        <div className="mb-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setTarget(String(rec.target_score)); setA(String(rec.my_score)); setB(String(rec.opp_score)); setEditing(true); }}>수정</Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>삭제</Button>
        </div>
      )}
      {editing && (
        <div className="mb-3 flex items-end gap-2">
          <div><Label>목표</Label><Input className="w-16" type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          <Input className="w-16" type="number" value={a} onChange={(e) => setA(e.target.value)} />:
          <Input className="w-16" type="number" value={b} onChange={(e) => setB(e.target.value)} />
          <Button size="sm" onClick={saveEdit}>저장</Button>
        </div>
      )}
      {rec.status === "ACCEPTED" && <p className="mb-3 text-xs text-muted">확정된 오픈/대회 기록은 수정·삭제할 수 없습니다</p>}

      <Label>내 피드백 노트 (나만 볼 수 있어요, {note.length}/{NOTE_MAX}자)</Label>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} />
      <Button className="mt-2 w-full" onClick={saveNote}>노트 저장</Button>

      <Confirm open={confirmDel} message="이 프라이빗 기록을 삭제할까요?" onOk={del} onCancel={() => setConfirmDel(false)} okText="삭제" />
    </Modal>
  );
}
