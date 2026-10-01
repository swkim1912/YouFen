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

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "h-auto min-h-24 py-2", className)} {...props} />;
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn("mb-1 block text-xs font-medium text-muted", className)}>{children}</label>;
}
