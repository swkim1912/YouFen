// Supabase 브라우저 클라이언트: 모든 페이지에서 이 하나의 인스턴스를 공유합니다.
// (URL / 키는 .env.local 에 저장되어 있습니다. publishable 키는 공개되어도 안전하며,
//  실제 보안은 DB의 RLS(Row Level Security) 정책이 담당합니다.)
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
