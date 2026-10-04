"use client";
// 선수 선택 컴포넌트: 게임 기록 팝업 / 개인전 참가자 추가 / 단체전 참가자 입력에서 공통으로 사용한다.
// 검색은 상단 검색창(UserSearchBox)과 같은 규칙으로 회원과 협회 선수를 함께 찾는다:
//   ① 선수와 연결된 회원(학부모 제외): "닉네임 (실명) · 소속" 한 줄, 녹색 점 → 회원으로 선택(실명도 함께 기억해 기록지에 표시)
//   ② 연결 안 된 회원: 닉네임 · 소속, 녹색 점
//   ③ 회원과 연결 안 된 협회 선수: 실명 · 소속, 회색 점 → 비회원(이름만)으로 선택
//   ④ 입력한 이름 그대로 비회원으로 선택
// 닉네임으로 찾든 실명으로 찾든 같은 사람은 한 줄로 합쳐 보인다.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { publicData } from "@/lib/fencing";
import { athletesOfMembers, isMergeable, membersOfAthletes, type LinkedAthleteBrief } from "@/lib/members";
import { useAuth } from "./AuthProvider";
import { Input } from "./ui/input";
import { Dot } from "./ui/dot";

export interface PickedPlayer {
  name: string; // 회원이면 닉네임, 비회원이면 이름 (경기 기록의 상대 이름으로 저장되는 값)
  userId: string | null; // null = 유저 아님(비유저)
  realName?: string | null; // 선수와 연결된 회원의 실명(표시용)
}

/** 기록지 등에 보일 이름: 연결된 회원이면 "닉네임 (실명)" */
export const playerLabel = (p: { name: string; realName?: string | null }) => (p.realName && p.realName !== p.name ? `${p.name} (${p.realName})` : p.name);

interface Option { key: string; pick: PickedPlayer; sub: string | null }

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
  const [opts, setOpts] = useState<Option[]>([]);

  // 입력할 때마다(0.25초 디바운스) 회원 닉네임 + 협회 선수 이름을 함께 검색
  useEffect(() => {
    const term = q.trim();
    if (!term) return setOpts([]);
    let alive = true;
    const t = setTimeout(async () => {
      const [u, a] = await Promise.all([
        supabase.from("profiles").select("id,nickname,affiliation,role").ilike("nickname", `%${term}%`).not("nickname", "is", null).limit(6),
        publicData<LinkedAthleteBrief[]>("data_search_athletes", { p_q: term, p_limit: 8 }, []),
      ]);
      const members = (u.data ?? []) as { id: string; nickname: string; affiliation: string | null; role: string | null }[];
      // 닉네임으로 찾은 회원의 연결 선수, 실명으로 찾은 선수의 연결 회원을 각각 확인해 한 사람으로 합친다
      const [linkedOf, memberOf] = await Promise.all([athletesOfMembers(members.filter(isMergeable).map((m) => m.id)), membersOfAthletes(a)]);
      if (!alive) return;
      const out: Option[] = [];
      const usedMembers = new Set<string>();
      const usedAthletes = new Set<number>();
      const skip = (id: string) => (!allowSelf && id === user?.id) || excludeIds.includes(id);
      // ① 연결된 회원 (닉네임으로 찾은 경우)
      for (const m of members) {
        const ath = linkedOf.get(m.id)?.[0];
        if (!ath) continue;
        usedMembers.add(m.id);
        (linkedOf.get(m.id) ?? []).forEach((x) => usedAthletes.add(x.id));
        if (!skip(m.id)) out.push({ key: `m${m.id}`, pick: { name: m.nickname, userId: m.id, realName: ath.name }, sub: ath.club?.name ?? m.affiliation });
      }
      // ① 연결된 회원 (실명으로 찾은 경우)
      for (const x of a) {
        const m = memberOf.get(x.id);
        if (!m || usedMembers.has(m.id)) continue;
        usedMembers.add(m.id);
        usedAthletes.add(x.id);
        if (!skip(m.id)) out.push({ key: `m${m.id}`, pick: { name: m.nickname, userId: m.id, realName: x.name }, sub: x.club?.name ?? null });
      }
      // ② 연결 안 된 회원
      for (const m of members) {
        if (usedMembers.has(m.id) || skip(m.id)) continue;
        out.push({ key: `m${m.id}`, pick: { name: m.nickname, userId: m.id }, sub: m.affiliation });
      }
      // ③ 회원과 연결 안 된 협회 선수 (비회원으로 선택)
      for (const x of a) {
        if (usedAthletes.has(x.id) || memberOf.has(x.id)) continue;
        out.push({ key: `a${x.id}`, pick: { name: x.name, userId: null }, sub: x.club?.name ?? null });
      }
      setOpts(out);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, user?.id, allowSelf, excludeIds.join(",")]);

  // 이미 선택된 상태
  if (value) {
    return (
      <div className="flex h-10 items-center justify-between rounded-md border border-line bg-panel2 px-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Dot member={!!value.userId} />
          <span className="truncate">{playerLabel(value)}</span>
        </span>
        <button className="text-xs text-muted hover:text-foreground" onClick={() => onChange(null)}>
          변경
        </button>
      </div>
    );
  }

  const choose = (p: PickedPlayer) => { onChange(p); setQ(""); setOpts([]); };

  return (
    <div className="relative">
      {/* 비회원 이름은 30자까지 (DB 제약 game_records_text_len 과 같은 값) */}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} maxLength={30} />
      {q.trim() && (
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-panel p-1 shadow-lg">
          {opts.map((o) => (
            <button key={o.key} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5" onClick={() => choose(o.pick)}>
              <Dot member={!!o.pick.userId} />
              <span className="shrink-0 font-medium">{playerLabel(o.pick)}</span>
              {o.sub && <span className="truncate text-xs text-muted">{o.sub}</span>}
            </button>
          ))}
          {/* 비회원 선택지: 회색 점 + 입력한 이름 그대로 */}
          <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5" onClick={() => choose({ name: q.trim(), userId: null })}>
            <Dot member={false} />
            <span>{q.trim()}</span>
            <span className="text-xs text-muted">이름만 입력</span>
          </button>
        </div>
      )}
    </div>
  );
}
