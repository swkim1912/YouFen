"use client";
// 관리자: 삭제된 커뮤니티 글·댓글 백업 (docs/COMMUNITY.md 0-6)
// 삭제된 글·댓글은 다음 달 1일 0시(KST)에 완전히 지워진다. 말일 하루 전에 관리자에게 알림이 오면 이 화면에서 그 달 것을 JSON 으로 내려받는다.
// RPC admin_deleted_content(시작, 끝) — 작성자 유펜 닉네임이 들어 있으므로 파일을 안전한 곳에 보관할 것. 내보낸 기록은 관리 기록에 남는다.
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 한국 시간 기준 'YYYY-MM' */
const thisMonth = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);

export function CommunityBackupAdmin() {
  const [month, setMonth] = useState(thisMonth());
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return toast.error("달을 골라 주세요");
    // 그 달 1일 0시 ~ 다음 달 1일 0시 (KST = UTC+9)
    const from = new Date(Date.UTC(y, m - 1, 1, -9)).toISOString();
    const to = new Date(Date.UTC(y, m, 1, -9)).toISOString();
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_deleted_content", { p_from: from, p_to: to });
    setBusy(false);
    if (error) return toast.error(error.message);
    const d = data as { posts: unknown[]; comments: unknown[] };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `youfen-community-deleted-${month}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`글 ${d.posts.length}개 · 댓글 ${d.comments.length}개를 내려받았어요`);
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <h2 className="text-base font-bold">삭제 콘텐츠 백업</h2>
      <p className="text-xs text-muted">삭제된 글·댓글은 다음 달 1일 0시에 완전히 지워져요(말일 하루 전에 알림). 작성자 정보가 들어 있으니 내려받은 파일은 안전하게 보관해 주세요.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="month" className="h-9 w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={download}>JSON 내려받기</Button>
      </div>
    </section>
  );
}
