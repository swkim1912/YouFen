"use client";
// 프로필 사진 편집기: 사진을 끌어 위치를 옮기고, 슬라이더로 확대·좌우·상하를 조정한 뒤 512×512 정사각 사진으로 저장한다.
// - 점선 원 = 작은 프로필(원형)에 보이는 범위. 시즌 카드 등에는 정사각형 전체가 쓰인다.
// - '전체 보기' = 사진 전체가 보이게 축소(남는 곳은 검은색), '꽉 채우기' = 정사각형을 빈틈없이 채움(기본), '초기화' = 꽉 채우기+가운데.
// - 결과는 확인(저장) 전까지 서버로 올라가지 않는다. 올라간 뒤 서버가 다시 검사·재인코딩한다(/api/avatar).
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";

const PREVIEW = 320; // 미리보기 한 변(css px)
const OUT = 512; // 저장 크기(px)
const MAX_ZOOM = 4;

export function AvatarEditor({
  file, busy, onCancel, onSave,
}: {
  file: File | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = 꽉 채우기(cover). 전체 보기는 1보다 작다
  const [ox, setOx] = useState(0); // 가운데 기준 이동량 (미리보기 한 변에 대한 비율)
  const [oy, setOy] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // 파일 → 비트맵 (EXIF 방향 반영)
  useEffect(() => {
    setBmp(null);
    setError(null);
    setZoom(1);
    setOx(0);
    setOy(0);
    if (!file) return;
    let live = true;
    createImageBitmap(file, { imageOrientation: "from-image" })
      .then((b) => (live ? setBmp(b) : b.close()))
      .catch(() => live && setError("이미지를 읽을 수 없어요. JPG, PNG, WEBP 사진을 골라 주세요"));
    return () => { live = false; };
  }, [file]);
  useEffect(() => () => bmp?.close(), [bmp]);

  // 전체 보기 배율(= contain/cover). 이보다 더 줄일 수 없다
  const minZoom = bmp ? Math.min(bmp.width, bmp.height) / Math.max(bmp.width, bmp.height) : 1;
  // 이동 한계: 그려진 사진이 정사각형보다 큰 만큼만 움직일 수 있다 (비율)
  const limits = useCallback(
    (z: number) => {
      if (!bmp) return { lx: 0, ly: 0 };
      const cover = Math.max(1 / bmp.width, 1 / bmp.height); // size=1 기준 cover 배율
      const w = bmp.width * cover * z, h = bmp.height * cover * z;
      return { lx: Math.max(0, (w - 1) / 2), ly: Math.max(0, (h - 1) / 2) };
    },
    [bmp]
  );
  const clamp = (v: number, l: number) => Math.max(-l, Math.min(l, v));

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, size: number) => {
      if (!bmp) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);
      const cover = Math.max(size / bmp.width, size / bmp.height);
      const w = bmp.width * cover * zoom, h = bmp.height * cover * zoom;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, (size - w) / 2 + ox * size, (size - h) / 2 + oy * size, w, h);
    },
    [bmp, zoom, ox, oy]
  );

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = PREVIEW * dpr;
    c.height = PREVIEW * dpr;
    const ctx = c.getContext("2d");
    if (ctx) draw(ctx, PREVIEW * dpr);
  }, [draw, bmp]);

  const setZoomSafe = (z: number) => {
    const nz = Math.max(minZoom, Math.min(MAX_ZOOM, z));
    const { lx, ly } = limits(nz);
    setZoom(nz);
    setOx((v) => clamp(v, lx));
    setOy((v) => clamp(v, ly));
  };

  const { lx, ly } = limits(zoom);
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox, oy };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setOx(clamp(d.ox + (e.clientX - d.x) / PREVIEW, lx));
    setOy(clamp(d.oy + (e.clientY - d.y) / PREVIEW, ly));
  };
  const onUp = () => { drag.current = null; };

  const save = () => {
    if (!bmp) return;
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    draw(ctx, OUT);
    c.toBlob((b) => b && onSave(b), "image/png");
  };

  const small = bmp && (bmp.width < OUT || bmp.height < OUT);

  return (
    <Modal open={!!file} onClose={busy ? () => {} : onCancel} title="프로필 사진 크기·위치 조정">
      <div className="space-y-3">
        <p className="text-sm text-muted">사진을 끌어 위치를 옮기거나 아래 조절 막대를 사용하세요. 확인하기 전에는 업로드되지 않습니다.</p>
        {error ? (
          <p className="rounded-md border border-loss/50 bg-loss/10 p-3 text-sm text-loss">{error}</p>
        ) : (
          <>
            <div className="mx-auto overflow-hidden rounded-2xl border border-line bg-black" style={{ width: PREVIEW, height: PREVIEW, maxWidth: "100%" }}>
              <div className="relative touch-none select-none" style={{ width: PREVIEW, height: PREVIEW }}>
                <canvas ref={canvasRef} style={{ width: PREVIEW, height: PREVIEW, cursor: "grab" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
                {/* 작은 프로필(원)에 보이는 범위 */}
                <svg className="pointer-events-none absolute inset-0" width={PREVIEW} height={PREVIEW} aria-hidden>
                  <circle cx={PREVIEW / 2} cy={PREVIEW / 2} r={PREVIEW / 2 - 2} fill="none" stroke="#c6f432" strokeWidth="2" strokeDasharray="6 5" />
                </svg>
                {!bmp && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">불러오는 중…</div>}
              </div>
            </div>
            <p className="text-xs text-muted">점선 원 안이 작은 프로필에 보이는 범위입니다. 시즌 카드에는 정사각형 사진이 사용됩니다.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={!bmp} onClick={() => { setZoomSafe(minZoom); setOx(0); setOy(0); }}>전체 보기</Button>
              <Button type="button" size="sm" variant="outline" disabled={!bmp} onClick={() => { setZoom(1); setOx(0); setOy(0); }}>꽉 채우기</Button>
              <Button type="button" size="sm" variant="outline" disabled={!bmp} onClick={() => { setZoom(1); setOx(0); setOy(0); }}><RotateCcw size={14} className="mr-1" />초기화</Button>
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold">확대 · {Math.round(zoom * 100)}%</div>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="축소" disabled={!bmp} onClick={() => setZoomSafe(zoom - 0.1)} className="rounded-md border border-line p-1.5 hover:bg-white/5"><Minus size={16} /></button>
                <input type="range" className="flex-1 accent-brand" min={Math.round(minZoom * 100)} max={MAX_ZOOM * 100} value={Math.round(zoom * 100)} disabled={!bmp} onChange={(e) => setZoomSafe(Number(e.target.value) / 100)} aria-label="확대" />
                <button type="button" aria-label="확대" disabled={!bmp} onClick={() => setZoomSafe(zoom + 0.1)} className="rounded-md border border-line p-1.5 hover:bg-white/5"><Plus size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm font-semibold">좌우 위치
                <input type="range" className="mt-1 w-full accent-brand" min={-100} max={100} value={lx ? Math.round((ox / lx) * 100) : 0} disabled={!bmp || !lx} onChange={(e) => setOx((Number(e.target.value) / 100) * lx)} />
              </label>
              <label className="text-sm font-semibold">상하 위치
                <input type="range" className="mt-1 w-full accent-brand" min={-100} max={100} value={ly ? Math.round((oy / ly) * 100) : 0} disabled={!bmp || !ly} onChange={(e) => setOy((Number(e.target.value) / 100) * ly)} />
              </label>
            </div>
            <p className="text-xs text-muted">
              권장 {OUT}×{OUT}px 이상 · 원본 12MB 이하 · {OUT}×{OUT}px로 저장 · JPG·PNG·WebP 권장. 얼굴이 점선 원 안에 오도록 맞춰주세요.
              {small && <span className="mt-1 block text-yellow-400">이 사진은 {OUT}px보다 작아서 흐릿하게 보일 수 있어요.</span>}
            </p>
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>취소</Button>
          <Button type="button" onClick={save} disabled={!bmp || busy}>{busy ? "올리는 중…" : "이 사진으로 저장"}</Button>
        </div>
      </div>
    </Modal>
  );
}
