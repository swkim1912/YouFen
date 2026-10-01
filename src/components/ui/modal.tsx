"use client";
// 간단한 모달(Dialog) 컴포넌트 + 확인창(Confirm). ESC / 배경 클릭으로 닫힘.
import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-lg border border-line bg-panel p-5 shadow-xl ${wide ? "max-w-2xl" : "max-w-md"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label="닫기" className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 예/아니오 확인창 (예: "경기 결과를 덮어쓰시겠습니까?") */
export function Confirm({
  open,
  message,
  onOk,
  onCancel,
  okText = "확인",
}: {
  open: boolean;
  message: string;
  onOk: () => void;
  onCancel: () => void;
  okText?: string;
}) {
  return (
    <Modal open={open} onClose={onCancel} title="확인">
      <p className="mb-5 text-sm">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>취소</Button>
        <Button onClick={onOk}>{okText}</Button>
      </div>
    </Modal>
  );
}
