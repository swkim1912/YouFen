"use client";
// 전적 검색: 이름으로 검색 → 유펜 회원(전적)과 협회 대회 선수(대회 기록)를 함께 보여준다.
// 회원이 한 명뿐이고 선수 결과가 없으면 바로 프로필을 연다. 선수를 누르면 선수 프로필(/athletes/[id])로 이동.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { PUBLIC_COLS, roleLabel } from "@/lib/utils";
import { publicData } from "@/lib/fencing";
import { Dot } from "@/components/ui/dot";
import { Avatar } from "@/components/Avatar";
import { athletesOfMembers, isMergeable, membersOfAthletes, type MemberBrief } from "@/lib/members";
import { useAuth } from "@/components/AuthProvider";
import { usePageTitle } from "@/lib/pageTitle";

interface AthleteHit {
  id: number;
  name: string;
  is_registered: boolean;
  linked_profile_id: string | null;
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
  const router = useRouter();
  const { user } = useAuth();
  const [nicks, setNicks] = useState<Map<number, MemberBrief>>(new Map()); // 선수 id → 연결된 회원(닉네임 표시용)
  const [results, setResults] = useState<Profile[] | null>(null);
  const [athletes, setAthletes] = useState<AthleteHit[]>([]);
  const [picked, setPicked] = useState<Profile | null>(null);
  usePageTitle(picked?.nickname ?? (q ? `'${q}' 검색` : null)); // 탭 제목: 연 회원 닉네임 또는 검색어

  useEffect(() => {
    setPicked(null);
    setResults(null);
    setAthletes([]);
    if (!q) return setResults([]);
    let cancelled = false;
    (async () => {
      const [u, a] = await Promise.all([
        supabase.from("profiles").select(PUBLIC_COLS).ilike("nickname", `%${q}%`).not("nickname", "is", null).limit(20),
        // 선수 이름 검색: 협회 원장 등록 선수 먼저, 최대 30명 (DB 함수 data_search_athletes)
        publicData<AthleteHit[]>("data_search_athletes", { p_q: q, p_limit: 30 }, []),
      ]);
      if (cancelled) return;
      const r = (u.data ?? []) as Profile[];
      let ath = a;
      // 닉네임으로 찾은 회원 중 선수와 연결된 회원(학부모 제외)은 회원 카드 대신 '선수 페이지'로 합친다
      const linked = await athletesOfMembers(r.map((p) => p.id));
      const merged = r.filter((p) => isMergeable(p) && (linked.get(p.id)?.length ?? 0) > 0);
      for (const p of merged) for (const x of linked.get(p.id) ?? []) if (!ath.some((y) => y.id === x.id)) ath = [x as AthleteHit, ...ath];
      const mergedIds = new Set(merged.map((p) => p.id));
      const rest = r.filter((p) => !mergedIds.has(p.id));
      const nk = await membersOfAthletes(ath);
      if (cancelled) return;
      setNicks(nk);
      setResults(rest);
      setAthletes(ath);
      // 결과가 합쳐진 선수 한 명뿐이면 바로 그 페이지로
      if (rest.length === 0 && ath.length === 1 && nk.has(ath[0].id)) return router.replace(`/athletes/${ath[0].id}`);
      if (rest.length === 1 && ath.length === 0) setPicked(rest[0]);
    })();
    return () => { cancelled = true; };
  }, [q, router]);

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
              <Avatar avatarUrl={p.avatar_url} clubId={p.club_id} affiliation={p.affiliation} nickname={p.nickname} size={40} />
              <span>
                <span className="flex items-center gap-1.5 font-bold"><Dot member />{p.nickname}</span>
                <span className="text-xs text-muted">{p.weapon} / {roleLabel(p)} · {p.affiliation}</span>
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
                <span className="flex items-center gap-1.5 font-bold"><Dot member={nicks.has(a.id)} />{a.name}{nicks.has(a.id) && <span className="font-semibold text-muted">({nicks.get(a.id)!.nickname})</span>}</span>
                <span className="text-xs text-muted">{a.club?.name ?? "소속 정보 없음"}{!a.is_registered && " · 협회 원장 미등록"}</span>
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
