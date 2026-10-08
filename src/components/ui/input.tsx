"use client";
// shadcn/ui 스타일 입력창 / 셀렉트 / 라벨
import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "h-10 w-full rounded-md border border-line bg-panel2 px-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(base, className)} {...props} />
);
Select.displayName = "Select";

// React 19: ref 도 일반 prop 으로 넘어온다(ComponentProps 에 ref 포함) — 자유톡방 입력칸이 @부르기 뒤 초점을 옮길 때 쓴다
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(base, "h-auto min-h-24 py-2", className)} {...props} />;
}

// 입력칸 이름표.
// 화면 낭독기가 "이메일 입력칸"처럼 읽고, 이름표를 눌렀을 때 입력칸으로 이동하려면 <label for="입력칸 id"> 로 연결돼야 한다.
// 사이트 곳곳에서 <div><Label>이메일</Label><Input …/></div> 모양으로 쓰므로, htmlFor 를 따로 주지 않으면
// 화면에 붙은 뒤(useEffect) 바로 뒤따르는 입력칸(또는 그 안의 첫 입력칸)을 찾아 자동으로 연결한다.
//  - 다음 이름표가 나오면 거기서 멈춘다(엉뚱한 입력칸과 연결되지 않게). 최대 2칸 뒤(도움말 문단 하나)까지만 본다.
//  - 입력칸에 id 가 없으면 React useId 로 만든 id 를 붙인다(React 가 관리하지 않는 속성이라 다시 그려도 지워지지 않음).
//  - 버튼 묶음처럼 입력칸이 없는 이름표는 그대로 둔다.
const CONTROL = "input:not([type=hidden]), select, textarea";

export function Label({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) {
  const ref = React.useRef<HTMLLabelElement>(null);
  const autoId = React.useId();
  React.useEffect(() => {
    const label = ref.current;
    if (!label || htmlFor) return;
    let sib = label.nextElementSibling;
    for (let step = 0; sib && step < 2; step++, sib = sib.nextElementSibling) {
      if (sib.tagName === "LABEL") return;
      const control = (sib.matches(CONTROL) ? sib : sib.querySelector(CONTROL)) as HTMLElement | null;
      if (control) {
        if (!control.id) control.id = autoId;
        label.htmlFor = control.id;
        return;
      }
    }
  });
  return (
    <label ref={ref} htmlFor={htmlFor} className={cn("mb-1 block text-xs font-medium text-muted", className)}>
      {children}
    </label>
  );
}
