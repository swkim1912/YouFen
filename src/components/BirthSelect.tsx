"use client";
// 생년월일 선택: 연 / 월 / 일 드롭박스. value / onChange 는 "YYYY-MM-DD" 문자열(미완성이면 "").
import { Select } from "./ui/input";

export function BirthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y = "", m = "", d = ""] = value ? value.split("-") : [];
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1930 + 1 }, (_, i) => thisYear - i);
  // 선택한 연/월에 맞는 마지막 날짜 (윤년·30/31일 처리)
  const lastDay = y && m ? new Date(Number(y), Number(m), 0).getDate() : 31;

  // 세 값이 부분적으로만 선택되면 임시로 "YYYY-MM-DD" 대신 구분자만 유지
  const emit = (ny: string, nm: string, nd: string) => {
    // 월을 바꿔서 일이 범위를 넘으면 보정
    if (ny && nm && nd) {
      const max = new Date(Number(ny), Number(nm), 0).getDate();
      if (Number(nd) > max) nd = String(max);
    }
    onChange(ny && nm && nd ? `${ny}-${nm.padStart(2, "0")}-${nd.padStart(2, "0")}` : `${ny}-${nm}-${nd}`);
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <Select value={y} onChange={(e) => emit(e.target.value, m, d)} aria-label="연도">
        <option value="">연</option>
        {years.map((v) => <option key={v} value={v}>{v}년</option>)}
      </Select>
      <Select value={m ? String(Number(m)) : ""} onChange={(e) => emit(y, e.target.value, d)} aria-label="월">
        <option value="">월</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}월</option>)}
      </Select>
      <Select value={d ? String(Number(d)) : ""} onChange={(e) => emit(y, m, e.target.value)} aria-label="일">
        <option value="">일</option>
        {Array.from({ length: lastDay }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}일</option>)}
      </Select>
    </div>
  );
}

/** "YYYY-MM-DD" 완성 여부 */
export const isCompleteBirth = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
