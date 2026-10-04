"use client";
// 비밀번호 재설정(비밀번호를 잊은 경우): ① 가입 이메일 입력 → 재설정 링크 메일 발송 → ② 메일의 링크로 돌아오면(PASSWORD_RECOVERY) 새 비밀번호 입력.
// - 가입 여부를 알려주지 않도록 메일 발송 결과 문구는 항상 같다(계정 존재 여부 노출 방지).
// - 새 비밀번호도 가입과 같은 규칙(8자 이상·영문+숫자 필수(특수문자 사용 가능) 필수·특수문자 사용 가능)을 적용한다. 변경이 끝나면 로그인 상태로 마이 펜싱으로 이동한다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { MIN_PASSWORD } from "@/lib/legal";
import { validatePassword } from "@/lib/password";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [recovery, setRecovery] = useState(false); // 메일 링크로 들어온 상태
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("올바른 이메일을 입력해 주세요");
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    setSent(true); // 가입 여부와 상관없이 같은 안내
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePassword(pw);
    if (err) return toast.error(err);
    if (pw !== pw2) return toast.error("비밀번호가 서로 달라요");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message.toLowerCase().includes("different") ? "이전과 다른 비밀번호를 입력해 주세요" : "변경하지 못했어요. 링크가 만료됐다면 다시 요청해 주세요");
    toast.success("비밀번호를 변경했어요");
    router.replace("/");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a1726]">
      <header className="mx-auto flex w-full max-w-6xl items-center px-5 py-5"><Link href="/"><Logo size={34} /></Link></header>
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#0CA4E1]/20 bg-[#0c1b2d]/90 p-6 shadow-2xl">
          {recovery ? (
            <form onSubmit={save} className="space-y-3">
              <h1 className="text-xl font-extrabold">새 비밀번호 설정</h1>
              <div><Label>새 비밀번호 ({MIN_PASSWORD}자 이상, 영문+숫자 필수·특수문자 사용 가능)</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
              <div><Label>새 비밀번호 확인</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></div>
              <Button className="w-full" disabled={busy}>비밀번호 변경하기</Button>
            </form>
          ) : sent ? (
            <div className="space-y-3 text-center">
              <h1 className="text-xl font-extrabold">메일을 확인해 주세요</h1>
              <p className="text-sm text-muted">입력한 이메일로 가입된 계정이 있다면 비밀번호 재설정 링크를 보냈어요. 링크는 일정 시간 동안만 유효해요. 메일이 안 보이면 스팸함도 확인해 주세요.</p>
              <Link href="/login" className="block text-sm text-muted underline hover:text-foreground">로그인 화면으로</Link>
            </div>
          ) : (
            <form onSubmit={send} className="space-y-3">
              <h1 className="text-xl font-extrabold">비밀번호 재설정</h1>
              <p className="text-sm text-muted">가입한 이메일을 입력하면 재설정 링크를 보내드려요.</p>
              <div><Label>이메일</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
              <Button className="w-full" disabled={busy}>재설정 메일 보내기</Button>
              <Link href="/login" className="block text-center text-sm text-muted underline hover:text-foreground">로그인 화면으로</Link>
            </form>
          )}
        </div>
      </main>
      <SiteFooter className="border-white/10" />
    </div>
  );
}
