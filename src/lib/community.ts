// 커뮤니티 공용: 카드(화면에 보일 얼굴) 타입, 내 커뮤니티 설정, DB 오류 코드 → 한글 문구, 시간 표시, 신고 사유·알림 종류 상수.
// 기획: docs/COMMUNITY.md, DB: supabase/community_1_foundation.sql
import { supabase } from "./supabase";

/** 커뮤니티 카드. DB 함수 private.persona_card 가 만든다.
 *  - kind 'y'(유펜 프로필): 회원 id·소속 포함 → 누르면 유펜 프로필로 갈 수 있다
 *  - kind 'c'(커뮤니티 전용 프로필): 공개 id(pid)·닉네임·사진만. 회원 id·소속은 절대 들어 있지 않다
 *  - kind 'gone': 탈퇴 회원
 *  frame/badge 는 회원이 켜 두었고 티어가 있을 때만 티어 이름이 들어 있다(등수는 없음). */
export interface CommunityCard {
  kind: "y" | "c" | "gone";
  id?: string;
  pid?: string;
  nickname: string | null;
  avatar_url?: string | null;
  club_id?: number | null;
  affiliation?: string | null;
  frame?: string | null;
  badge?: string | null;
}

/** get_my_community() 결과 */
export interface MyCommunity {
  use_separate: boolean;
  nickname: string | null;
  nickname_changed_at: string | null;
  avatar_url: string | null;
  chat_nickname: string | null;
  tier: string | null;
  card: CommunityCard;   // 지금 설정으로 보이는 얼굴
  card_c: CommunityCard; // 커뮤니티 전용 프로필로 보일 때
  card_y: CommunityCard; // 유펜 프로필로 보일 때
}

export async function fetchMyCommunity(): Promise<MyCommunity | null> {
  const { data, error } = await supabase.rpc("get_my_community");
  if (error) return null; // 화면은 '불러오지 못했어요' 를 보여 준다
  return (data as MyCommunity | null) ?? null;
}

/** 커뮤니티 닉네임 확인 결과 코드(community_name_available / 저장 오류 'community_name:<코드>') → 문구 */
export const NAME_REASON: Record<string, string> = {
  format: "2~12자 한글·영문·숫자만 쓸 수 있어요",
  youfen: "유펜 닉네임과 같은 이름은 쓸 수 없어요(내 유펜 닉네임 포함)",
  community: "이미 사용 중인 닉네임이에요",
  realname: "선수 실명과 같은 이름은 쓸 수 없어요",
  login: "로그인이 필요해요",
};

/** DB 함수가 보낸 오류(raise exception)를 화면 문구로 바꾼다. 코드가 아니면 원문(이미 한글 문구) 그대로 */
export function communityError(message: string | undefined | null): string {
  const m = message ?? "";
  const name = m.match(/community_name:(\w+)/);
  if (name) return NAME_REASON[name[1]] ?? "사용할 수 없는 닉네임이에요";
  if (m.includes("community_nick_30days")) return "커뮤니티 닉네임은 30일에 1번만 바꿀 수 있어요";
  if (m.includes("community_need_nick")) return "커뮤니티 전용 프로필을 쓰려면 먼저 닉네임을 정해 주세요";
  if (m.includes("login")) return "로그인이 필요해요";
  return m || "처리하지 못했어요";
}

/** 다음에 커뮤니티 닉네임을 바꿀 수 있는 시각(바로 가능하면 null) */
export function nextNickChange(changedAt: string | null, hasNick: boolean): Date | null {
  if (!hasNick || !changedAt) return null;
  const t = new Date(changedAt).getTime() + 30 * 24 * 3600 * 1000;
  return t > Date.now() ? new Date(t) : null;
}

/** 작성 시각 표시: 오늘이면 방금 / n분 전 / n시간 전, 올해면 10.08, 그 이전은 2025.10.08 (사용자 기기 시간 기준) */
export function timeAgo(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const two = (n: number) => String(n).padStart(2, "0");
  if (sameDay) {
    const min = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    return `${Math.floor(min / 60)}시간 전`;
  }
  if (d.getFullYear() === now.getFullYear()) return `${two(d.getMonth() + 1)}.${two(d.getDate())}`;
  return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`;
}

/** 신고 사유 (DB 제약 community_reports.reason 과 같은 목록 — 한쪽만 바꾸지 말 것) */
export const REPORT_REASONS = ["욕설·비하", "실명·개인정보 노출", "음란·선정", "광고·도배", "사기·거래 문제", "사칭", "기타"] as const;

/** 신고·차단 대상 종류. 1단계는 프로필 두 가지, 2단계부터 글·댓글·채팅·장터·1:1 채팅이 늘어난다 (DB private.resolve_target 과 같은 값) */
export type TargetKind = "cprofile" | "yprofile";

/** 카드 → 신고·차단 대상 (탈퇴 회원 등 대상이 없으면 null) */
export function cardTarget(c: CommunityCard): { kind: TargetKind; ref: string } | null {
  if (c.kind === "c" && c.pid) return { kind: "cprofile", ref: c.pid };
  if (c.kind === "y" && c.id) return { kind: "yprofile", ref: c.id };
  return null;
}

/** 회원이 켜고 끌 수 있는 알림 종류 (DB private.notify_toggleable 과 같은 목록) */
export const NOTIFY_KINDS: { key: string; label: string; desc: string }[] = [
  { key: "comment", label: "내 글에 댓글", desc: "내가 쓴 게시글에 댓글이 달리면" },
  { key: "reply", label: "내 댓글에 답글", desc: "내 댓글에 답글이 달리면" },
  { key: "like", label: "좋아요", desc: "내 글의 좋아요가 10·50·100개를 넘으면" },
  { key: "mention", label: "@멘션", desc: "채팅·댓글에서 나를 @닉네임으로 부르면" },
  { key: "dm", label: "1:1 채팅", desc: "장터 1:1 채팅에 새 메시지가 오면" },
  { key: "market", label: "장터 만료 예정", desc: "내 장터 글이 곧 자동 정리될 때" },
  { key: "openpiste", label: "오픈피스트 새 모집", desc: "관심 종목·지역의 모집이 올라오면" },
];

/** 알림 한 건 (notifications 표) */
export interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

/** 내 커뮤니티 이용 상태(my_community_status) */
export interface CommunityStatus {
  banned: boolean;
  reason?: string;
  until?: string | null;
  permanent?: boolean;
  since?: string;
}
