"use client";
// 커뮤니티 > 게시글 상세: /community/123 (#c45 로 들어오면 그 댓글로 스크롤)
// - 본문·사진·좋아요(내 글은 불가)·내 글 수정/삭제·신고/차단
// - 댓글·답글(1단계), 익명 댓글은 글마다 익명1·익명2…, 익명 글쓴이의 익명 댓글은 '글쓴이'. 글과 같은 얼굴로 쓴 작성자 댓글에 '글쓴이' 표시.
// - 관리자: 숨김/복구/삭제, 익명·전용 프로필 작성자 확인(확인 기록이 관리 기록에 남음)
// 데이터: board_post / board_view / board_like / board_comment / board_comment_edit / board_comment_delete / board_delete
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Heart, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { ReportBlock } from "@/components/community/ReportBlock";
import { AdminContentTools } from "@/components/community/AdminContentTools";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import {
  COMMENT_MAX, type BoardComment, type BoardPost, boardImageUrl, communityError, hasPhoneNumber, timeAgo,
} from "@/lib/community";
import { cn } from "@/lib/utils";

export default function PostPage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Inner />
      </Suspense>
    </AppShell>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();
  const [post, setPost] = useState<BoardPost | null | undefined>(undefined); // undefined = 불러오는 중, null = 없음
  const [error, setError] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const scrolled = useRef(false);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("board_post", { p_id: postId });
    if (e) {
      setError(communityError(e.message));
      return setPost(null);
    }
    setPost(data as BoardPost);
  }, [postId]);

  useEffect(() => {
    if (!Number.isFinite(postId)) return;
    load();
    // 조회수: 같은 브라우저 세션에서 한 번만 센다
    try {
      const key = `viewed-post-${postId}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        supabase.rpc("board_view", { p_id: postId });
      }
    } catch {
      /* 저장소를 못 쓰는 환경이면 조회수만 세지 않는다 */
    }
  }, [postId, load]);

  // 알림 링크(#c45)로 들어왔으면 그 댓글로 스크롤
  useEffect(() => {
    if (!post || scrolled.current) return;
    const hash = window.location.hash;
    if (hash.startsWith("#c")) {
      scrolled.current = true;
      setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [post]);

  if (!Number.isFinite(postId)) return <p className="py-16 text-center text-muted">잘못된 주소입니다</p>;

  const like = async () => {
    if (!post) return;
    const { data, error: e } = await supabase.rpc("board_like", { p_id: post.id });
    if (e) return toast.error(communityError(e.message));
    const r = data as { liked: boolean; like_count: number };
    setPost({ ...post, liked: r.liked, like_count: r.like_count });
  };
  const remove = async () => {
    setAskDelete(false);
    const { error: e } = await supabase.rpc("board_delete", { p_id: postId });
    if (e) return toast.error(communityError(e.message));
    toast.success("글을 삭제했어요");
    router.replace("/community");
  };

  return (
    <div className="space-y-4">
      <CommunityHeader active="board" />
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} />목록</Link>

      {post === undefined && <p className="py-16 text-center text-muted">불러오는 중…</p>}
      {post === null && <p className="py-16 text-center text-muted">{error ?? "글을 찾을 수 없어요"}</p>}
      {post?.blocked && <p className="py-16 text-center text-muted">차단한 회원의 글이에요. 차단은 마이 펜싱 &gt; 커뮤니티 설정에서 해제할 수 있어요.</p>}

      {post && !post.blocked && (
        <>
          <article className="space-y-4 rounded-lg border border-line bg-panel p-4 sm:p-5">
            {post.status === "hidden" && (
              <p className="rounded-md bg-loss/10 px-3 py-2 text-xs text-loss">신고가 쌓여 가려진 글이에요. 작성자와 운영자만 볼 수 있고, 운영자가 확인한 뒤 복구하거나 삭제해요.</p>
            )}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {post.is_notice && <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink">공지</span>}
                {!post.is_notice && post.tags.map((t) => <Link key={t} href={`/community?tags=${encodeURIComponent(t)}`} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground">{t}</Link>)}
              </div>
              <h2 className="text-lg font-bold leading-snug">{post.title}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <CommunityCardView card={post.card} size={26} className="text-sm text-foreground" />
                <span>{timeAgo(post.created_at)}{post.edited && " (수정됨)"}</span>
                <span>조회 {post.view_count}</span>
              </div>
            </div>

            <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.body}</div>

            {post.images.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {post.images.map((img) => (
                  <a key={img.id} href={boardImageUrl(img.path)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md bg-panel2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={boardImageUrl(img.path)} alt="" loading="lazy" width={img.w ?? undefined} height={img.h ?? undefined} className="h-auto max-h-[480px] w-full object-contain" />
                  </a>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button size="sm" variant={post.liked ? "primary" : "outline"} onClick={like} disabled={post.is_mine || post.status !== "active"} aria-pressed={post.liked}
                title={post.is_mine ? "내 글에는 좋아요를 누를 수 없어요" : undefined}>
                <Heart size={15} className={cn(post.liked && "fill-current")} />좋아요 {post.like_count}
              </Button>
              <span className="inline-flex items-center gap-1 text-sm text-muted"><MessageSquare size={15} />댓글 {post.comment_count}</span>
              <span className="ml-auto flex items-center gap-3 text-xs">
                {post.is_mine ? (
                  <>
                    {post.status === "active" && <Link href={`/community/write?edit=${post.id}`} className="text-muted hover:text-foreground">수정</Link>}
                    <button className="text-muted hover:text-loss" onClick={() => setAskDelete(true)}>삭제</button>
                  </>
                ) : post.card.kind !== "gone" && (
                  <ReportBlock kind="post" refId={String(post.id)} label={post.card.kind === "a" ? "이 익명 작성자" : post.card.nickname ?? "이 회원"} what="게시글"
                    onBlocked={() => router.replace("/community")} />
                )}
              </span>
            </div>
            {post.is_admin && <AdminContentTools kind="post" refId={String(post.id)} status={post.status} onChanged={load} />}
          </article>

          <Comments post={post} onChanged={load} />
          <Confirm open={askDelete} message="이 글을 삭제할까요? 삭제한 글은 되돌릴 수 없어요." okText="삭제" onOk={remove} onCancel={() => setAskDelete(false)} />
        </>
      )}
    </div>
  );
}

/** 댓글 목록 + 새 댓글 입력. 답글은 부모 댓글 아래에 들여 쓴다 */
function Comments({ post, onChanged }: { post: BoardPost; onChanged: () => void }) {
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const tops = post.comments.filter((c) => c.parent_id === null);
  const repliesOf = (id: number) => post.comments.filter((c) => c.parent_id === id);
  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4 sm:p-5">
      <h3 className="text-sm font-bold">댓글 {post.comment_count}</h3>
      {tops.length === 0 && <p className="text-sm text-muted">첫 댓글을 남겨 보세요</p>}
      <ul className="space-y-3">
        {tops.map((c) => (
          <li key={c.id} className="space-y-2">
            <CommentItem c={c} post={post} onReply={() => setReplyTo(replyTo === c.id ? null : c.id)} onChanged={onChanged} />
            {(repliesOf(c.id).length > 0 || replyTo === c.id) && (
              <ul className="ml-4 space-y-2 border-l-2 border-line pl-3 sm:ml-6">
                {repliesOf(c.id).map((r) => (
                  <li key={r.id}><CommentItem c={r} post={post} onReply={() => setReplyTo(c.id)} onChanged={onChanged} /></li>
                ))}
                {replyTo === c.id && (
                  <li><CommentForm postId={post.id} parentId={c.id} onDone={() => { setReplyTo(null); onChanged(); }} onCancel={() => setReplyTo(null)} /></li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {post.status === "active" && <div className="border-t border-line pt-3"><CommentForm postId={post.id} onDone={onChanged} /></div>}
    </section>
  );
}

/** 댓글 하나: 작성자 카드(+글쓴이 표시) · 시각 · 본문 · 답글/수정/삭제/신고 */
function CommentItem({ c, post, onReply, onChanged }: { c: BoardComment; post: BoardPost; onReply: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body ?? "");
  const [askDelete, setAskDelete] = useState(false);

  if (c.status !== "active" || !c.card) {
    const msg = c.status === "blocked" ? "차단한 회원의 댓글이에요" : c.status === "hidden" ? "신고로 가려진 댓글이에요" : "삭제된 댓글이에요";
    return (
      <div id={`c${c.id}`} className="space-y-1">
        <p className="text-sm text-muted">{msg}</p>
        {post.is_admin && c.status !== "blocked" && <AdminContentTools kind="comment" refId={String(c.id)} status={c.status} onChanged={onChanged} compact />}
      </div>
    );
  }

  const save = async () => {
    const { error } = await supabase.rpc("board_comment_edit", { p_id: c.id, p_body: text });
    if (error) return toast.error(communityError(error.message));
    setEditing(false);
    onChanged();
  };
  const remove = async () => {
    setAskDelete(false);
    const { error } = await supabase.rpc("board_comment_delete", { p_id: c.id });
    if (error) return toast.error(communityError(error.message));
    onChanged();
  };

  return (
    <div id={`c${c.id}`} className="space-y-1 scroll-mt-24">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <CommunityCardView card={c.card} size={22} className="text-sm text-foreground"
          extra={c.is_op && c.card.nickname !== "글쓴이" ? <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">글쓴이</span> : undefined} />
        <span>{timeAgo(c.created_at)}{c.edited && " (수정됨)"}</span>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={text} maxLength={COMMENT_MAX} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={!text.trim()} onClick={save}>저장</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setText(c.body ?? ""); }}>취소</Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        {post.status === "active" && <button className="hover:text-foreground" onClick={onReply}>답글</button>}
        {c.is_mine ? (
          <>
            {!editing && <button className="hover:text-foreground" onClick={() => setEditing(true)}>수정</button>}
            <button className="hover:text-loss" onClick={() => setAskDelete(true)}>삭제</button>
          </>
        ) : (
          // 탈퇴 회원의 댓글은 신고·차단할 대상이 없다
          c.card.kind !== "gone" && (
            <ReportBlock kind="comment" refId={String(c.id)} label={c.card.kind === "a" ? "이 익명 작성자" : c.card.nickname ?? "이 회원"} what="댓글" onBlocked={onChanged} />
          )
        )}
      </div>
      {post.is_admin && <AdminContentTools kind="comment" refId={String(c.id)} status={c.status} onChanged={onChanged} compact />}
      <Confirm open={askDelete} message="이 댓글을 삭제할까요?" okText="삭제" onOk={remove} onCancel={() => setAskDelete(false)} />
    </div>
  );
}

/** 댓글·답글 입력: 익명 선택, 1,000자, @닉네임 멘션 안내, 전화번호 경고 */
function CommentForm({ postId, parentId, onDone, onCancel }: { postId: number; parentId?: number; onDone: () => void; onCancel?: () => void }) {
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    if (hasPhoneNumber(body) && !window.confirm("전화번호처럼 보이는 내용이 있어요. 연락처는 공개 댓글에 쓰지 않는 게 안전해요. 그대로 올릴까요?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("board_comment", { p_post: postId, p_body: body, p_parent: parentId ?? null, p_anonymous: anon });
    setBusy(false);
    if (error) return toast.error(communityError(error.message));
    setText("");
    onDone();
  };
  return (
    <div className="space-y-2">
      <Textarea value={text} maxLength={COMMENT_MAX} onChange={(e) => setText(e.target.value)} placeholder={parentId ? "답글을 입력하세요" : "댓글을 입력하세요 (@닉네임으로 회원을 부를 수 있어요)"} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />익명</label>
        {anon && <span className="text-[11px] text-muted">익명이어도 문제가 될 경우에만 운영자가 작성자를 확인할 수 있어요</span>}
        <span className="ml-auto text-[11px] text-muted">{text.length}/{COMMENT_MAX}</span>
        {onCancel && <Button size="sm" variant="outline" onClick={onCancel}>취소</Button>}
        <Button size="sm" disabled={busy || !text.trim()} onClick={submit}>{parentId ? "답글 등록" : "댓글 등록"}</Button>
      </div>
    </div>
  );
}
