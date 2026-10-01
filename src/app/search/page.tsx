"use client";
// 유저 검색: 닉네임으로 검색 → 결과 1명이면 바로 프로필, 여러 명이면 목록에서 선택
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { PUBLIC_COLS } from "@/lib/utils";
import { Dot } from "@/components/ui/dot";
import { useAuth } from "@/components/AuthProvider";

export default function SearchPage() {
  return (
    <AppShell>
      <Suspense>
        <Inner />
      </Suspense>
    </AppShell>
  );
}

function Inner() {
  const q = useSearchParams().get("q")?.trim() ?? "";
  const { user } = useAuth();
  const [results, setResults] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<Profile | null>(null);

  useEffect(() => {
    setPicked(null);
    setResults(null);
    if (!q) return setResults([]);
    supabase
      .from("profiles")
      .select(PUBLIC_COLS)
      .ilike("nickname", `%${q}%`)
      .not("nickname", "is", null)
      .limit(20)
      .then(({ data }) => {
        const r = (data ?? []) as Profile[];
        setResults(r);
        if (r.length === 1) setPicked(r[0]);
      });
  }, [q]);

  if (results === null) return <p className="text-center text-muted">검색 중…</p>;
  if (results.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted">
        <SearchX size={48} />
        <p>검색 결과가 없습니다</p>
      </div>
    );
  if (picked) return <ProfileView profile={picked} isMe={picked.id === user?.id} readOnly />;
  return (
    <div className="space-y-2">
      {results.map((p) => (
        <button key={p.id} onClick={() => setPicked(p)} className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel p-3 text-left hover:bg-white/5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-panel2 font-bold">{p.nickname?.[0]}</span>
          <span>
            <span className="flex items-center gap-1.5 font-bold"><Dot member />{p.nickname}</span>
            <span className="text-xs text-muted">{p.weapon} / {p.role} · {p.affiliation}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
