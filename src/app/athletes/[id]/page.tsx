"use client";
// 선수 프로필 페이지: /athletes/123?tab=동호인&age=일반&weapon=에페&gender=남  (쿼리는 어떤 풀을 먼저 보여줄지 정하는 힌트)
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AthleteView } from "@/components/AthleteView";
import { AGES, GENDER_VALUES, TABS, WEAPON_VALUES, type PoolKey } from "@/lib/fencing";

const pick = <T extends string>(v: string | null, list: readonly T[]): T | undefined => (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

export default function AthletePage() {
  return (
    <AppShell>
      <Suspense>
        <Inner />
      </Suspense>
    </AppShell>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const athleteId = Number(id);
  const initial: Partial<PoolKey> = {
    tab: pick(sp.get("tab"), TABS),
    age: pick(sp.get("age"), AGES),
    weapon: pick(sp.get("weapon"), WEAPON_VALUES),
    gender: pick(sp.get("gender"), GENDER_VALUES),
  };
  if (!Number.isFinite(athleteId)) return <p className="py-16 text-center text-muted">잘못된 주소입니다</p>;
  return <AthleteView key={athleteId} athleteId={athleteId} initialPool={initial} initialSeason={sp.get("season") || undefined} />;
}
