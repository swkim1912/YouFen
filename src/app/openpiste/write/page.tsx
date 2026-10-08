"use client";
// 오픈피스트 모집글 쓰기·수정: /openpiste/write (?edit=id)
// 항목: 운동 제목, 종목 1개, 레벨(복수), 장소, 지역, 시작 일시, 진행 시간(1~5시간, 6시간 이상), 정원, 참가비, 상세 내용, 오픈채팅 링크(선택),
//       사진 최대 3장(/api/community-image?kind=openpiste, 첫 장 = 대표 사진 — 목록에 보임, 누르면 대표로)
// - 새 글은 관리자 승인 후 게시된다(op_write → 승인 대기). 반려된 글을 고치면 다시 승인 대기.
// - 게시 중인 글을 고치면 수정안만 저장되고(op_edit → 'edit_pending') 승인 전까지 기존 내용이 그대로 보인다.
// - 주최자는 유펜 프로필로 표시된다(오프라인 모임이라 — 화면에 안내).
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { uploadCommunityImage } from "@/lib/communityUpload";
import { type BoardImage, boardImageUrl } from "@/lib/community";
import {
  OP_BODY_MAX, OP_BODY_PLACEHOLDER, OP_DURATIONS, OP_IMAGE_MAX, OP_LEVELS, OP_PLACE_MAX, OP_TITLE_MAX, OP_WEAPONS,
  type OpDetail, type OpDraft, durationText, opError, toLocalInput,
} from "@/lib/openpiste";
import { REGIONS, cn } from "@/lib/utils";

export default function WritePage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <Form />
      </Suspense>
    </AppShell>
  );
}

function Form() {
  const router = useRouter();
  const editId = Number(useSearchParams().get("edit")) || null;
  const [loaded, setLoaded] = useState(!editId);
  const [orig, setOrig] = useState<OpDetail | null>(null);
  const [title, setTitle] = useState("");
  const [weapon, setWeapon] = useState<string>("");
  const [levels, setLevels] = useState<string[]>([]);
  const [place, setPlace] = useState("");
  const [region, setRegion] = useState("");
  const [start, setStart] = useState(""); // datetime-local 값(기기 시간)
  const [duration, setDuration] = useState(2);
  const [capacity, setCapacity] = useState("8");
  const [fee, setFee] = useState("0");
  const [body, setBody] = useState("");
  const [chatUrl, setChatUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<BoardImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 새 글: 가입 때 고른 종목·지역을 기본으로 / 수정: 기존 값(승인 대기 중인 수정안이 있으면 그것)
  useEffect(() => {
    if (!editId) {
      supabase.rpc("op_status").then(({ data }) => {
        const w = (data as { weapon?: string } | null)?.weapon;
        if (w && (OP_WEAPONS as readonly string[]).includes(w)) setWeapon((cur) => cur || w);
      });
      return;
    }
    supabase.rpc("op_get", { p_id: editId }).then(({ data, error }) => {
      if (error) { toast.error(opError(error.message)); return router.replace("/openpiste"); }
      const p = data as OpDetail;
      if (!p.is_mine) { toast.error("내가 연 모집만 고칠 수 있어요"); return router.replace(`/openpiste/${editId}`); }
      const v: OpDraft = p.pending_edit ?? { ...p, chat_url: p.chat_url };
      setOrig(p);
      setTitle(v.title); setWeapon(v.weapon); setLevels(v.levels); setPlace(v.place); setRegion(v.region);
      setStart(toLocalInput(v.starts_at)); setDuration(v.duration_h); setCapacity(String(v.capacity)); setFee(String(v.fee));
      setBody(v.body); setChatUrl(v.chat_url ?? "");
      setImages(p.pending_edit ? p.pending_images ?? [] : p.images);
      setLoaded(true);
    });
  }, [editId, router]);

  /** 사진 고르기 → 한 장씩 서버로 올려 목록에 붙인다(최대 3장) */
  const pick = async (fileList: FileList | null) => {
    // 고른 파일을 먼저 배열로 복사한다. FileList 는 입력칸과 연결돼 있어 value 를 비우면 목록도 같이 비어 버린다
    const files = Array.from(fileList ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    const room = OP_IMAGE_MAX - images.length;
    if (files.length > room) toast.error(`사진은 ${OP_IMAGE_MAX}장까지 올릴 수 있어요`);
    setUploading(true);
    for (const file of files.slice(0, Math.max(room, 0))) {
      const r = await uploadCommunityImage(file, "openpiste");
      if ("error" in r) { toast.error(r.error); break; }
      setImages((cur) => [...cur, r]);
    }
    setUploading(false);
  };
  const makeFirst = (i: number) => setImages((cur) => [cur[i], ...cur.filter((_, j) => j !== i)]);

  const toggleLevel = (l: string) => setLevels((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  const submit = async () => {
    if (!weapon) return toast.error("종목을 골라 주세요");
    if (!levels.length) return toast.error("레벨을 하나 이상 골라 주세요");
    if (!region) return toast.error("지역을 골라 주세요");
    if (!start) return toast.error("시작 일시를 정해 주세요");
    const startsAt = new Date(start); // datetime-local 은 기기 시간 → ISO(UTC)로 바꿔 보낸다
    if (Number.isNaN(startsAt.getTime())) return toast.error("시작 일시를 다시 확인해 주세요");
    const data = {
      title: title.trim(), weapon, levels: OP_LEVELS.filter((l) => levels.includes(l)), place: place.trim(), region,
      starts_at: startsAt.toISOString(), duration_h: duration, capacity: Number(capacity), fee: Number(fee || 0),
      body: body.trim(), chat_url: chatUrl.trim() || null,
    };
    const ups = images.map((i) => i.id); // 첫 장 = 대표
    setBusy(true);
    if (editId) {
      const { data: r, error } = await supabase.rpc("op_edit", { p_id: editId, p_data: data, p_uploads: ups });
      setBusy(false);
      if (error) return toast.error(opError(error.message));
      toast.success(r === "edit_pending" ? "수정 승인 요청을 보냈어요. 승인 전까지 기존 내용이 보여요" : "고쳤어요. 관리자 승인을 기다려 주세요");
      router.push(`/openpiste/${editId}`);
    } else {
      const { data: id, error } = await supabase.rpc("op_write", { p_data: data, p_uploads: ups });
      setBusy(false);
      if (error) return toast.error(opError(error.message));
      toast.success("승인 요청을 보냈어요. 관리자가 확인하면 게시돼요");
      router.push(`/openpiste/${id}`);
    }
  };

  if (!loaded) return <p className="py-16 text-center text-muted">불러오는 중…</p>;
  const live = orig && (orig.status === "open" || orig.status === "closed");
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1 text-sm", on ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-foreground");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={editId ? `/openpiste/${editId}` : "/openpiste"} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} />돌아가기</Link>
      <h1 className="text-lg font-bold">{editId ? "모집글 고치기" : "오픈피스트 모집하기"}</h1>
      <div className="space-y-1 rounded-md border border-line bg-panel2 px-3 py-2 text-xs text-muted">
        <p>· 모집글은 관리자 확인 후 게시돼요.{live && " 게시 중인 글을 고치면 승인 전까지 기존 내용이 그대로 보여요."}</p>
        <p>· 오프라인 모임이라 주최자와 참가자는 <b className="text-foreground">유펜 프로필</b>(닉네임·사진)로 보여요.</p>
        <p>· 연락처는 오픈채팅 링크나 참가자 방을 이용해 주세요. 오픈채팅 링크는 참가 신청한 회원에게만 보여요.</p>
      </div>

      <div className="space-y-4 rounded-lg border border-line bg-panel p-4">
        <div>
          <Label>운동 제목</Label>
          <Input value={title} maxLength={OP_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="예: 토요일 오후 에페 오픈게임" />
        </div>
        <div>
          <Label>종목</Label>
          <div className="flex flex-wrap gap-1.5">
            {OP_WEAPONS.map((w) => <button key={w} type="button" className={chip(weapon === w)} onClick={() => setWeapon(w)}>{w}</button>)}
          </div>
        </div>
        <div>
          <Label>레벨 (여러 개 고를 수 있어요)</Label>
          <div className="flex flex-wrap gap-1.5">
            {OP_LEVELS.map((l) => <button key={l} type="button" className={chip(levels.includes(l))} onClick={() => toggleLevel(l)}>{l}</button>)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <div>
            <Label>지역</Label>
            <Select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">선택</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <Label>장소</Label>
            <Input value={place} maxLength={OP_PLACE_MAX} onChange={(e) => setPlace(e.target.value)} placeholder="예: ○○펜싱클럽 (○○구)" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>시작 일시</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>진행 시간</Label>
            <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {OP_DURATIONS.map((h) => <option key={h} value={h}>{durationText(h)}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>정원 (주최자 제외)</Label>
            <Input type="number" min={1} max={100} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
          <div>
            <Label>참가비 (원, 0 = 무료)</Label>
            <Input type="number" min={0} max={1000000} step={1000} value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>상세 내용</Label>
          <Textarea value={body} maxLength={OP_BODY_MAX} rows={6} onChange={(e) => setBody(e.target.value)} placeholder={OP_BODY_PLACEHOLDER} />
          <p className="mt-1 text-right text-[11px] text-muted">{body.length}/{OP_BODY_MAX}</p>
        </div>
        <div className="space-y-1.5">
          <Label>사진 ({images.length}/{OP_IMAGE_MAX}) — 첫 장이 목록에 보이는 대표 사진이에요. 누르면 대표로 바뀌어요</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={img.id} className="relative">
                <button type="button" onClick={() => makeFirst(i)} className={cn("block h-20 w-20 overflow-hidden rounded-md border", i === 0 ? "border-brand" : "border-line")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={boardImageUrl(img.thumb)} alt="" className="h-full w-full object-cover" />
                </button>
                {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-brand px-1 text-[10px] font-semibold text-brand-ink">대표</span>}
                <button type="button" aria-label="사진 빼기" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-panel p-0.5 text-muted shadow hover:text-loss"><X size={14} /></button>
              </div>
            ))}
            {images.length < OP_IMAGE_MAX && (
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-xs text-muted hover:text-foreground disabled:opacity-50">
                <ImagePlus size={18} />{uploading ? "올리는 중" : "사진 추가"}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
          <p className="text-[11px] text-muted">체육관·장소 사진 등. 촬영 위치 정보는 지우고 저장해요.</p>
        </div>
        <div>
          <Label>오픈채팅방 링크 (선택)</Label>
          <Input value={chatUrl} maxLength={200} onChange={(e) => setChatUrl(e.target.value)} placeholder="https://open.kakao.com/o/…" />
          <p className="mt-1 text-[11px] text-muted">카카오톡 오픈채팅 주소만 쓸 수 있어요.</p>
        </div>
        <Button className="w-full" disabled={busy || uploading} onClick={submit}>{editId ? (live ? "수정 승인 요청" : "고쳐서 승인 요청") : "승인 요청하기"}</Button>
      </div>
    </div>
  );
}
