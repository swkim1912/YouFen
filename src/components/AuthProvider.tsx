"use client";
// 로그인 상태(세션)와 내 프로필을 앱 전체에 공급하는 Provider.
// 어느 컴포넌트에서든 useAuth() 로 { user, profile, refreshProfile, signOut } 를 꺼내 쓸 수 있다.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface AuthCtx {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    // 3일 지난 수락 대기 오픈 기록을 자동 거절(프라이빗 전환) 처리
    await supabase.rpc("expire_pending_records");
    // 내 프로필(이메일·생년월일 포함)은 전용 RPC 로만 조회 가능
    const { data } = await supabase.rpc("get_my_profile");
    setProfile(data && (data as Profile).id ? (data as Profile) : null);
  }, []);

  useEffect(() => {
    // 최초 세션 확인
    supabase.auth.getSession().then(async ({ data }) => {
      setUser(data.session?.user ?? null);
      await loadProfile(data.session?.user ?? null);
      setLoading(false);
    });
    // 로그인/로그아웃 변화 감지 (구글 OAuth 리다이렉트 복귀 포함)
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      // 콜백 안에서 바로 supabase 호출 시 데드락 가능 → setTimeout 으로 한 틱 미룸
      setTimeout(() => loadProfile(session?.user ?? null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthCtx = {
    user,
    profile,
    loading,
    refreshProfile: () => loadProfile(user),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
