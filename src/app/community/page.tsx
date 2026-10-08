"use client";
// 커뮤니티 > 게시판 목록 (docs/COMMUNITY.md 2장)
// 탭: 전체(최신순, 공지 맨 위) / 이번 주 인기(최근 7일 좋아요·댓글 많은 글 20개씩) / 내 글 / 내 댓글
// 필터: 말머리 여러 개(합집합), 검색(제목·내용·제목+내용). 상태는 주소(?tab=&hot=&tags=&q=&f=)에 남겨 글을 보고 돌아와도 유지된다.
// 데이터: board_list / board_my_comments RPC (로그인 회원만, 차단한 회원의 글은 빠짐).
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Heart, Image as ImageIcon, MessageSquare, PenSquare, Pin, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { BOARD_TAGS, type BoardItem, boardImageUrl, communityError, timeAgo } from "@/lib/community";
import { cn } from "@/lib/utils";

type Tab = "all" | "hot" | "mine" | "mycomments";
const TABS: [Tab, string][] = [["all", "전체"], ["hot", "이번 주 인기"], ["mine", "내 글"], ["mycomments", "내 댓글"]];
const FIELDS = [["both", "제목+내용"], ["title", "제목"], ["body", "내용"]] as const;

export default function CommunityPage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Board />
      </Suspense>
    </AppShell>
  );
}

interface MyComment { id: number; post_id: number; body: string; created_at: string; anonymous: boolean; post_title: string; post_status: string }

function Board() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = (TABS.some(([k]) => k === sp.get("tab")) ? sp.get("tab") : "all") as Tab;
  const hot = sp.get("hot") === "comment" ? "comment" : "like";
  const tagsParam = sp.get("tags") ?? "";
  const tags = tagsParam.split(",").filter((t) => (BOARD_TAGS as readonly string[]).includes(t));
  const q = sp.get("q") ?? "";
  const field = (FIELDS.some(([k]) => k === sp.get("f")) ? sp.get("f") : "both") as (typeof FIELDS)[number][0];

  const [qInput, setQInput] = useState(q);
  const [items, setItems] = useState<BoardItem[] | null>(null);
  const [notices, setNotices] = useState<BoardItem[]>([]);
  const [mine, setMine] = useState<MyComment[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 주소의 조건 바꾸기(목록 다시 읽기는 아래 load 가 주소 변화를 보고 한다)
  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };

  const load = useCallback(async (offset: number) => {
    setError(null);
    if (tab === "mycomments") {
      const { data, error: e } = await supabase.rpc("board_my_comments", { p_offset: offset, p_limit: 20 });
      if (e) return setError(communityError(e.message));
      const r = data as { items: MyComment[]; has_more: boolean };
      setMine((prev) => (offset === 0 ? r.items : [...(prev ?? []), ...r.items]));
      setHasMore(r.has_more);
      return;
    }
    const pTab = tab === "hot" ? (hot === "comment" ? "hot_comment" : "hot_like") : tab;
    const { data, error: e } = await supabase.rpc("board_list", {
      p_tab: pTab, p_tags: tags.length ? tags : null, p_q: q || null, p_field: field, p_offset: offset, p_limit: 20,
    });
    if (e) return setError(communityError(e.message));
    const r = data as { items: BoardItem[]; notices: BoardItem[]; has_more: boolean };
    setItems((prev) => (offset === 0 ? r.items : [...(prev ?? []), ...r.items]));
    if (offset === 0) setNotices(r.notices ?? []);
    setHasMore(r.has_more);
    // tagsParam(문자열)로 바뀜을 감지한다 — tags 배열은 매번 새로 만들어져 의존성에 쓰지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hot, tagsParam, q, field]);

  useEffect(() => {
    setItems(null);
    setMine(null);
    load(0);
  }, [load]);

  const toggleTag = (t: string) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    setParams({ tags: next.join(",") || null });
  };
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: qInput.trim() || null });
  };

  const showFilters = tab === "all" || tab === "hot";
  const count = tab === "mycomments" ? mine?.length : items?.length;

  return (
    <div className="space-y-4">
      <CommunityHeader active="board" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setParams({ tab: k === "all" ? null : k })}
              className={cn("shrink-0 rounded px-3 py-1.5 text-sm", tab === k ? "bg-brand font-semibold text-brand-ink" : "bg-panel text-muted hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <Link href="/community/write" className="ml-auto">
          <Button size="sm"><PenSquare size={15} />글쓰기</Button>
        </Link>
      </div>

      {tab === "hot" && (
        <div className="flex gap-3 text-sm">
          {([["like", "좋아요 많은 글"], ["comment", "댓글 많은 글"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setParams({ hot: k === "like" ? null : k })} className={cn(hot === k ? "font-semibold text-brand" : "text-muted hover:text-foreground")}>{label}</button>
          ))}
          <span className="text-xs text-muted self-center">최근 7일 · 20개</span>
        </div>
      )}

      {showFilters && (
        <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
          <div className="flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-xs text-muted">말머리</span>
            {BOARD_TAGS.map((t) => (
              <button key={t} onClick={() => toggleTag(t)} aria-pressed={tags.includes(t)}
                className={cn("rounded-full border px-2.5 py-1 text-xs", tags.includes(t) ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-foreground")}>
                {t}
              </button>
            ))}
            {tags.length > 0 && <button onClick={() => setParams({ tags: null })} className="px-1 text-xs text-muted underline">전체 보기</button>}
          </div>
          {tab === "all" && (
            <form onSubmit={submitSearch} className="flex gap-2">
              <Select className="h-9 w-28 shrink-0" value={field} onChange={(e) => setParams({ f: e.target.value === "both" ? null : e.target.value })} aria-label="검색 범위">
                {FIELDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
              <Input className="h-9" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="검색어" maxLength={50} />
              <Button type="submit" size="sm" variant="outline" className="h-9 shrink-0" aria-label="검색"><Search size={15} /></Button>
            </form>
          )}
          {q && tab === "all" && (
            <p className="text-xs text-muted">&quot;{q}&quot; 검색 결과 <button className="ml-1 underline" onClick={() => { setQInput(""); setParams({ q: null }); }}>검색 지우기</button></p>
          )}
        </div>
      )}

      {error && <p className="py-8 text-center text-sm text-loss">{error}</p>}
      {!error && count === undefined && <p className="py-16 text-center text-muted">불러오는 중…</p>}

      {tab === "mycomments" ? (
        mine && (mine.length === 0 ? <p className="py-16 text-center text-sm text-muted">아직 쓴 댓글이 없어요</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {mine.map((c) => (
              <li key={c.id}>
                <Link href={`/community/${c.post_id}#c${c.id}`} className="block px-4 py-3 hover:bg-white/[0.03]">
                  <p className="line-clamp-2 text-sm">{c.body}</p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {c.anonymous && "익명 · "}「{c.post_title}」{c.post_status === "hidden" && " (가려진 글)"} · {timeAgo(c.created_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ))
      ) : (
        items && (items.length === 0 && notices.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            {tab === "mine" ? "아직 쓴 글이 없어요" : q || tags.length ? "조건에 맞는 글이 없어요" : tab === "hot" ? "이번 주 인기 글이 아직 없어요" : "첫 글을 남겨 보세요"}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {tab === "all" && notices.map((p) => <Row key={`n${p.id}`} p={p} />)}
            {items.map((p) => <Row key={p.id} p={p} />)}
          </ul>
        ))
      )}

      {hasMore && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => load(tab === "mycomments" ? mine?.length ?? 0 : items?.length ?? 0)}>더 보기</Button>
        </div>
      )}
    </div>
  );
}

/** 목록 한 줄: [공지] 말머리 · 제목 [댓글 수] / 작성자 · 시각 · 조회 · 좋아요, 사진이 있으면 오른쪽에 썸네일 */
function Row({ p }: { p: BoardItem }) {
  return (
    <li>
      <Link href={`/community/${p.id}`} className={cn("flex gap-3 px-4 py-3 hover:bg-white/[0.03]", p.is_notice && "bg-brand/[0.04]")}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {p.is_notice && <span className="inline-flex items-center gap-0.5 rounded bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink"><Pin size={11} />공지</span>}
            {!p.is_notice && p.tags.map((t) => <span key={t} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted">{t}</span>)}
            {p.status === "hidden" && <span className="rounded bg-loss/20 px-1.5 py-0.5 text-[11px] text-loss">가려짐</span>}
          </div>
          <p className="flex items-center gap-1.5 text-[15px] font-semibold">
            <span className="truncate">{p.title}</span>
            {p.image_count > 0 && <ImageIcon size={14} className="shrink-0 text-muted" aria-label={`사진 ${p.image_count}장`} />}
            {p.comment_count > 0 && <span className="shrink-0 text-sm font-semibold text-brand">[{p.comment_count}]</span>}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <CommunityCardView card={p.card} size={18} link={false} className="text-xs text-foreground/90" />
            <span>{timeAgo(p.created_at)}{p.edited && " (수정됨)"}</span>
            <span>조회 {p.view_count}</span>
            {p.like_count > 0 && <span className="inline-flex items-center gap-0.5"><Heart size={11} />{p.like_count}</span>}
            {p.comment_count > 0 && <span className="inline-flex items-center gap-0.5 sm:hidden"><MessageSquare size={11} />{p.comment_count}</span>}
          </div>
        </div>
        {p.thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={boardImageUrl(p.thumb)} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 shrink-0 rounded-md object-cover" />
        )}
      </Link>
    </li>
  );
}
