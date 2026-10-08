"use client";
// 관리자: 커뮤니티 신고 처리 (docs/COMMUNITY.md 0-5·0-6)
// - 목록: admin_community_reports(상태별 최근 100건). 신고 당시 내용 사본(snapshot)·신고 수·대상 회원(유펜 닉네임 + 커뮤니티 닉네임)·현재 정지 상태.
// - 처리: 처리 완료/기각(같은 대상의 열린 신고를 한꺼번에), 커뮤니티 정지(1·7·30일·영구, 사유 필수), 커뮤니티 닉네임 지우기, 커뮤니티 사진 삭제,
//   게시글·댓글·장터 글·자유톡방 메시지는 숨김/복구/삭제(AdminContentTools) + 글 열어 보기, 자유톡방 익명 닉네임 지우기.
// - 대상 회원이 누구인지(실제 계정)는 관리자에게만 보인다. 익명 글·댓글·자유톡방 익명 닉네임 메시지는 이름을 숨기고 '작성자 확인'(기록이 남음)으로만 본다.
//   처리 내역은 관리 기록(admin_audit)에 남는다.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { callApi, fmtDateTime, rpcOk } from "@/lib/adminApi";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { AdminContentTools } from "@/components/community/AdminContentTools";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { CommunityBanModal } from "./CommunityBanModal";
import { boardImageUrl } from "@/lib/community";

interface CReport {
  id: number; target_kind: string; target_ref: string; reason: string; detail: string | null;
  snapshot: { nickname?: string | null; avatar_url?: string | null; [k: string]: unknown } | null;
  status: "open" | "resolved" | "dismissed"; created_at: string; handled_at: string | null;
  target_user_id: string | null; target_nickname: string | null; target_community_nickname: string | null; target_community_avatar: string | null;
  reporter_nickname: string | null; same_target_count: number; target_user_count: number;
  ban_until: string | null; ban_permanent: boolean;
  target_anonymous: boolean; content_status: string | null; // 게시글·댓글: 익명 여부, 지금 상태(active/hidden/deleted, 완전 삭제되면 null)
  target_has_chat_nickname?: boolean; // 대상 회원에게 자유톡방 익명 닉네임이 있는지
}
const STATUS = { open: "미처리", resolved: "처리됨", dismissed: "기각" } as const;
const KIND: Record<string, string> = { cprofile: "커뮤니티 프로필", yprofile: "유펜 프로필(커뮤니티)", post: "게시글", comment: "댓글", listing: "장터 글", dmthread: "1:1 채팅", chat: "자유톡방 메시지", openpiste: "오픈피스트 모집", opmsg: "오픈피스트 참가자 방" };
const CONTENT_KINDS = ["post", "comment", "listing", "chat", "openpiste", "opmsg"] as const;
type ContentKind = (typeof CONTENT_KINDS)[number];
const isContentKind = (k: string): k is ContentKind => (CONTENT_KINDS as readonly string[]).includes(k);
const CONTENT_STATUS: Record<string, string> = { active: "게시 중", hidden: "가려짐", deleted: "삭제됨" };

export function CommunityReportsAdmin({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState("open");
  const [list, setList] = useState<CReport[] | null>(null);
  const [banFor, setBanFor] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_community_reports", { p_status: status });
    setList((data ?? []) as CReport[]);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const done = (msg: string) => { toast.success(msg); load(); onChanged?.(); };
  const resolve = async (r: CReport, s: "resolved" | "dismissed" | "open") => {
    const err = await rpcOk("admin_resolve_community_report", { p_id: r.id, p_status: s });
    if (err) return toast.error(err);
    done(s === "resolved" ? "처리 완료로 표시했어요" : s === "dismissed" ? "신고를 기각했어요" : "미처리로 되돌렸어요");
  };
  const clearNick = async (r: CReport) => {
    if (!r.target_user_id) return;
    const err = await rpcOk("admin_clear_community_nickname", { p_target: r.target_user_id });
    if (err) return toast.error(err);
    done("커뮤니티 닉네임을 지웠어요(회원에게 알림)");
  };
  const clearChatNick = async (r: CReport) => {
    if (!r.target_user_id) return;
    const err = await rpcOk("admin_clear_chat_nickname", { p_target: r.target_user_id });
    if (err) return toast.error(err);
    done("자유톡방 닉네임을 지웠어요(회원에게 알림, 다음 입장 때 새로 정함)");
  };
  const removePhoto = async (r: CReport, lock: boolean) => {
    if (!r.target_user_id) return;
    const res = await callApi(`/api/avatar?slot=community&target=${r.target_user_id}${lock ? "" : "&lock=0"}`, { method: "DELETE" });
    if (!res.ok) return toast.error(res.message ?? "처리하지 못했어요");
    done(lock ? "커뮤니티 사진을 지우고 사진 변경을 제한했어요" : "커뮤니티 사진을 지웠어요");
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-base font-bold">커뮤니티 신고</h2>
        <Select className="h-8 w-28" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">미처리</option><option value="resolved">처리됨</option><option value="dismissed">기각</option><option value="all">전체</option>
        </Select>
      </div>
      <p className="text-xs text-muted">같은 대상을 서로 다른 3명이 신고하면 자동으로 임시 숨김돼요(게시글·댓글·장터 글·자유톡방 메시지). 처리/기각은 같은 대상의 열린 신고에 함께 적용돼요.</p>
      {list === null ? <p className="py-4 text-center text-sm text-muted">불러오는 중…</p> : list.length === 0 ? <p className="py-4 text-center text-sm text-muted">해당하는 신고가 없습니다</p> : (
        <ul className="space-y-2">
          {list.map((r) => {
            const banned = r.ban_permanent || !!r.ban_until; // DB 가 지금 효력 있는 정지만 돌려준다
            const isProfile = r.target_kind === "cprofile" || r.target_kind === "yprofile";
            return (
              <li key={r.id} className="flex gap-3 rounded-md bg-panel2 p-3 text-sm">
                {isProfile && <Avatar avatarUrl={r.snapshot?.avatar_url ?? null} clubId={null} affiliation={null} nickname={r.snapshot?.nickname ?? null} size={56} className="!rounded-lg" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px]">{KIND[r.target_kind] ?? r.target_kind}</span>
                    <b>{r.snapshot?.nickname ?? "(이름 없음)"}</b>
                    <span className="rounded bg-loss/20 px-1.5 py-0.5 text-[11px] text-loss">{r.reason}</span>
                    <span className="text-[11px] text-muted">{STATUS[r.status]}</span>
                    {r.same_target_count > 1 && <span className="text-[11px] text-loss">같은 대상 신고 {r.same_target_count}건</span>}
                  </div>
                  {!isProfile && <ContentPreview r={r} />}
                  {r.detail && <p className="whitespace-pre-wrap text-xs">신고 내용: {r.detail}</p>}
                  <p className="text-xs text-muted">
                    대상 회원: {r.target_anonymous ? "익명(작성자 확인으로 볼 수 있어요)" : r.target_nickname ?? "(탈퇴)"}{r.target_community_nickname ? ` · 커뮤니티 닉네임 ${r.target_community_nickname}` : ""} · 이 회원 신고 누적 {r.target_user_count}건
                    {banned && <span className="text-loss"> · 정지 중{r.ban_permanent ? "(영구)" : ` ~${fmtDateTime(r.ban_until)}`}</span>}
                  </p>
                  <p className="text-xs text-muted">신고자 {r.reporter_nickname ?? "(탈퇴)"} · {fmtDateTime(r.created_at)}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {r.status === "open" ? (
                      <>
                        <Button size="sm" onClick={() => resolve(r, "resolved")}>처리 완료</Button>
                        <Button size="sm" variant="outline" onClick={() => resolve(r, "dismissed")}>기각</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => resolve(r, "open")}>미처리로 되돌리기</Button>
                    )}
                    {r.target_user_id && !banned && <Button size="sm" variant="danger" onClick={() => setBanFor({ id: r.target_user_id!, name: r.target_anonymous ? "이 익명 작성자" : r.target_nickname ?? "이 회원" })}>커뮤니티 정지</Button>}
                    {r.target_kind === "cprofile" && r.target_community_nickname && <Button size="sm" variant="outline" onClick={() => clearNick(r)}>커뮤니티 닉네임 지우기</Button>}
                    {r.target_kind === "chat" && r.snapshot?.persona === "n" && r.target_has_chat_nickname && (
                      <Button size="sm" variant="outline" onClick={() => clearChatNick(r)}>자유톡방 닉네임 지우기</Button>
                    )}
                    {r.target_kind === "cprofile" && r.target_community_avatar?.startsWith("http") && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => removePhoto(r, true)}>사진 삭제 + 변경 제한</Button>
                        <Button size="sm" variant="ghost" onClick={() => removePhoto(r, false)}>사진만 삭제</Button>
                      </>
                    )}
                  </div>
                  {!isProfile && r.content_status && isContentKind(r.target_kind) && (
                    <AdminContentTools kind={r.target_kind} refId={r.target_ref} status={r.content_status} onChanged={load} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <CommunityBanModal target={banFor} onClose={() => setBanFor(null)} onDone={() => done("커뮤니티 이용을 정지했어요(회원에게 알림)")} />
    </section>
  );
}

/** 신고된 게시글·댓글의 신고 당시 내용(사본)과 지금 상태, 글 열어 보기 링크 */
function ContentPreview({ r }: { r: CReport }) {
  const snap = r.snapshot ?? {};
  if (snap.purged) return <p className="text-xs text-muted">월말 정리로 완전히 삭제된 내용이에요</p>;
  const postId = snap.post_id as number | undefined;
  const listingId = snap.listing_id as number | undefined;
  const msgs = Array.isArray(snap.messages) ? (snap.messages as { from: string; body: string; image: string | null; at: string; target?: boolean }[]) : null;
  const isChat = r.target_kind === "chat" || r.target_kind === "opmsg"; // 대화 흐름(신고된 메시지 + 앞 10개)으로 보여 주는 종류
  const opId = snap.op_id as number | undefined;
  return (
    <div className="space-y-1 rounded-md border border-line bg-panel px-3 py-2 text-xs">
      {typeof snap.title === "string" && <p className="font-semibold">{snap.title}</p>}
      {/* 자유톡방은 아래 대화 흐름에 신고된 메시지가 표시되므로 본문을 따로 쓰지 않는다 */}
      {typeof snap.detail === "string" && <p className="text-muted">{snap.detail}</p>}
      {!isChat && typeof snap.body === "string" && <p className="line-clamp-4 whitespace-pre-wrap">{snap.body}</p>}
      {msgs && (
        // 1:1 채팅 신고: 신고 당시 최근 메시지 30개(누가 보냈는지는 신고자/상대로만)
        // 자유톡방 신고: 신고된 메시지(빨간 바탕)와 바로 앞 10개(보낸 이름 포함)
        <ul className="max-h-48 space-y-0.5 overflow-y-auto">
          {msgs.map((m, i) => (
            <li key={i} className={m.target ? "rounded bg-loss/15 px-1" : undefined}>
              <b className={isChat ? (m.target ? "text-loss" : "text-muted") : m.from === "상대" ? "text-loss" : "text-muted"}>{m.from}</b> {m.body || (m.image ? "(사진)" : "")}
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted">
        표시 이름 {String(snap.nickname ?? "-")}{r.target_kind !== "dmthread" && <> · 지금 상태 {r.content_status ? CONTENT_STATUS[r.content_status] ?? r.content_status : "완전 삭제"}</>}
        {postId && <> · <Link href={`/community/${postId}${r.target_kind === "comment" ? `#c${r.target_ref}` : ""}`} className="text-brand" target="_blank">글 열기</Link></>}
        {listingId && <> · <Link href={`/community/market/${listingId}`} className="text-brand" target="_blank">장터 글 열기</Link></>}
        {opId && <> · <Link href={`/openpiste/${opId}${r.target_kind === "opmsg" ? "/room" : ""}`} className="text-brand" target="_blank">{r.target_kind === "opmsg" ? "참가자 방 열기" : "모집글 열기"}</Link></>}
        {isChat && typeof snap.image === "string" && <> · <a href={boardImageUrl(snap.image)} className="text-brand" target="_blank" rel="noopener noreferrer">사진 보기</a></>}
      </p>
    </div>
  );
}
