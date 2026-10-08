// 오픈피스트 공용: 값 목록, 화면 타입, 표시 도우미, DB 오류 코드 → 한글 문구.
// 기획: docs/COMMUNITY.md 5장, DB: supabase/community_5_openpiste.sql (op_* RPC)
import type { BoardImage, CommunityCard } from "./community";
import { communityError } from "./community";

/** 값 목록 (DB 제약 openpiste_posts 와 같은 값 — 한쪽만 바꾸지 말 것) */
export const OP_WEAPONS = ["에페", "플뢰레", "사브르"] as const;
export const OP_LEVELS = ["입문", "초급", "중급", "상급"] as const;
export const OP_DURATIONS = [1, 2, 3, 4, 5, 6] as const; // 6 = '6시간 이상'
export const OP_TITLE_MAX = 50;
export const OP_PLACE_MAX = 60;
export const OP_BODY_MAX = 2000;
export const OP_BODY_PLACEHOLDER = "장비 대여 여부, 취소 규칙 등을 적어주세요";
export const OP_IMAGE_MAX = 3; // 사진(첫 장 = 대표 — 목록에 보임). DB 제약 openpiste_posts.images 와 같은 값

/** 상태: pending(승인 대기) open(모집 중) rejected(반려) closed(모집 마감) cancelled(취소) ended(종료) hidden(신고로 가려짐) */
export type OpStatus = "pending" | "open" | "rejected" | "closed" | "cancelled" | "ended" | "hidden";

/** 목록 한 줄(op_list). phase: upcoming(시작 전) live(진행 중) over(끝남) */
export interface OpItem {
  id: number;
  title: string;
  weapon: string;
  levels: string[];
  place: string;
  region: string;
  starts_at: string;
  duration_h: number;
  ends_at: string;
  capacity: number;
  fee: number;
  count: number;
  status: OpStatus;
  phase: "upcoming" | "live" | "over";
  created_at: string;
  is_mine: boolean;
  joined: boolean;
  has_pending_edit: boolean;
  thumb: string | null;  // 대표 사진(첫 장) 썸네일
  image_count: number;
  host: CommunityCard; // 주최자 유펜 프로필
}

/** 수정안·입력값(op_write/op_edit 에 넘기는 값과 같은 모양) */
export interface OpDraft {
  title: string;
  weapon: string;
  levels: string[];
  place: string;
  region: string;
  starts_at: string; // ISO
  duration_h: number;
  capacity: number;
  fee: number;
  body: string;
  chat_url: string | null;
}

/** 상세(op_get). 차단한 주최자의 글이면 { id, blocked: true } 만 온다 */
export interface OpDetail extends OpItem {
  blocked?: boolean;
  body: string;
  images: BoardImage[];      // 첫 장 = 대표
  chat_url: string | null;   // 주최자·참가자에게만
  has_chat_url: boolean;
  pending_edit: (OpDraft & { uploads?: number[] }) | null; // 주최자·관리자에게만
  pending_images: BoardImage[] | null; // 수정안의 사진(주최자·관리자에게만)
  status_reason: string | null;
  edited: boolean;
  is_admin: boolean;
  can_report: boolean;
  host_blocked_me: boolean;
}

/** 참가자 방(op_room) */
export interface OpRoomMember extends CommunityCard { host: boolean; me: boolean }
export interface OpMessage {
  id: number;
  mine: boolean;
  created_at: string;
  status: "active" | "hidden" | "deleted";
  by_admin: boolean;
  body: string | null;
  is_host: boolean;
  card: CommunityCard;
}
export interface OpRoom {
  post: OpItem & { chat_url: string | null };
  members: OpRoomMember[];
  can_send: boolean;
  messages: OpMessage[];
}

/** 진행 시간 표시: 6 → '6시간 이상' */
export const durationText = (h: number) => (h >= 6 ? "6시간 이상" : `${h}시간`);

/** 참가비 표시 */
export const feeText = (fee: number) => (fee === 0 ? "무료" : `${fee.toLocaleString("ko-KR")}원`);

/** 일시 표시: '10.12(일) 오후 2:00' (올해가 아니면 연도 포함) */
export function opDateText(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const wd = "일월화수목금토"[d.getDay()];
  const two = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear() !== now.getFullYear() ? `${d.getFullYear()}.` : ""}${two(d.getMonth() + 1)}.${two(d.getDate())}(${wd})`;
  return `${day} ${d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
}

/** 상태 배지 문구(목록·상세 공용). 모집 중인데 정원이 찼으면 '정원 마감' */
export function statusText(p: Pick<OpItem, "status" | "phase" | "count" | "capacity">): string {
  if (p.status === "pending") return "승인 대기";
  if (p.status === "rejected") return "반려됨";
  if (p.status === "cancelled") return "취소됨";
  if (p.status === "hidden") return "가려짐";
  if (p.status === "ended" || p.phase === "over") return "종료";
  if (p.phase === "live") return "진행 중";
  if (p.status === "closed") return "모집 마감";
  if (p.count >= p.capacity) return "정원 마감";
  return "모집 중";
}

/** ISO → <input type="datetime-local"> 값(기기 시간) */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** 오픈피스트 DB 함수 오류 → 문구. 공용 코드(정지·입력값 등)는 communityError 가 처리 */
const OP_ERROR: Record<string, string> = {
  op_not_eligible: "모집글은 선수를 연결한 회원(학부모·지도자 포함)만 쓸 수 있어요. 마이 펜싱 > 상세정보에서 선수를 연결해 주세요",
  rate_op_min: "잠시 후 다시 시도해 주세요(모집글·수정 요청은 10분에 1번)",
  rate_op_day: "모집글은 하루 5개까지 쓸 수 있어요",
  op_too_many: "진행 예정인 모집은 10개까지 열 수 있어요",
  op_not_editable: "지금 상태에서는 할 수 없어요",
  op_closed: "모집이 마감되었거나 게시 중인 글이 아니에요",
  op_started: "이미 시작된 모집이에요",
  op_own: "내가 연 모집에는 신청할 수 없어요",
  op_blocked: "차단 관계인 회원의 모집에는 신청할 수 없어요",
  op_full: "정원이 다 찼어요",
  rate_op_apply: "참가 신청은 하루 20건까지 할 수 있어요",
  op_not_member: "주최자와 참가자만 들어갈 수 있어요",
  "bad_input:starts_at": "시작 일시는 지금부터 30분 뒤 ~ 90일 안으로 정해 주세요",
  "bad_input:capacity_below": "정원을 지금 신청 인원보다 적게 줄일 수 없어요",
  "bad_input:capacity": "정원은 1~100명으로 정해 주세요",
  "bad_input:chat_url": "오픈채팅 링크는 https://open.kakao.com/ 으로 시작하는 카카오톡 오픈채팅 주소만 쓸 수 있어요",
  "bad_input:title": "운동 제목을 2~50자로 적어 주세요",
  "bad_input:place": "장소를 2~60자로 적어 주세요",
  "bad_input:levels": "레벨을 하나 이상 골라 주세요",
  "bad_input:fee": "참가비를 확인해 주세요(0~1,000,000원)",
};

export function opError(message: string | undefined | null): string {
  const m = message ?? "";
  for (const [code, text] of Object.entries(OP_ERROR)) if (m.includes(code)) return text;
  return communityError(m);
}
