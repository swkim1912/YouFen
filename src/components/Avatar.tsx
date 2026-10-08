"use client";
// 프로필 사진. profiles.avatar_url 규칙:
//   'default:1' → 기본 프로필(카톡 기본 프사 느낌의 사람 실루엣, 한 가지)
//   'https://…' → 직접 올린 사진(서버 검열 통과분)
//   null        → 소속팀 이미지(clubs.image_url) → 없으면 소속팀 이름 첫 글자 → 무소속이면 닉네임 첫 글자
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** 기본 프로필은 한 가지(회색 배경에 흰 사람 실루엣). 값은 'default:1' 로 저장하고, 예전 'default:N' 값도 같은 모양으로 그린다. */
export const DEFAULT_AVATAR_BG = "#a9aeb9";

export function DefaultAvatar({ size }: { size: number }) {
  const bg = DEFAULT_AVATAR_BG;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" fill={bg} />
      <circle cx="32" cy="26" r="11" fill="#ffffff" fillOpacity="0.92" />
      <path d="M10 64c0-14 10-22 22-22s22 8 22 22z" fill="#ffffff" fillOpacity="0.92" />
    </svg>
  );
}

// 클럽 이미지 조회 캐시 (같은 클럽을 여러 번 묻지 않는다)
const clubImgCache = new Map<number, string | null>();

export function Avatar({
  avatarUrl, clubId, affiliation, nickname, size = 80, className,
}: {
  avatarUrl: string | null;
  clubId: number | null;
  affiliation: string | null;
  nickname: string | null;
  size?: number;
  className?: string;
}) {
  const [clubImg, setClubImg] = useState<string | null>(clubId != null ? clubImgCache.get(clubId) ?? null : null);

  useEffect(() => {
    if (avatarUrl || clubId == null) return;
    if (clubImgCache.has(clubId)) return setClubImg(clubImgCache.get(clubId) ?? null);
    let live = true;
    supabase.from("clubs").select("image_url").eq("id", clubId).maybeSingle().then(({ data }) => {
      clubImgCache.set(clubId, data?.image_url ?? null);
      if (live) setClubImg(data?.image_url ?? null);
    });
    return () => { live = false; };
  }, [avatarUrl, clubId]);

  const d = avatarUrl?.match(/^default:(\d+)$/);
  const photo = avatarUrl && /^https?:/.test(avatarUrl) ? avatarUrl : !avatarUrl ? clubImg : null;
  const letter = (affiliation && affiliation !== "무소속" ? affiliation : nickname ?? "?").trim()[0];

  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel2 font-bold", className)} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {d ? (
        <DefaultAvatar size={size} />
      ) : photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={photo} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        letter
      )}
    </div>
  );
}
