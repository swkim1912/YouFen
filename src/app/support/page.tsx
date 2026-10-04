"use client";
// 고객지원 · 버그 신고: 앱 안에서 바로 접수한다(RPC submit_support → support_tickets 테이블, 관리자만 전체 조회).
// - 로그인 회원은 자동으로 계정이 연결되고, 비로그인(로그인이 안 되는 문제 등)은 답변 받을 이메일이 필수.
// - 접수한 화면 주소(?from=)와 브라우저 정보가 함께 저장돼 버그 재현에 쓰인다. 개인정보(비밀번호 등)는 적지 않도록 안내한다.
// - 내가 낸 접수와 처리 상태는 로그인 상태에서 아래에 보인다.
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LegalPage } from "@/components/LegalPage";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

const CATEGORIES = [
  ["bug", "버그 신고 (오류·화면이 이상해요)"],
  ["inquiry", "문의 · 제안"],
  ["report", "신고 (부적절한 사진·닉네임, 기록 조작, 사칭 등)"],
  ["account", "계정 · 탈퇴 · 선수 연결 문의"],
  ["other", "기타"],
] as const;
const STATUS: Record<string, string> = { new: "접수됨", in_progress: "처리 중", done: "처리 완료" };
const CAT_LABEL: Record<string, string> = { bug: "버그", inquiry: "문의", report: "신고", account: "계정", other: "기타" };

interface Ticket { id: number; category: string; title: string; status: string; created_at: string }

export default function SupportPage() {
  return (
    <LegalPage path="/support" title="고객지원 · 버그 신고" intro="오류, 불편한 점, 신고할 내용을 알려 주세요. 접수하신 내용은 운영자가 확인하고 답변이 필요하면 이메일로 안내합니다." showDate={false}>
      <Suspense>
        <SupportForm />
      </Suspense>
    </LegalPage>
  );
}

function SupportForm() {
  const sp = useSearchParams();
  const { user, profile } = useAuth();
  const [category, setCategory] = useState<string>(CATEGORIES.some(([k]) => k === sp.get("type")) ? sp.get("type")! : "bug");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // 내 접수 내역(로그인한 경우)
  const loadMine = useCallback(async () => {
    if (!user) return setTickets([]);
    const { data } = await supabase.from("support_tickets").select("id,category,title,status,created_at").eq("profile_id", user.id).order("created_at", { ascending: false }).limit(10);
    setTickets((data ?? []) as Ticket[]);
  }, [user]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_support", {
      p_category: category,
      p_title: title,
      p_content: content,
      p_contact_email: email || profile?.email || null,
      // 접수한 화면: 푸터 링크는 어디서든 같은 주소라 직전 화면(referrer)이나 ?from= 을 쓴다
      p_page_url: sp.get("from") || document.referrer || window.location.href,
      p_user_agent: navigator.userAgent,
    });
    setBusy(false);
    const r = data as { ok: boolean; message?: string } | null;
    if (error || !r?.ok) return toast.error(r?.message ?? "접수하지 못했어요. 잠시 후 다시 시도해 주세요");
    toast.success("접수했어요. 확인 후 안내드릴게요");
    setTitle("");
    setContent("");
    loadMine();
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-panel p-4">
        <div>
          <Label>접수 종류</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        <div><Label>제목</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="한 줄로 요약해 주세요" required /></div>
        <div>
          <Label>내용</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={3000} rows={7} required
            placeholder={category === "bug" ? "어떤 화면에서, 무엇을 눌렀을 때, 어떻게 되었는지 적어 주세요.\n(예: 랭킹 > 동호인 > 에페에서 선수를 누르면 빈 화면이 나옵니다)" : "내용을 자세히 적어 주세요."} />
          <p className="mt-1 text-xs text-muted">{content.length}/3000 · 비밀번호, 체육인번호 등 민감한 정보는 적지 마세요.</p>
        </div>
        <div>
          <Label>{user ? "답변 받을 이메일 (비워두면 가입 이메일로 안내해요)" : "답변 받을 이메일 (필수)"}</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={user ? profile?.email ?? "" : "name@example.com"} required={!user} />
        </div>
        <Button className="w-full" disabled={busy}>{busy ? "접수 중…" : "접수하기"}</Button>
        <p className="text-xs text-muted">접수 시 문의 내용·이메일·화면 주소·브라우저 정보를 수집하며 처리 후 1년간 보관합니다. 자세한 내용은 개인정보 처리방침을 확인해 주세요.</p>
      </form>

      {user && (
        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="mb-2 text-base font-bold">내 접수 내역</h2>
          {tickets.length === 0 ? (
            <p className="text-muted">접수한 내용이 없습니다</p>
          ) : (
            <ul className="space-y-1.5">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-md bg-panel2 px-3 py-2">
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-muted">{CAT_LABEL[t.category]}</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted">{t.created_at.slice(0, 10)}</span>
                  <span className={t.status === "done" ? "shrink-0 text-xs text-win" : "shrink-0 text-xs text-muted"}>{STATUS[t.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
