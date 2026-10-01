"use client";
// 로그인 페이지: 이메일(아이디)+비밀번호 / 구글 OAuth
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  // 이미 로그인 상태면 메인으로 (프로필 미완성이면 AppShell 이 온보딩으로 보냄)
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) toast.error("이메일 또는 비밀번호를 확인해 주세요");
  };

  const google = () =>
    // 구글 로그인 후 돌아오면 AppShell 이 profile.onboarded 를 보고 온보딩 페이지로 보냄
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={login} className="w-full max-w-sm space-y-3 rounded-lg border border-line bg-panel p-6">
        <h1 className="text-center text-2xl font-extrabold text-brand">유펜 YouFen</h1>
        <p className="mb-2 text-center text-sm text-muted">펜싱 전적 기록 · 검색 · 피드백</p>
        <Input type="email" placeholder="이메일(아이디)" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} required />
        <Button className="w-full" disabled={busy}>로그인</Button>
        <Button type="button" variant="outline" className="w-full" onClick={google}>Google로 계속하기</Button>
        <p className="text-center text-sm text-muted">
          계정이 없나요? <Link href="/signup" className="text-brand">회원가입</Link>
        </p>
        <Link href="/ranking" className="block text-center text-sm text-muted hover:text-foreground">로그인하지 않고 이용하기</Link>
      </form>
    </div>
  );
}
