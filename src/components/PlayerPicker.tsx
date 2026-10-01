"use client";
// 선수 선택 컴포넌트: 유펜 유저 검색(녹색 점) 또는 '유저 아님'(이름 텍스트만 저장) 선택.
// 게임 기록 팝업 / 개인전 참가자 추가 / 단체전 참가자 입력에서 공통으로 사용한다.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Input } from "./ui/input";
import { Dot } from "./ui/dot";

export interface PickedPlayer {
  name: string;
  userId: string | null; // null = 유저 아님(비유저)
}

interface Hit {
  id: string;
  nickname: string;
  affiliation: string | null;
}

export function PlayerPicker({
  value,
  onChange,
  excludeIds = [],
  placeholder = "상대 이름 입력",
  allowSelf = false,
}: {
  allowSelf?: boolean;
  value: PickedPlayer | null;
  onChange: (p: PickedPlayer | null) => void;
  excludeIds?: string[]; // 목록에서 제외할 유저 id (중복 선택 방지)
  placeholder?: string;
}) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  // 입력할 때마다(0.25초 디바운스) 닉네임으로 유저 검색
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) return setHits([]);
      const { data } = await supabase
        .from("profiles")
        .select("id,nickname,affiliation")
        .ilike("nickname", `%${q.trim()}%`)
        .not("nickname", "is", null)
        .limit(8);
      // 기본적으로 로그인한 본인은 목록에서 제외 (기록지처럼 본인이 포함될 수 있는 곳은 allowSelf)
      setHits(((data ?? []) as Hit[]).filter((h) => (allowSelf || h.id !== user?.id) && !excludeIds.includes(h.id)));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, user?.id, allowSelf, excludeIds.join(",")]);

  // 이미 선택된 상태
  if (value) {
    return (
      <div className="flex h-10 items-center justify-between rounded-md border border-line bg-panel2 px-3 text-sm">
        <span className="flex items-center gap-2">
          <Dot member={!!value.userId} />
          {value.name}
        </span>
        <button className="text-xs text-muted hover:text-foreground" onClick={() => onChange(null)}>
          변경
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {q.trim() && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-panel p-1 shadow-lg">
          {hits.map((h) => (
            <button
              key={h.id}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5"
              onClick={() => {
                onChange({ name: h.nickname, userId: h.id });
                setQ("");
              }}
            >
              <Dot member />
              <span>{h.nickname}</span>
              <span className="text-xs text-muted">{h.affiliation ?? ""}</span>
            </button>
          ))}
          {/* 비회원 선택지: 회색 점 + 입력한 이름 */}
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5"
            onClick={() => {
              onChange({ name: q.trim(), userId: null });
              setQ("");
            }}
          >
            <Dot member={false} />
            <span>{q.trim()}</span>
          </button>
        </div>
      )}
    </div>
  );
}
