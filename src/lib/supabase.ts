// Supabase 브라우저 클라이언트: 모든 페이지에서 이 하나의 인스턴스를 공유합니다.
// (URL / 키는 .env.local 또는 Vercel 환경 변수에 저장합니다. publishable 키는 공개되어도 안전하며,
//  실제 보안은 DB의 RLS(Row Level Security) 정책이 담당합니다.)
import { createClient } from "@supabase/supabase-js";

// 환경 변수 앞뒤의 공백/따옴표 실수(붙여넣기 시 흔함)를 제거
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "");

const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const configured = /^https?:\/\//.test(url) && key.length > 0;

if (!configured) {
  // 빌드(프리렌더) 단계에서 값이 없어도 빌드가 죽지 않게 한다. 실제 요청은 실패하므로 원인을 로그로 남김.
  console.error(
    "[YouFen] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 환경 변수가 없거나 형식이 잘못되었습니다."
  );
}

export const supabaseConfigured = configured;

export const supabase = createClient(
  configured ? url : "https://placeholder.supabase.co",
  configured ? key : "placeholder-key"
);
