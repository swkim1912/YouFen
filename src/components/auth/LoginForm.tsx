"use client";
// 로그인 폼: 이메일(아이디)+비밀번호 / 구글 OAuth. 랜딩 카드(AuthLanding) 안에서 쓴다.
// 로그인이 되면 AuthProvider 가 user 를 채우고, 페이지(홈·/login)가 알아서 마이 펜싱으로 넘어간다.
import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useTurnstile } from "@/components/Turnstile";
import { safeNext } from "@/lib/utils";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const cap = useTurnstile(); // 자동 로그인 시도(비밀번호 대입) 방지

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cap.ready) return toast.error("자동가입 방지 확인을 마친 뒤 다시 눌러 주세요");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw, options: { captchaToken: cap.token } });
    setBusy(false);
    cap.reset(); // 토큰은 일회용
    if (error) toast.error(error.message.toLowerCase().includes("captcha") ? "자동가입 방지 확인에 실패했어요. 다시 시도해 주세요" : "이메일 또는 비밀번호를 확인해 주세요");
  };

  const google = () =>
    // 구글 로그인 후 돌아오면 AppShell 이 profile.onboarded 를 보고 온보딩 페이지로 보냄. ?next= 가 있으면 그 주소로 돌아온다
    // (Supabase URL Configuration 의 Redirect URLs 에 https://youfen.vercel.app/** 가 있어야 경로까지 유지됨)
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + (safeNext(new URLSearchParams(window.location.search).get("next")) ?? "") } });

  return (
    <form onSubmit={login} className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold">내 펜싱 기록으로 돌아가기</h2>
        <p className="mt-1 text-sm text-muted">가입한 이메일과 비밀번호로 로그인하세요.</p>
      </div>
      <div><Label>이메일</Label><Input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
      <div>
        <Label>비밀번호</Label>
        <div className="relative">
          <Input type={show ? "text" : "password"} placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="current-password" className="pr-10" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      {cap.widget}
      <Button className="w-full" disabled={busy || !cap.ready}><LogIn size={16} className="mr-1.5" />로그인</Button>
      <p className="text-right text-xs"><Link href="/reset-password" className="text-white/60 underline hover:text-white">비밀번호를 잊으셨나요?</Link></p>
      <Button type="button" variant="outline" className="w-full" onClick={google}>Google로 계속하기</Button>
    </form>
  );
}
