"use client";
// 커뮤니티 > 글쓰기 / 글 수정(/community/write?edit=123)
// - 말머리 여러 개(안 고르면 '자유'), 제목 60자, 내용 5,000자, 사진 3장, 익명으로 쓰기(새 글만 — 수정 때 바꾸면 작성자가 드러날 수 있어 고정)
// - 관리자는 '공지로 올리기'(목록 맨 위 고정, 익명 불가)
// - 사진: lib/communityUpload.ts 가 긴 변 2048px 로 줄여 서버(/api/community-image?kind=post)로 한 장씩 → 서버가 위치 정보 제거·1280px webp·썸네일을 만든다
// - 올라갈 얼굴 미리보기: 지금 커뮤니티 설정의 프로필(익명이면 '익명'). 글은 쓸 때의 얼굴로 계속 보인다.
// 저장: board_write / board_edit RPC (도배 방지·정지 검사는 DB 가 한다)
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityCardView } from "@/components/community/CommunityCardView";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { uploadCommunityImage } from "@/lib/communityUpload";
import {
  BOARD_TAGS, BODY_MAX, IMAGE_MAX, TITLE_MAX, type BoardImage, type BoardPost, type CommunityCard, type CommunityStatus,
  boardImageUrl, communityError, fetchMyCommunity, hasPhoneNumber,
} from "@/lib/community";
import { cn } from "@/lib/utils";

export default function WritePage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Write />
      </Suspense>
    </AppShell>
  );
}

function Write() {
  const editId = Number(useSearchParams().get("edit")) || null;
  const router = useRouter();
  const { profile } = useAuth();
  const [loaded, setLoaded] = useState(!editId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [anon, setAnon] = useState(false);
  const [notice, setNotice] = useState(false);
  const [images, setImages] = useState<BoardImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [face, setFace] = useState<CommunityCard | null>(null);
  const [editAnon, setEditAnon] = useState(false);
  const [editCard, setEditCard] = useState<CommunityCard | null>(null); // 수정: 글을 쓸 때의 얼굴(그대로 유지됨)
  const [banned, setBanned] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMyCommunity().then((m) => setFace(m?.card ?? null));
    supabase.rpc("my_community_status").then(({ data }) => setBanned(!!(data as CommunityStatus | null)?.banned));
    if (!editId) return;
    // 수정: 내 글인지 확인하고 내용을 채운다
    supabase.rpc("board_post", { p_id: editId }).then(({ data, error }) => {
      const p = data as BoardPost | null;
      if (error || !p || p.blocked || !p.is_mine) {
        toast.error(error ? communityError(error.message) : "내가 쓴 글만 고칠 수 있어요");
        return router.replace("/community");
      }
      setTitle(p.title);
      setBody(p.body);
      setTags(p.tags);
      setImages(p.images);
      setEditAnon(p.anonymous);
      setEditCard(p.card);
      setNotice(p.is_notice);
      setLoaded(true);
    });
  }, [editId, router]);

  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const pick = async (files: FileList | null) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!files?.length) return;
    const room = IMAGE_MAX - images.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) toast.error(`사진은 ${IMAGE_MAX}장까지 올릴 수 있어요`);
    setUploading(true);
    for (const f of list) {
      const r = await uploadCommunityImage(f, "post");
      if ("error" in r) { toast.error(r.error); break; }
      setImages((cur) => [...cur, r]);
    }
    setUploading(false);
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("제목을 입력해 주세요");
    if (!body.trim()) return toast.error("내용을 입력해 주세요");
    if (hasPhoneNumber(`${title} ${body}`) && !window.confirm("전화번호처럼 보이는 내용이 있어요. 연락처는 공개 글에 쓰지 않는 게 안전해요. 그대로 올릴까요?")) return;
    setBusy(true);
    const ids = images.map((i) => i.id);
    const { data, error } = editId
      ? await supabase.rpc("board_edit", { p_id: editId, p_title: title, p_body: body, p_tags: tags, p_uploads: ids })
      : await supabase.rpc("board_write", { p_title: title, p_body: body, p_tags: tags, p_anonymous: anon, p_uploads: ids, p_notice: notice });
    setBusy(false);
    if (error) return toast.error(communityError(error.message));
    toast.success(editId ? "글을 고쳤어요" : "글을 올렸어요");
    router.replace(`/community/${editId ?? (data as number)}`);
  };

  if (!loaded) return <p className="py-16 text-center text-muted">불러오는 중…</p>;
  const showAnon = editId ? editAnon : anon;
  const previewCard: CommunityCard | null = editId ? editCard : showAnon ? { kind: "a", nickname: "익명" } : face;

  return (
    <div className="space-y-4">
      <CommunityHeader active="board" />
      <div className="space-y-4 rounded-lg border border-line bg-panel p-4 sm:p-5">
        <h2 className="text-base font-bold">{editId ? "글 수정" : "글쓰기"}</h2>
        {banned && <p className="rounded-md bg-loss/10 px-3 py-2 text-xs text-loss">커뮤니티 이용이 제한된 상태라 글을 올릴 수 없어요.</p>}

        <div>
          <Label>말머리 (여러 개 고를 수 있어요 · 안 고르면 &apos;자유&apos;)</Label>
          <div className="flex flex-wrap gap-1.5">
            {BOARD_TAGS.map((t) => (
              <button key={t} type="button" onClick={() => toggleTag(t)} aria-pressed={tags.includes(t)}
                className={cn("rounded-full border px-3 py-1 text-sm", tags.includes(t) ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-foreground")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>제목</Label>
          <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력하세요" />
        </div>
        <div>
          <Label>내용</Label>
          <Textarea value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} className="min-h-[220px]"
            placeholder="펜싱 이야기를 나눠 주세요. 다른 사람의 실명·연락처 등 개인정보는 쓰지 말아 주세요." />
          <p className="mt-1 text-right text-[11px] text-muted">{body.length}/{BODY_MAX}</p>
        </div>

        <div className="space-y-2">
          <Label>사진 ({images.length}/{IMAGE_MAX})</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={boardImageUrl(img.thumb)} alt="" width={88} height={88} className="h-22 w-22 rounded-md object-cover" />
                <button type="button" onClick={() => setImages((cur) => cur.filter((x) => x.id !== img.id))} aria-label="사진 빼기"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background text-foreground shadow ring-1 ring-line">
                  <X size={12} />
                </button>
              </div>
            ))}
            {images.length < IMAGE_MAX && (
              <button type="button" disabled={uploading || banned} onClick={() => fileRef.current?.click()}
                className="flex h-22 w-22 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-xs text-muted hover:text-foreground disabled:opacity-50">
                <ImagePlus size={20} />{uploading ? "올리는 중…" : "사진 추가"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
          </div>
          <p className="text-[11px] text-muted">JPG·PNG·WEBP, 한 장씩 자동으로 줄여 올려요. 사진 속 촬영 위치 정보는 지워져요. 하루 30장까지.</p>
        </div>

        <div className="space-y-2 rounded-md bg-panel2 p-3">
          {!editId && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={anon} disabled={notice} onChange={(e) => setAnon(e.target.checked)} />익명으로 쓰기</label>
          )}
          {showAnon && <p className="text-xs text-muted">익명 글은 작성자가 보이지 않아요. 다만 문제가 될 경우에만 운영자가 작성자를 확인할 수 있어요.</p>}
          {editId && <p className="text-xs text-muted">수정할 때는 익명 여부와 작성자 표시를 바꿀 수 없어요.</p>}
          {!editId && profile?.is_admin && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notice} disabled={anon} onChange={(e) => setNotice(e.target.checked)} />공지로 올리기(목록 맨 위 고정)</label>
          )}
          {previewCard && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>이렇게 보여요</span>
              <CommunityCardView card={previewCard} size={22} link={false} className="text-sm text-foreground" />
              {!showAnon && !editId && <Link href="/?tab=community" className="text-brand">프로필 바꾸기</Link>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>취소</Button>
          <Button disabled={busy || uploading || banned} onClick={submit}>{editId ? "수정 완료" : "올리기"}</Button>
        </div>
      </div>
    </div>
  );
}
