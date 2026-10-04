"use client";
// 소속 선택: 자유 입력 대신 우리 DB(clubs)에서 이름을 검색해 고른다. '선택안함(무소속)' 도 고를 수 있다.
// 값 규칙: 클럽을 고르면 club_id = 클럽 id, affiliation = 클럽 이름 / 선택안함이면 club_id = null, affiliation = "무소속" /
//          아직 안 골랐으면 affiliation = "" (가입 폼 검증에서 막는다).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input, Label } from "./ui/input";

export const NO_CLUB = "무소속";

interface ClubHit {
  id: number;
  name: string;
  sido: string | null;
}

export function ClubPicker({
  clubId,
  affiliation,
  onChange,
}: {
  clubId: number | null;
  affiliation: string;
  onChange: (v: { club_id: number | null; affiliation: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ClubHit[]>([]);
  const [open, setOpen] = useState(false);
  const chosen = affiliation !== ""; // 클럽 또는 '무소속'을 이미 골랐는가

  // 입력이 멈추면 클럽 이름으로 검색 (최대 8건)
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("clubs").select("id,name,sido").ilike("name", `%${term.replace(/[%_]/g, "")}%`).order("name").limit(8);
      setHits((data ?? []) as ClubHit[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (v: { club_id: number | null; affiliation: string }) => {
    onChange(v);
    setQ("");
    setHits([]);
    setOpen(false);
  };

  return (
    <div>
      <Label>현재 소속</Label>
      {chosen ? (
        // 선택된 상태: 이름 + 변경 버튼
        <div className="flex h-10 items-center justify-between rounded-md border border-line bg-panel2 px-3 text-sm">
          <span className={clubId ? "font-semibold" : "text-muted"}>{affiliation}</span>
          <button type="button" className="text-xs text-brand hover:underline" onClick={() => onChange({ club_id: null, affiliation: "" })}>
            변경
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="클럽·팀 이름으로 검색 (예: 서울시청)"
            autoComplete="off"
          />
          {open && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-panel shadow-lg">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => pick({ club_id: h.id, affiliation: h.name })}>
                    <span className="truncate">{h.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted">{h.sido}</span>
                  </button>
                </li>
              ))}
              {q.trim() && hits.length === 0 && <li className="px-3 py-2 text-xs text-muted">검색 결과가 없습니다. 목록에 없으면 &#39;선택안함&#39;을 고르고 나중에 소속 등록을 요청해 주세요.</li>}
              <li className="border-t border-line">
                <button type="button" className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-white/5" onClick={() => pick({ club_id: null, affiliation: NO_CLUB })}>
                  선택안함 (무소속)
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
