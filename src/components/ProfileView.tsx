"use client";
// OP.GG '종합' 탭 느낌의 프로필 화면. 마이페이지(isMe)와 유저 검색 결과(타인)에서 공유한다.
// 구성: 내 정보 / 티어 / 최근 추이(30게임) / 최근 전적 / 피드백 노트(본인만)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dot } from "./ui/dot";
import { GameDetailModal } from "./GameDetailModal";
import { SettingsModal } from "./SettingsModal";
import { fetchUserRecords, opponentStats, winRate, type RecordView } from "@/lib/records";
import { calcTier, type TierMode } from "@/lib/tier";
import type { FeedbackNote, Profile } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

const KIND = { PRIVATE: "프라이빗", OPEN: "오픈", TOURNAMENT: "대회" } as const;
type Filter = "ALL" | "PRIVATE" | "OPEN" | "TOURNAMENT";

export function ProfileView({ profile, isMe, readOnly = false }: { profile: Profile; isMe: boolean; readOnly?: boolean }) {
  // readOnly: 유저 검색 화면용. 본인 프로필이어도 설정/수정/노트는 마이페이지에서만 가능
  const editable = isMe && !readOnly;
  const { user } = useAuth();
  const [records, setRecords] = useState<RecordView[]>([]);
  const [notes, setNotes] = useState<(FeedbackNote & { game?: RecordView })[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<TierMode>("ALL");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [oppQ, setOppQ] = useState("");
  const [shown, setShown] = useState(10);
  const [detail, setDetail] = useState<RecordView | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 타인의 비공개 프로필이면 전적을 아예 불러오지 않는다
  const hidden = !isMe && profile.hide_records;

  const load = useCallback(async () => {
    if (hidden) return setLoading(false);
    setLoading(true);
    const recs = await fetchUserRecords(profile.id, isMe); // 본인은 수락 대기도 목록에 표시
    setRecords(recs);
    if (isMe && user) {
      const { data } = await supabase
        .from("feedback_notes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const byId = new Map(recs.map((r) => [r.rec.id, r]));
      setNotes(((data ?? []) as FeedbackNote[]).map((n) => ({ ...n, game: n.game_id ? byId.get(n.game_id) : undefined })));
    }
    setLoading(false);
  }, [profile.id, isMe, hidden, user]);

  useEffect(() => {
    load();
  }, [load]);

  // 수락 대기 건은 전적/티어/추이 계산에서 제외
  const counted = records.filter((r) => r.rec.status !== "PENDING");
  const tier = calcTier(counted, mode);
  const recent30 = counted.slice(0, 30);
  const { best, worst } = opponentStats(recent30);
  const maxList = isMe ? 500 : 30; // 타인 조회는 최대 30개
  const list = records
    .filter((r) => (filter === "ALL" ? true : r.rec.kind === filter))
    .filter((r) => (oppQ.trim() ? r.oppName.includes(oppQ.trim()) : true)) // 비유저는 단순 텍스트 매칭
    .slice(0, Math.min(shown, maxList));
  const filteredTotal = records.filter((r) => (filter === "ALL" ? true : r.rec.kind === filter)).length;

  return (
    <div className="space-y-4">
      {/* 내 정보 */}
      <section className="flex items-center gap-4 rounded-lg border border-line bg-panel p-4">
        <div
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-full bg-panel2 text-3xl font-bold",
            profile.use_frame && "ring-4 ring-brand/70"
          )}
        >
          {profile.nickname?.[0]}
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold">
            {profile.nickname}
            {profile.use_badge && <span className="ml-2 rounded bg-brand/20 px-1.5 py-0.5 text-xs text-brand">{profile.role}</span>}
          </div>
          <div className="text-sm text-muted">
            {profile.gender === "남" ? "남자" : "여자"} {profile.weapon} / {profile.role} · {profile.division}
          </div>
          <div className="text-sm text-muted">{profile.affiliation} · {profile.region}</div>
        </div>
        {editable && (
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} aria-label="상세 설정">
            <Settings size={16} />
          </Button>
        )}
      </section>

      {hidden ? (
        <section className="rounded-lg border border-line bg-panel p-10 text-center text-muted">
          해당 유저는 전적을 비공개로 설정했습니다
        </section>
      ) : loading ? (
        <p className="text-center text-muted">불러오는 중…</p>
      ) : (
        <>
          {/* 티어 */}
          <section className="rounded-lg border border-line bg-panel p-4">
            <div className="mb-3 flex gap-1">
              {([["ALL", "종합"], ["OPEN", "오픈"], ["TOURNAMENT", "대회"]] as const).map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)} className={cn("rounded px-3 py-1 text-sm", mode === m ? "bg-brand text-white" : "text-muted hover:bg-white/5")}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 text-sm font-bold"
                style={{ borderColor: tier.tier?.color ?? "#555", color: tier.tier?.color ?? "#999" }}
              >
                {tier.tier ? tier.tier.name.slice(0, 2) : "?"}
              </div>
              <div>
                <div className="text-lg font-bold">{tier.tier?.name ?? "배치 중"}</div>
                <div className="text-sm text-muted">{tier.points} 점</div>
                {!tier.placed && (
                  <div className="text-xs text-muted">
                    배치고사: 오픈 {tier.openCount}/10경기 · 대회 {tier.tourCount}/2회 (둘 중 하나 충족 시 티어 부여)
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 최근 추이 */}
          <section className="rounded-lg border border-line bg-panel p-4">
            <h3 className="mb-2 font-bold">최근 추이 <span className="text-xs font-normal text-muted">(최근 {recent30.length}게임)</span></h3>
            {recent30.length === 0 ? (
              <p className="text-sm text-muted">아직 기록이 없습니다</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-3xl font-extrabold text-win">{winRate(recent30)}%</div>
                  <div className="text-xs text-muted">
                    {recent30.filter((r) => r.win).length}승 {recent30.filter((r) => !r.win).length}패
                  </div>
                </div>
                {([["승률 높은 상대", best], ["승률 낮은 상대", worst]] as const).map(([title, arr]) => (
                  <div key={title}>
                    <div className="mb-1 text-xs text-muted">{title} (2경기 이상)</div>
                    {arr.length === 0 && <div className="text-sm text-muted">-</div>}
                    {arr.map((o) => (
                      <div key={o.name} className="flex justify-between text-sm">
                        <span>{o.name}</span>
                        <span>{o.rate}% <span className="text-muted">({o.n})</span></span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 최근 전적 */}
          <section className="rounded-lg border border-line bg-panel p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-2 font-bold">최근 전적</h3>
              {(["ALL", "PRIVATE", "OPEN", "TOURNAMENT"] as const)
                .filter((f) => isMe || f !== "PRIVATE") // 타인에게는 프라이빗 필터 없음
                .map((f) => (
                  <button key={f} onClick={() => { setFilter(f); setShown(10); }} className={cn("rounded px-2.5 py-1 text-xs", filter === f ? "bg-brand text-white" : "text-muted hover:bg-white/5")}>
                    {f === "ALL" ? "전체" : KIND[f]}
                  </button>
                ))}
              <Input className="ml-auto h-8 w-40" placeholder="상대 이름 검색" value={oppQ} onChange={(e) => setOppQ(e.target.value)} />
            </div>
            {list.length === 0 && <p className="py-4 text-center text-sm text-muted">기록이 없습니다</p>}
            <div className="space-y-1.5">
              {list.map((r) => (
                <button
                  key={r.rec.id}
                  disabled={!editable}
                  onClick={() => setDetail(r)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border-l-4 bg-panel2 px-3 py-2 text-left text-sm",
                    r.rec.status === "PENDING" ? "border-yellow-400" : r.win ? "border-win" : "border-loss",
                    editable && "hover:bg-white/5"
                  )}
                >
                  <span className={cn("w-8 font-bold", r.win ? "text-win" : "text-loss")}>
                    {r.rec.status === "PENDING" ? "대기" : r.win ? "승" : "패"}
                  </span>
                  <span className="flex flex-1 items-center gap-1.5 truncate">vs <Dot member={!!r.oppId} />{r.oppName}</span>
                  <span className="font-semibold">{r.mine} : {r.theirs}</span>
                  <span className="hidden text-xs text-muted sm:inline">{KIND[r.rec.kind]}</span>
                  <span className="text-xs text-muted">{fmtDate(r.rec.played_at)}</span>
                </button>
              ))}
            </div>
            {shown < filteredTotal && shown < maxList && (
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setShown((s) => s + 10)}>더보기</Button>
            )}
          </section>

          {/* 피드백 노트 (본인만) */}
          {editable && (
            <section className="rounded-lg border border-line bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">내 피드백 노트</h3>
                <Link href="/notes" className="text-xs text-brand">더보기</Link>
              </div>
              {notes.length === 0 && <p className="text-sm text-muted">작성한 노트가 없습니다</p>}
              {notes.slice(0, 5).map((n) => (
                <button key={n.id} onClick={() => n.game && setDetail(n.game)} className="mb-1.5 block w-full rounded-md bg-panel2 px-3 py-2 text-left text-sm hover:bg-white/5">
                  <div className="truncate">{n.title ? `${n.title} · ` : ""}{n.content}</div>
                  <div className="text-xs text-muted">
                    {fmtDate(n.created_at)}{n.game && ` · vs ${n.game.oppName} ${n.game.mine}:${n.game.theirs}`}
                  </div>
                </button>
              ))}
            </section>
          )}
        </>
      )}

      {editable && <GameDetailModal view={detail} onClose={() => setDetail(null)} onChanged={load} />}
      {editable && showSettings && <SettingsModal open onClose={() => setShowSettings(false)} />}
    </div>
  );
}
