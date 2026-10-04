"use client";
// 상단 검색창: 입력하는 도중 유펜 회원(녹색 점)과 협회 대회 선수(회색 점)를 함께 미리보기로 보여준다.
// - 회원을 고르면 전적검색(/search), 선수를 고르면 선수 프로필(/athletes/[id])로 이동한다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Dot } from "./ui/dot";
import { Button } from "./ui/button";

interface Hit {
  id: string;
  nickname: string;
  affiliation: string | null;
  weapon: string | null;
  role: string | null;
}
interface AthleteHit {
  id: number;
  name: string;
  is_registered: boolean;
  club: { name: string } | null;
}

export function UserSearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null); // null = 검색 전/로딩
  const [aHits, setAHits] = useState<AthleteHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setHits(null);
      setAHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const [u, a] = await Promise.all([
        supabase.from("profiles").select("id,nickname,affiliation,weapon,role").ilike("nickname", `%${q.trim()}%`).not("nickname", "is", null).limit(4),
        // 협회 원장에 등록된 선수를 먼저 보여준다
        supabase.from("athletes").select("id,name,is_registered,club:clubs(name)").ilike("name", `%${q.trim()}%`).order("is_registered", { ascending: false }).limit(5),
      ]);
      setHits((u.data ?? []) as Hit[]);
      setAHits((a.data ?? []) as unknown as AthleteHit[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (name: string) => {
    setOpen(false);
    setQ("");
    router.push(`/search?q=${encodeURIComponent(name)}`);
  };
  const goAthlete = (id: number) => {
    setOpen(false);
    setQ("");
    router.push(`/athletes/${id}`);
  };

  return (
    <form
      className="relative ml-auto flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) go(q.trim());
      }}
    >
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // 클릭 처리 후 닫기
        placeholder="유저·선수 이름 검색"
        className="h-9 w-44 rounded-md border border-line bg-panel2 px-3 text-sm outline-none focus:border-brand sm:w-56"
      />
      <Button size="sm" type="submit" aria-label="검색"><Search size={16} /></Button>
      {open && q.trim() && hits && (
        <div className="absolute right-0 top-11 z-40 w-72 rounded-md border border-line bg-panel p-1 shadow-lg">
          {hits.length === 0 && aHits.length === 0 && <div className="px-3 py-2 text-sm text-muted">검색 결과가 없습니다</div>}
          {hits.map((h) => (
            <button
              type="button"
              key={h.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(h.nickname)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5"
            >
              <Dot member />
              <span className="font-medium">{h.nickname}</span>
              <span className="truncate text-xs text-muted">{h.weapon} · {h.affiliation}</span>
            </button>
          ))}
          {aHits.length > 0 && <div className="px-2 pb-0.5 pt-1.5 text-[11px] text-muted">선수 (협회 대회 기록)</div>}
          {aHits.map((a) => (
            <button
              type="button"
              key={a.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => goAthlete(a.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5"
            >
              <Dot member={false} />
              <span className="font-medium">{a.name}</span>
              <span className="truncate text-xs text-muted">{a.club?.name ?? (a.is_registered ? "" : "원장 미등록")}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
