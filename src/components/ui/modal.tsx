"use client";
// 간단한 모달(Dialog) 컴포넌트 + 확인창(Confirm). ESC / 배경 클릭으로 닫힘.
// 접근성: 화면 낭독기에 '대화 상자'로 알리고(role=dialog, aria-modal, 제목 연결),
// 열리면 키보드 초점을 창 안으로 옮기고, Tab 이 창 밖(뒤 화면)으로 나가지 않게 가두고, 닫히면 원래 누르던 버튼으로 돌려준다.
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 대화 상자 초점 관리(공지 팝업·약관 동의 창도 같이 쓴다).
 * - open 이 true 가 되면: 지금 초점이 있던 요소를 기억 → 창 안 첫 입력칸(없으면 창 자체)으로 초점 이동
 * - Tab / Shift+Tab: 창 안 마지막 ↔ 첫 요소 사이에서만 돌게 함
 * - 닫히면(또는 사라지면) 기억해 둔 요소로 초점을 돌려줌
 * 돌려준 ref 를 창 상자(div)에 붙이고, 그 div 에 tabIndex={-1} 을 준다.
 */
export function useDialogFocus<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const box = ref.current;
    if (!box) return;
    const before = document.activeElement as HTMLElement | null;
    // 입력칸이 있으면 바로 입력할 수 있게 거기로, 없으면 창 자체로(버튼에 바로 가면 Enter 한 번에 실수로 눌릴 수 있음)
    const first = box.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])");
    (first ?? box).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); box.focus(); return; }
      const firstEl = items[0], lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === box)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && (active === lastEl || !box.contains(active))) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // 창을 연 버튼이 아직 화면에 있으면 그리로 초점을 돌려준다
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}

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
  const titleId = useId();
  const boxRef = useDialogFocus<HTMLDivElement>(open);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#03080e]/75 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-lg border border-line bg-panel p-5 shadow-2xl shadow-black/50 outline-none ${wide ? "max-w-2xl" : "max-w-md"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-bold">{title}</h2>
          {/* 닫기: 아이콘은 18px 이지만 누르는 영역은 36px */}
          <button onClick={onClose} aria-label="닫기" className="-m-2 flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-white/5 hover:text-foreground">
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
