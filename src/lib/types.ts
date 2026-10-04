// DB 테이블과 1:1 대응하는 타입 정의 (테이블을 바꾸면 여기도 같이 수정)
export interface Profile {
  id: string;
  email: string | null;
  nickname: string | null;
  gender: "남" | "여" | null;
  birth_date: string | null;
  weapon: string | null;
  region: string | null;
  role: string | null;
  division: string | null;
  affiliation: string | null;
  club_id: number | null;
  avatar_url: string | null;
  avatar_locked: boolean;
  use_frame: boolean;
  use_badge: boolean;
  hide_records: boolean;
  is_admin: boolean;
  onboarded: boolean;
  nickname_changed_at: string | null;
  consent_version: string | null; // 동의한 약관 버전(없으면 아직 동의 전 → ConsentGate)
  consent_at: string | null;
  age14_confirmed: boolean;
}

export type RecordKind = "PRIVATE" | "OPEN" | "TOURNAMENT";
export type RecordStatus = "PRIVATE" | "PENDING" | "ACCEPTED";

export interface GameRecord {
  id: string;
  creator_id: string;
  kind: RecordKind;
  status: RecordStatus;
  opponent_id: string | null;
  opponent_name: string;
  target_score: number;
  my_score: number; // 등록자(creator) 기준 점수
  opp_score: number;
  tournament_name: string | null;
  round_label: string | null;
  played_at: string;
  created_at: string;
  expires_at: string | null;
  creator?: { id: string; nickname: string | null } | null;
}

export interface FeedbackNote {
  id: string;
  user_id: string;
  game_id: string | null;
  title: string | null;
  content: string;
  created_at: string;
}
