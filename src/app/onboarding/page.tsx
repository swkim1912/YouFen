"use client";
// 온보딩: 구글로 처음 가입한 사용자가 필수 정보(종목·신분·닉네임·소속 등)를 입력하는 페이지.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { ExtraFields, emptyExtra, validateExtra } from "@/components/ProfileFields";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile, loading, refreshProfile } = useAuth();
  const [extra, setExtra] = useState(emptyExtra);
  const [nickOk, setNickOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (profile?.onboarded) router.replace("/");
  }, [loading, user, profile, router]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateExtra(extra);
    if (err) return toast.error(err);
    if (!nickOk) return toast.error("사용할 수 없는 닉네임입니다");
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ ...extra, onboarded: true }).eq("id", user!.id);
    setBusy(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "이미 사용 중인 닉네임입니다" : error.message);
    await refreshProfile();
    router.replace("/");
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={save} className="w-full max-w-md space-y-3 rounded-lg border border-line bg-panel p-6">
        <h1 className="text-center text-xl font-bold">추가 정보 입력</h1>
        <p className="text-center text-sm text-muted">서비스 이용을 위해 몇 가지만 더 알려주세요</p>
        <ExtraFields value={extra} onChange={setExtra} onNickStatus={setNickOk} />
        <Button className="w-full" disabled={busy}>시작하기</Button>
      </form>
    </div>
  );
}
