"use client";
// 커뮤니티 카드 한 줄: [사진(티어 테두리)] 닉네임 [티어 뱃지]
// - 유펜 프로필 카드(kind 'y')는 사진이 없으면 소속팀 이미지로, 누르면 유펜 프로필(닉네임 검색)로 간다.
// - 커뮤니티 전용 카드(kind 'c')는 소속을 쓰지 않고(사진 없으면 닉네임 첫 글자), 눌러도 어디로도 가지 않는다(실명 노출 방지).
// - 익명 카드(kind 'a')·탈퇴 회원(kind 'gone')은 기본 실루엣 사진과 이름표만 보여 준다.
// - 등수는 표시하지 않는다. 티어 테두리·뱃지는 회원이 켜 둔 경우에만 DB 가 티어 이름을 넣어 준다.
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { TierEmblem } from "@/components/TierBadge";
import { tierColor } from "@/lib/fencing";
import type { CommunityCard } from "@/lib/community";
import { cn } from "@/lib/utils";

export function CommunityCardView({ card, size = 32, link = true, className, extra }: {
  card: CommunityCard;
  size?: number;
  link?: boolean;        // false 면 유펜 카드여도 링크를 걸지 않는다(미리보기 등)
  className?: string;
  extra?: React.ReactNode; // 닉네임 옆에 붙일 작은 표시(예: '글쓴이')
}) {
  const youfen = card.kind === "y";
  const body = (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <span
        className="shrink-0 rounded-full"
        // 티어 테두리: 티어 색 두께 2px 고리(카드가 작아 TierFrame 장식 대신 고리로 표시)
        style={card.frame ? { boxShadow: `0 0 0 2px ${tierColor(card.frame)}` } : undefined}
      >
        <Avatar
          avatarUrl={card.kind === "a" || card.kind === "gone" ? "default:1" : card.avatar_url ?? null}
          clubId={youfen ? card.club_id ?? null : null}
          affiliation={youfen ? card.affiliation ?? null : null}
          nickname={card.nickname}
          size={size}
        />
      </span>
      <span className="truncate font-semibold">{card.nickname ?? "회원"}</span>
      {card.badge && <TierEmblem tier={card.badge} size={Math.max(16, Math.round(size * 0.6))} className="shrink-0" />}
      {extra}
    </span>
  );
  if (link && youfen && card.nickname) {
    return <Link href={`/search?q=${encodeURIComponent(card.nickname)}`} className="min-w-0 hover:opacity-90">{body}</Link>;
  }
  return body;
}
