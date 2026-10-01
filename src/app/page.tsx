"use client";
// 메인 = 마이페이지. 비로그인 사용자는 랭킹 페이지로 안내한다.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { useAuth } from "@/components/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) router.replace("/ranking");
  }, [loading, user, router]);

  return (
    <AppShell>
      <MyPage />
    </AppShell>
  );
}

function MyPage() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <ProfileView profile={profile} isMe />;
}
