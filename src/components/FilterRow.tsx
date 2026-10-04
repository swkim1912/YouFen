"use client";
// 필터 한 줄 = 카테고리 하나. 왼쪽에 이름표, 오른쪽에 선택 버튼들. 줄이 길면 그 줄 안에서만 줄바꿈된다.
// 랭킹·대회 목록이 같이 쓴다 (예: [구분] 동호인 / 엘리트 / 전문선수).
import { cn } from "@/lib/utils";

export function FilterRow<T extends string>({
  label, options, value, onChange, render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => string; // 버튼에 보일 글자 (기본은 값 그대로)
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-12 shrink-0 pt-2 text-xs text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn("rounded px-3 py-1.5 text-sm", o === value ? "bg-brand font-semibold text-brand-ink" : "bg-panel text-muted hover:text-foreground")}
          >
            {render ? render(o) : o}
          </button>
        ))}
      </div>
    </div>
  );
}
