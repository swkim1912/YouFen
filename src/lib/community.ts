// 커뮤니티 공용: 카드(화면에 보일 얼굴) 타입, 내 커뮤니티 설정, DB 오류 코드 → 한글 문구, 시간 표시, 신고 사유·알림 종류 상수.
// 기획: docs/COMMUNITY.md, DB: supabase/community_1_foundation.sql
import { supabase } from "./supabase";

/** 커뮤니티 카드. DB 함수 private.persona_card 가 만든다.
 *  - kind 'y'(유펜 프로필): 회원 id·소속 포함 → 누르면 유펜 프로필로 갈 수 있다
 *  - kind 'c'(커뮤니티 전용 프로필): 공개 id(pid)·닉네임·사진만. 회원 id·소속은 절대 들어 있지 않다
 *  - kind 'a': 익명(nickname 은 '익명'·'익명1'·'글쓴이' 같은 이름표뿐 — 누구인지 정보 없음)
 *  - kind 'gone': 탈퇴 회원
 *  frame/badge 는 회원이 켜 두었고 티어가 있을 때만 티어 이름이 들어 있다(등수는 없음). */
export interface CommunityCard {
  kind: "y" | "c" | "a" | "gone";
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

/** 게시판 DB 함수(board_*)의 오류 코드 → 문구 (supabase/community_2_board.sql) */
const ERROR_TEXT: Record<string, string> = {
  community_banned: "커뮤니티 이용이 제한되어 있어요. 마이 펜싱 > 커뮤니티 설정에서 사유와 기간을 확인할 수 있어요",
  rate_post_min: "글은 1분에 1개까지 쓸 수 있어요. 잠시 후 다시 시도해 주세요",
  rate_post_day: "글은 하루 30개까지 쓸 수 있어요",
  rate_comment_sec: "댓글은 10초에 1개까지 쓸 수 있어요",
  rate_comment_day: "댓글은 하루 200개까지 쓸 수 있어요",
  bad_tags: "말머리를 다시 골라 주세요",
  notice_admin: "공지는 관리자만, 익명이 아닌 이름으로 쓸 수 있어요",
  uploads_invalid: "사진 정보가 맞지 않아요. 사진을 다시 올려 주세요",
  own_like: "내 글에는 좋아요를 누를 수 없어요",
  not_mine: "내가 쓴 글만 고칠 수 있어요",
  not_found: "글이 없거나 볼 수 없는 글이에요",
  market_not_eligible: "장터는 선수를 연결한 회원(학부모·지도자 포함)만 이용할 수 있어요. 마이 펜싱 > 상세정보에서 선수를 연결해 주세요",
  rate_market_day: "장터 글은 하루 20개까지 쓸 수 있어요",
  extend_limit: "연장은 2번까지 할 수 있어요",
  extend_early: "만료 7일 전(구매 글은 3일 전)부터 연장할 수 있어요",
  dm_own: "내 글에는 채팅을 시작할 수 없어요",
  dm_blocked: "차단 중인 회원과는 채팅할 수 없어요",
  dm_gone: "상대가 탈퇴해서 메시지를 보낼 수 없어요",
  rate_dm_start: "새 채팅은 하루 30개까지 시작할 수 있어요",
  rate_dm: "메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요",
  chat_need_agree: "자유톡방 이용 규칙에 동의해야 메시지를 보낼 수 있어요",
  chat_need_nick: "자유톡방 익명 닉네임을 먼저 정해 주세요",
  chat_nick_wait: "익명 닉네임은 10분에 한 번 바꿀 수 있어요",
  rate_chat_fast: "메시지를 너무 빨리 보내고 있어요(1분에 20개까지). 잠시 후 다시 보내 주세요",
  rate_chat_day: "자유톡방 메시지는 하루 1,000개까지 보낼 수 있어요",
  rate_chat_same: "같은 내용을 연달아 보낼 수 없어요",
  "bad_input:price": "가격을 다시 확인해 주세요(구매 글은 최소 ≤ 최대, 또는 '가격 협의')",
  "bad_input:title": "물품명을 1~60자로 적어 주세요",
  "bad_input:body": "내용을 확인해 주세요",
  bad_input: "입력값을 다시 확인해 주세요",
};

/** DB 함수가 보낸 오류(raise exception)를 화면 문구로 바꾼다. 코드가 아니면 원문(이미 한글 문구) 그대로 */
export function communityError(message: string | undefined | null): string {
  const m = message ?? "";
  const name = m.match(/community_name:(\w+)/);
  if (name) return NAME_REASON[name[1]] ?? "사용할 수 없는 닉네임이에요";
  if (m.includes("community_nick_30days")) return "커뮤니티 닉네임은 30일에 1번만 바꿀 수 있어요";
  if (m.includes("community_need_nick")) return "커뮤니티 전용 프로필을 쓰려면 먼저 닉네임을 정해 주세요";
  for (const [code, text] of Object.entries(ERROR_TEXT)) if (m.includes(code)) return text;
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
  { key: "mention", label: "@멘션", desc: "자유톡방·댓글에서 나를 @닉네임으로 부르면" },
  { key: "dm", label: "1:1 채팅", desc: "장터 1:1 채팅에 새 메시지가 오면" },
  { key: "market", label: "장터 만료 예정", desc: "내 장터 글이 곧 자동 정리될 때" },
  { key: "openpiste", label: "오픈피스트", desc: "관심 종목·지역의 새 모집, 내 모집의 참가 신청·취소" },
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

// ───────────────────────── 게시판 (2단계) ─────────────────────────

/** 말머리 (DB 제약 community_posts.tags 와 같은 목록 — 한쪽만 바꾸지 말 것). 기본값은 '자유' */
export const BOARD_TAGS = ["자유", "대회", "장비", "기술", "에페", "플뢰레", "사브르", "학부모"] as const;
export const TITLE_MAX = 60;
export const BODY_MAX = 5000;
export const COMMENT_MAX = 1000;
export const IMAGE_MAX = 3;

/** 게시판 사진 공개 주소 (버킷 community — 읽기 공개) */
export function boardImageUrl(path: string): string {
  return supabase.storage.from("community").getPublicUrl(path).data.publicUrl;
}

/** 목록 한 줄 (board_list) */
export interface BoardItem {
  id: number;
  tags: string[];
  title: string;
  created_at: string;
  edited: boolean;
  like_count: number;
  comment_count: number;
  view_count: number;
  image_count: number;
  thumb: string | null;
  is_notice: boolean;
  status: "active" | "hidden";
  card: CommunityCard;
}

export interface BoardImage { id: number; path: string; thumb: string; w: number | null; h: number | null }

/** 댓글 (board_post.comments). status 가 active 가 아니면 body·card 는 비어 있다 */
export interface BoardComment {
  id: number;
  parent_id: number | null;
  created_at: string;
  edited: boolean;
  status: "active" | "hidden" | "deleted" | "blocked";
  body: string | null;
  is_mine: boolean;
  is_op: boolean; // 글쓴이(글과 같은 얼굴로 쓴 작성자 본인)
  card: CommunityCard | null;
}

/** 글 상세 (board_post). 차단한 회원의 글이면 { id, blocked: true } 만 온다 */
export interface BoardPost {
  id: number;
  blocked?: boolean;
  tags: string[];
  title: string;
  body: string;
  images: BoardImage[];
  created_at: string;
  edited: boolean;
  like_count: number;
  comment_count: number;
  view_count: number;
  is_notice: boolean;
  status: "active" | "hidden";
  anonymous: boolean;
  liked: boolean;
  is_mine: boolean;
  is_admin: boolean;
  card: CommunityCard;
  comments: BoardComment[];
}

/** 글·댓글 본문에 전화번호처럼 보이는 것이 있는지(연락처 노출 경고용) */
export function hasPhoneNumber(text: string): boolean {
  return /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/.test(text);
}

// ───────────────────────── 장터·1:1 채팅 (3단계) ─────────────────────────

/** 장터 값 목록 (DB 제약 market_listings 와 같은 값 — 한쪽만 바꾸지 말 것) */
export const MARKET_CATEGORIES = ["검·부품", "마스크", "도복", "장갑", "신발", "가방", "바디코드·전자장비", "기타"] as const;
export const MARKET_WEAPONS = ["에페", "플뢰레", "사브르", "공용"] as const;
export const USAGE_PERIODS = ["미사용", "1개월 이하", "1~6개월", "6~12개월", "1~2년", "2년 이상"] as const;
export const SELL_CONDITIONS = ["새상품", "거의 새것", "사용감 적음", "사용감 많음", "수리 필요"] as const;
export const BUY_CONDITIONS = ["새것", "사용감 적음", "상관없음"] as const;
export const HANDS = ["오른손", "왼손", "양손"] as const;
export const SELL_TRADES = ["판매중", "예약중", "거래완료"] as const;
export const BUY_TRADES = ["구하는 중", "구했어요"] as const;
export const MARKET_IMAGE_MAX = { sell: 10, buy: 1 } as const;

/** 카테고리에 따라 '손'·'사이즈' 입력이 필요한지 (검 그립·장갑·도복은 손 방향, 마스크·도복·장갑·신발은 사이즈) */
export const needsHand = (c: string) => c === "검·부품" || c === "장갑" || c === "도복";
export const needsSize = (c: string) => c === "마스크" || c === "도복" || c === "장갑" || c === "신발";

/** 장터 상단 고정 안내(면책) */
export const MARKET_DISCLAIMER =
  "유펜은 거래 당사자가 아니며, 상품과 거래에 대한 책임은 판매자에게 있습니다. 선입금 요구에 주의하고, 마스크 인증(800N/1600N) 등 장비의 안전 상태는 직접 확인하세요.";

/** 가격 표시: 판매 0원 = 나눔, 구매 = 희망 가격대 또는 가격 협의 */
export function priceText(l: { kind: "sell" | "buy"; price: number | null; price_min: number | null; price_max: number | null; price_nego: boolean }): string {
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  if (l.kind === "sell") return l.price === 0 ? "나눔" : l.price != null ? won(l.price) : "-";
  if (l.price_nego) return "가격 협의";
  if (l.price_min != null && l.price_max != null) return l.price_min === l.price_max ? `희망 ${won(l.price_min)}` : `희망 ${l.price_min.toLocaleString("ko-KR")}~${won(l.price_max)}`;
  return "-";
}

/** 장터 글 요약(market_list 한 줄, market_get 의 바탕) */
export interface MarketItem {
  id: number;
  kind: "sell" | "buy";
  title: string;
  category: string;
  weapon: string | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  price_nego: boolean;
  usage_period: string | null;
  condition: string | null;
  hand: string | null;
  size: string | null;
  regions: string | null;
  delivery: boolean;
  trade_status: string;
  status: "active" | "hidden" | "expired";
  thumb: string | null;
  image_count: number;
  created_at: string;
  edited: boolean;
  expires_at: string;
  extend_count: number;
  view_count: number;
  is_mine: boolean;
  card: CommunityCard;
}

/** 장터 글 상세(market_get). 차단한 회원의 글이면 { id, blocked: true } 만 온다 */
export interface MarketDetail extends MarketItem {
  blocked?: boolean;
  body: string;
  images: BoardImage[];
  is_admin: boolean;
  eligible: boolean;   // 내가 장터를 쓸 수 있는지(선수 연결)
  my_thread: number | null; // 이 글로 이미 시작한 내 1:1 채팅
}

/** 1:1 채팅 목록 한 줄(dm_list) */
export interface DmThreadItem {
  id: number;
  listing_id: number | null;
  listing_title: string;
  listing_thumb: string | null;
  listing_kind: "sell" | "buy" | null;
  trade_status: string | null;
  last_message_at: string;
  i_am_seller: boolean;
  other: CommunityCard;
  last: { body: string; image: boolean; mine: boolean } | null;
  unread: boolean;
}

export interface DmMessage { id: number; mine: boolean; body: string | null; image: BoardImage | null; status: string; created_at: string }

/** 대화방(dm_thread) */
export interface DmThread {
  id: number;
  listing_id: number | null;
  listing_title: string;
  i_am_seller: boolean;
  other: CommunityCard;
  blocked: boolean;
  other_left: boolean;
  other_read_at: string | null;
  listing: { status: string; trade_status: string; kind: "sell" | "buy"; thumb: string | null; price: number | null; price_min: number | null; price_max: number | null; price_nego: boolean } | null;
  messages: DmMessage[];
}

// ───────────────────────── 자유톡방(단체 채팅, 4단계) ─────────────────────────

/** 자유톡방 이용 규칙(docs/COMMUNITY.md 4장). 처음 들어올 때와 얼굴을 바꾼 뒤 동의한다 */
export const CHAT_RULES = [
  "펜싱 및 펜싱 정보와 관련된 이야기는 항상 환영입니다",
  "반말 금지 (서로 아는 분들이어도 단톡방인 만큼 존칭 사용 부탁드립니다.)",
  "다른 사람에게 불쾌함을 줄 수 있는 언어 사용 금지 (욕설 등)",
  "실명 언급 금지 (유명인을 제외한 동호인과 같은 일반인의 실명)",
  "비난 및 지나친 비판 금지",
  "익명일지라도 타인의 신상에 대한 이야기 자제",
  "펜싱과 거리가 먼 사담 자제",
] as const;
export const CHAT_MAX = 1000;

/** 내 자유톡방 상태(chat_me). persona: y = 유펜 프로필, c = 커뮤니티 전용 프로필, n = 자유톡방 익명 닉네임 */
export interface ChatMe {
  persona: "y" | "c" | "n";
  use_nickname: boolean;
  chat_nickname: string | null;
  agreed: boolean;        // 지금 얼굴로 이용 규칙에 동의했는지(얼굴을 바꾸면 false)
  ever_agreed: boolean;   // 한 번이라도 들어온 적 있는지
  card: CommunityCard;    // 지금 톡방에서 보이는 얼굴
  profile_card: CommunityCard; // '커뮤니티 프로필'을 고르면 보일 얼굴(커뮤니티 설정 그대로)
  need_nick: boolean;     // '커뮤니티 프로필' 쪽이 닉네임 없는 전용 프로필 → 그 얼굴로는 보낼 수 없음(익명 닉네임은 가능)
  banned: boolean;
  ban_until: string | null;
  ban_permanent: boolean;
  is_admin: boolean;
}

/** 자유톡방 메시지(chat_feed). 보낸 사람 id 는 없고 '내 것인지'와 카드만 온다.
 *  status: active | hidden(신고로 가려짐 — 내용은 보낸 사람·관리자만) | deleted(by_admin 이면 관리자 삭제) */
export interface ChatMessage {
  id: number;
  mine: boolean;
  created_at: string;
  status: "active" | "hidden" | "deleted";
  by_admin: boolean;
  body: string | null;
  image: BoardImage | null;
  card: CommunityCard;
}
