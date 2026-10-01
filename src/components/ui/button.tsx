// shadcn/ui 스타일 버튼 (variant로 색상/모양 선택)
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand/90",
  outline: "border border-line bg-transparent hover:bg-white/5",
  ghost: "bg-transparent hover:bg-white/5",
  danger: "bg-loss text-white hover:bg-loss/90",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        styles[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
