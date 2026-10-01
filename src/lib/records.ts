// 게임 기록 조회/가공 헬퍼
import { supabase } from "./supabase";
import type { GameRecord } from "./types";

/** 기록은 '등록자 기준'으로 저장됨 → 보는 사람 기준(내 점수/상대)으로 뒤집은 뷰 타입 */
export interface RecordView {
  rec: GameRecord;
  mine: number;
  theirs: number;
  oppName: string;
  oppId: string | null;
  win: boolean;
  isCreator: boolean;
}

export const SELECT_RECORDS = "*, creator:profiles!game_records_creator_id_fkey(id,nickname)";

export function toView(rec: GameRecord, myId: string): RecordView {
  const isCreator = rec.creator_id === myId;
  const mine = isCreator ? rec.my_score : rec.opp_score;
  const theirs = isCreator ? rec.opp_score : rec.my_score;
  return {
    rec,
    isCreator,
    mine,
    theirs,
    oppName: isCreator ? rec.opponent_name : rec.creator?.nickname ?? "알 수 없음",
    oppId: isCreator ? rec.opponent_id : rec.creator_id,
    win: mine > theirs,
  };
}

/**
 * 특정 유저(userId)의 기록 조회. 가시성은 DB의 RLS가 결정한다.
 * - 본인: 프라이빗/대기 포함 (RLS가 본인 것만 허용)
 * - 타인: 확정(ACCEPTED)된 오픈/대회 기록만
 * 수락 대기(PENDING)는 전적/티어에 반영하지 않으므로 기본적으로 제외한다.
 */
export async function fetchUserRecords(userId: string, includePending = false): Promise<RecordView[]> {
  const { data, error } = await supabase
    .from("game_records")
    .select(SELECT_RECORDS)
    .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
    .order("played_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as GameRecord[])
    .filter((r) => includePending || r.status !== "PENDING")
    // 내가 '상대방'인 기록은 확정된 것만 (프라이빗은 원래 RLS로 안 보이지만 이중 방어)
    .filter((r) => r.creator_id === userId || r.status === "ACCEPTED")
    .map((r) => toView(r, userId));
}

export function winRate(views: RecordView[]) {
  if (!views.length) return 0;
  return Math.round((views.filter((v) => v.win).length / views.length) * 100);
}

/** 상대별 승률 (최소 2경기 이상) → 가장 높은/낮은 3명 */
export function opponentStats(views: RecordView[]) {
  const m = new Map<string, { name: string; w: number; n: number }>();
  for (const v of views) {
    // 비유저는 id가 없으므로 이름 텍스트로만 묶는다 (개인 내 집계에 한함)
    const key = v.oppId ?? `t:${v.oppName}`;
    const s = m.get(key) ?? { name: v.oppName, w: 0, n: 0 };
    s.n++;
    if (v.win) s.w++;
    m.set(key, s);
  }
  const arr = [...m.values()].filter((s) => s.n >= 2).map((s) => ({ ...s, rate: Math.round((s.w / s.n) * 100) }));
  return {
    best: [...arr].sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, 3),
    worst: [...arr].sort((a, b) => a.rate - b.rate || b.n - a.n).slice(0, 3),
  };
}
