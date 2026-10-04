"use client";
// 전적 검색: 이름으로 검색 → 유펜 회원(전적)과 협회 대회 선수(대회 기록)를 함께 보여준다.
// 회원이 한 명뿐이고 선수 결과가 없으면 바로 프로필을 연다. 선수를 누르면 선수 프로필(/athletes/[id])로 이동.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { PUBLIC_COLS } from "@/lib/utils";
import { Dot } from "@/components/ui/dot";
import { useAuth } from "@/components/AuthProvider";

interface AthleteHit {
  id: number;
  name: string;
  is_registered: boolean;
  club: { name: string } | null;
}

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
  const [athletes, setAthletes] = useState<AthleteHit[]>([]);
  const [picked, setPicked] = useState<Profile | null>(null);

  useEffect(() => {
    setPicked(null);
    setResults(null);
    setAthletes([]);
    if (!q) return setResults([]);
    let cancelled = false;
    (async () => {
      const [u, a] = await Promise.all([
        supabase.from("profiles").select(PUBLIC_COLS).ilike("nickname", `%${q}%`).not("nickname", "is", null).limit(20),
        supabase.from("athletes").select("id,name,is_registered,club:clubs(name)").ilike("name", `%${q}%`).order("is_registered", { ascending: false }).order("name").limit(30),
      ]);
      if (cancelled) return;
      const r = (u.data ?? []) as Profile[];
      const ath = (a.data ?? []) as unknown as AthleteHit[];
      setResults(r);
      setAthletes(ath);
      if (r.length === 1 && ath.length === 0) setPicked(r[0]);
    })();
    return () => { cancelled = true; };
  }, [q]);

  if (results === null) return <p className="text-center text-muted">검색 중…</p>;
  if (results.length === 0 && athletes.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted">
        <SearchX size={48} />
        <p>검색 결과가 없습니다</p>
      </div>
    );
  if (picked) return <ProfileView profile={picked} isMe={picked.id === user?.id} readOnly />;
  return (
    <div className="space-y-5">
      {results.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-muted">유펜 회원</h2>
          {results.map((p) => (
            <button key={p.id} onClick={() => setPicked(p)} className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel p-3 text-left hover:bg-white/5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-panel2 font-bold">{p.nickname?.[0]}</span>
              <span>
                <span className="flex items-center gap-1.5 font-bold"><Dot member />{p.nickname}</span>
                <span className="text-xs text-muted">{p.weapon} / {p.role} · {p.affiliation}</span>
              </span>
            </button>
          ))}
        </section>
      )}
      {athletes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-muted">선수 <span className="font-normal">(협회 대회 기록)</span></h2>
          {athletes.map((a) => (
            <Link key={a.id} href={`/athletes/${a.id}`} className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel p-3 text-left hover:bg-white/5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-panel2 font-bold">{a.name[0]}</span>
              <span>
                <span className="flex items-center gap-1.5 font-bold"><Dot member={false} />{a.name}</span>
                <span className="text-xs text-muted">{a.club?.name ?? "소속 정보 없음"}{!a.is_registered && " · 협회 원장 미등록"}</span>
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
