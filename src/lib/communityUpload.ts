// 커뮤니티 사진 올리기(브라우저 전용): 긴 변 2048px JPEG 로 줄여서 서버(/api/community-image?kind=…)로 한 장 보낸다.
// 서버가 위치 정보(EXIF)를 지우고 1280px webp + 썸네일을 만들어 {id, path, thumb, w, h} 를 돌려준다.
// kind: post(게시판) | market(장터) | dm(1:1 채팅) — 종류마다 하루 한도가 다르다(게시판 30·장터 40·채팅 30장).
import { callApi } from "./adminApi";
import type { BoardImage } from "./community";

export const MAX_PICK_MB = 20; // 고를 수 있는 원본 최대 용량(줄여서 보내므로 넉넉히)

/** 사진을 긴 변 2048px 이하 JPEG 로 줄인다(서버 요청 한도 4.5MB 안쪽으로). 이미 작으면 그대로 */
export async function shrinkImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file; // 브라우저가 못 읽는 형식이면 서버가 판단하게 그대로 보낸다
  const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 3.5 * 1024 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.9));
}

/** 사진 한 장 올리기. 성공하면 사진 정보, 실패하면 { error } */
export async function uploadCommunityImage(file: File, kind: "post" | "market" | "dm"): Promise<BoardImage | { error: string }> {
  if (file.size > MAX_PICK_MB * 1024 * 1024) return { error: `${MAX_PICK_MB}MB 이하 사진만 올릴 수 있어요` };
  const fd = new FormData();
  fd.append("file", new File([await shrinkImage(file)], "photo.jpg", { type: "image/jpeg" }));
  const r = await callApi(`/api/community-image?kind=${kind}`, { method: "POST", body: fd });
  if (!r.ok) return { error: r.message ?? "사진을 올리지 못했어요" };
  return { id: r.id as number, path: r.path as string, thumb: r.thumb as string, w: (r.w as number) ?? null, h: (r.h as number) ?? null };
}
