"use client";
// 오픈피스트 모집 상세: /openpiste/123
// - 정보: 종목·상태, 제목, 일시·진행 시간, 지역·장소, 레벨, 참가비, 신청 인원/정원, 주최자(유펜 프로필), 사진(최대 3장), 상세 내용
// - 참가자(신청한 회원)·주최자에게만 오픈채팅 링크와 '참가자 방' 버튼이 보인다.
// - 신청/신청 취소(시작 전), 주최자: 고치기(게시 중이면 승인 필요)·모집 마감/다시 열기·모집 취소(참가자에게 알림)·삭제(끝난 뒤)
// - 주최자에게는 승인 대기·반려(사유)·수정 승인 대기 안내. 다른 회원은 신고·차단, 관리자는 숨김·삭제 도구.
// 데이터: op_get / op_view / op_apply / op_leave / op_set_recruiting / op_cancel / op_delete / op_withdraw_edit
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MapPin, MessageCircle, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { ReportBlock } from "@/components/community/ReportBlock";
import { AdminContentTools } from "@/components/community/AdminContentTools";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/modal";
import { supabase } from "@/lib/supabase";
import { type BoardImage, boardImageUrl } from "@/lib/community";
import { type OpDetail, durationText, feeText, opDateText, opError, statusText } from "@/lib/openpiste";
import { cn } from "@/lib/utils";

export default function DetailPage() {
  return (
    <AppShell requireAuth>
      <Detail />
    </AppShell>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();
  const [p, setP] = useState<OpDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | "leave" | "close" | "delete">(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("op_get", { p_id: postId });
    if (e) { setError(opError(e.message)); return setP(null); }
    setP(data as OpDetail);
  }, [postId]);

  useEffect(() => {
    if (!Number.isFinite(postId)) return;
    load();
    supabase.rpc("op_view", { p_id: postId }); // 조회수(게시 중인 글만 오른다)
  }, [postId, load]);

  if (!Number.isFinite(postId)) return <p className="py-16 text-center text-muted">잘못된 주소입니다</p>;

  /** RPC 하나 실행 → 성공 문구 → 다시 읽기 */
  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) return toast.error(opError(e.message));
    toast.success(ok);
    load();
  };
  const cancel = async () => {
    const reason = window.prompt("모집을 취소할까요? 참가 신청한 회원에게 알림이 가요. 취소 사유를 적어 주세요(선택)", "");
    if (reason === null) return;
    run("op_cancel", { p_id: postId, p_reason: reason.trim() || null }, "모집을 취소했어요");
  };
  const remove = async () => {
    setAsk(null);
    setBusy(true);
    const { error: e } = await supabase.rpc("op_delete", { p_id: postId });
    setBusy(false);
    if (e) return toast.error(opError(e.message));
    toast.success("지웠어요");
    router.replace("/openpiste?mine=1");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/openpiste" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} />오픈피스트 목록</Link>
      {p === undefined && <p className="py-16 text-center text-muted">불러오는 중…</p>}
      {p === null && <p className="py-16 text-center text-muted">{error ?? "모집글을 찾을 수 없어요"}</p>}
      {p?.blocked && <p className="py-16 text-center text-muted">차단한 회원의 모집글이에요. 커뮤니티 설정에서 차단을 풀면 볼 수 있어요.</p>}
      {p && !p.blocked && <Body p={p} busy={busy} run={run} onCancel={cancel} setAsk={setAsk} reload={load} onBlocked={() => router.replace("/openpiste")} />}
      <Confirm open={ask === "leave"} message="참가 신청을 취소할까요? 주최자에게 알림이 가요." okText="신청 취소"
        onOk={() => { setAsk(null); run("op_leave", { p_id: postId }, "신청을 취소했어요"); }} onCancel={() => setAsk(null)} />
      <Confirm open={ask === "close"} message="모집을 마감할까요? 목록에서 빠지고 새 신청을 받지 않아요(시작 전에는 다시 열 수 있어요)." okText="모집 마감"
        onOk={() => { setAsk(null); run("op_set_recruiting", { p_id: postId, p_open: false }, "모집을 마감했어요"); }} onCancel={() => setAsk(null)} />
      <Confirm open={ask === "delete"} message="이 모집글을 지울까요? 참가자 방도 함께 사라져요." okText="삭제" onOk={remove} onCancel={() => setAsk(null)} />
    </div>
  );
}

function Body({ p, busy, run, onCancel, setAsk, reload, onBlocked }: {
  p: OpDetail;
  busy: boolean;
  run: (fn: string, args: Record<string, unknown>, ok: string) => void;
  onCancel: () => void;
  setAsk: (a: "leave" | "close" | "delete") => void;
  reload: () => void;
  onBlocked: () => void;
}) {
  const st = statusText(p);
  const upcoming = p.phase === "upcoming";
  const active = p.status === "open" || p.status === "closed";
  const member = p.is_mine || p.joined;
  const full = p.count >= p.capacity;
  // 관리자 도구에 넘길 상태(모집 중·마감·종료 = 게시 중으로 봄)
  const adminStatus = p.status === "hidden" ? "hidden" : "active";

  return (
    <>
      {/* 주최자 안내 */}
      {p.is_mine && p.status === "pending" && <Notice tone="pending">관리자 승인을 기다리고 있어요. 승인되면 목록에 게시되고 알림이 와요. 그 전에는 나만 볼 수 있어요.</Notice>}
      {p.is_mine && p.status === "rejected" && <Notice tone="loss">반려됐어요{p.status_reason ? ` — 사유: ${p.status_reason}` : ""}. 고쳐서 다시 승인을 요청할 수 있어요.</Notice>}
      {p.is_mine && p.status === "hidden" && <Notice tone="loss">신고가 쌓여 운영자 확인 전까지 가려졌어요.</Notice>}
      {p.has_pending_edit && (
        <Notice tone="pending">
          수정 내용이 승인을 기다리고 있어요. 승인 전까지 아래의 기존 내용이 그대로 보여요.{" "}
          <button className="text-brand hover:underline" disabled={busy} onClick={() => run("op_withdraw_edit", { p_id: p.id }, "수정 요청을 거뒀어요")}>수정 요청 거두기</button>
        </Notice>
      )}
      {p.status === "cancelled" && <Notice tone="loss">취소된 모집이에요{p.status_reason ? ` — ${p.status_reason}` : ""}.</Notice>}

      <article className="space-y-4 rounded-lg border border-line bg-panel p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded bg-brand/15 px-1.5 py-0.5 font-semibold text-brand">{p.weapon}</span>
            <span className={cn("rounded px-1.5 py-0.5 font-semibold", st === "모집 중" ? "bg-win/15 text-win" : "bg-white/[0.06] text-muted")}>{st}</span>
            {p.edited && <span className="text-muted">(수정됨)</span>}
          </div>
          <h1 className="text-lg font-bold">{p.title}</h1>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>주최</span>
            <CommunityCardView card={p.host} size={24} className="text-sm" />
          </div>
        </div>

        <dl className="grid gap-2 rounded-md bg-panel2 p-3 text-sm sm:grid-cols-2">
          <Info icon={<CalendarDays size={14} />} label="일시">{opDateText(p.starts_at)}</Info>
          <Info icon={<Clock size={14} />} label="진행 시간">{durationText(p.duration_h)}</Info>
          <Info icon={<MapPin size={14} />} label="장소">{p.region} · {p.place}</Info>
          <Info icon={<Wallet size={14} />} label="참가비">{feeText(p.fee)}</Info>
          <Info icon={<Users size={14} />} label="신청 / 정원"><span className={cn(full && "text-loss")}>{p.count} / {p.capacity}명</span></Info>
          <Info label="레벨">{p.levels.join(" · ")}</Info>
        </dl>

        {p.images.length > 0 && <Gallery images={p.images} />}

        {p.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{p.body}</p>}

        {p.chat_url ? (
          <a href={p.chat_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-sm text-brand hover:bg-brand/15">
            <MessageCircle size={15} />오픈채팅방 열기
          </a>
        ) : p.has_chat_url && <p className="text-xs text-muted">참가 신청하면 주최자가 남긴 오픈채팅방 링크가 보여요.</p>}

        {/* 동작 버튼 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {!p.is_mine && !p.joined && p.status === "open" && upcoming && (
            p.host_blocked_me ? <span className="text-xs text-muted">차단 관계인 회원의 모집에는 신청할 수 없어요</span>
              : <Button disabled={busy || full} onClick={() => run("op_apply", { p_id: p.id }, "참가 신청했어요. 참가자 방에서 인사해 보세요")}>{full ? "정원이 다 찼어요" : "참가 신청"}</Button>
          )}
          {!p.is_mine && p.joined && upcoming && active && <Button variant="outline" disabled={busy} onClick={() => setAsk("leave")}>신청 취소</Button>}
          {(member || p.is_admin) && p.status !== "pending" && p.status !== "rejected" && (
            <Link href={`/openpiste/${p.id}/room`}><Button>참가자 방</Button></Link>
          )}
          {p.is_mine && (
            <>
              {(p.status === "pending" || p.status === "rejected" || (active && upcoming)) && (
                <Link href={`/openpiste/write?edit=${p.id}`}><Button variant="outline">고치기</Button></Link>
              )}
              {p.status === "open" && upcoming && <Button variant="outline" disabled={busy} onClick={() => setAsk("close")}>모집 마감</Button>}
              {p.status === "closed" && upcoming && <Button variant="outline" disabled={busy} onClick={() => run("op_set_recruiting", { p_id: p.id, p_open: true }, "모집을 다시 열었어요")}>다시 열기</Button>}
              {active && p.phase !== "over" && <Button variant="danger" disabled={busy} onClick={onCancel}>모집 취소</Button>}
              {(p.status === "pending" || p.status === "rejected" || p.status === "cancelled" || p.status === "ended" || p.phase === "over") && (
                <Button variant="ghost" disabled={busy} onClick={() => setAsk("delete")}>삭제</Button>
              )}
            </>
          )}
          {p.can_report && <ReportBlock kind="openpiste" refId={String(p.id)} label={p.host.nickname ?? "주최자"} what="모집글" onBlocked={onBlocked} className="ml-auto" />}
        </div>
        {member && p.status !== "pending" && p.status !== "rejected" && (
          <p className="text-[11px] text-muted">참가자 방은 주최자와 참가자만 들어갈 수 있고, 유펜 프로필(닉네임·사진)로 보여요.</p>
        )}
      </article>

      {p.is_admin && <AdminContentTools kind="openpiste" refId={String(p.id)} status={adminStatus} onChanged={reload} />}
    </>
  );
}

/** 사진: 큰 사진 하나(누르면 원본) + 아래 작은 사진으로 바꿔 보기 */
function Gallery({ images }: { images: BoardImage[] }) {
  const [i, setI] = useState(0);
  const cur = images[Math.min(i, images.length - 1)];
  return (
    <div className="space-y-2">
      <a href={boardImageUrl(cur.path)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md bg-panel2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={boardImageUrl(cur.path)} alt="모집 사진" className="mx-auto max-h-80 w-auto object-contain" />
      </a>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((im, j) => (
            <button aria-pressed={j === i} key={im.id} onClick={() => setI(j)} className={cn("h-14 w-14 overflow-hidden rounded border", j === i ? "border-brand" : "border-line opacity-70")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async" src={boardImageUrl(im.thumb)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="flex w-20 shrink-0 items-center gap-1 text-xs text-muted">{icon}{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Notice({ tone, children }: { tone: "pending" | "loss"; children: React.ReactNode }) {
  return <p className={cn("rounded-md border px-3 py-2 text-xs leading-relaxed", tone === "pending" ? "border-pending/40 bg-pending/10" : "border-loss/40 bg-loss/10")}>{children}</p>;
}
