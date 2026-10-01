"use client";
// 상단 유저 검색창: 입력하는 도중 회원 여부를 확인해 미리보기(녹색 점 + 닉네임 + 소속)를 보여준다.
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

export function UserSearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null); // null = 검색 전/로딩
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setHits(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,nickname,affiliation,weapon,role")
        .ilike("nickname", `%${q.trim()}%`)
        .not("nickname", "is", null)
        .limit(6);
      setHits((data ?? []) as Hit[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (name: string) => {
    setOpen(false);
    setQ("");
    router.push(`/search?q=${encodeURIComponent(name)}`);
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
        placeholder="유저 닉네임 검색"
        className="h-9 w-44 rounded-md border border-line bg-panel2 px-3 text-sm outline-none focus:border-brand sm:w-56"
      />
      <Button size="sm" type="submit" aria-label="검색"><Search size={16} /></Button>
      {open && q.trim() && hits && (
        <div className="absolute right-0 top-11 z-40 w-72 rounded-md border border-line bg-panel p-1 shadow-lg">
          {hits.length === 0 && <div className="px-3 py-2 text-sm text-muted">검색 결과가 없습니다</div>}
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
        </div>
      )}
    </form>
  );
}
