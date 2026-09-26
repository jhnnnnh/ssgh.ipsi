"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** 편집·설정 작업에 쓰는 우측 패널. 짧은 확인 질문은 ConfirmProvider가 담당한다. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 기존 호출부 호환을 위해 받지만, 가이드에 따라 제목 장식 아이콘은 표시하지 않는다. */
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  /** 기존 호출부 호환을 위한 속성. 패널 배경에는 블러를 사용하지 않는다. */
  backdropBlur?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      closeButtonRef.current?.focus();
      return;
    }

    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }, [open]);

  if (!open) return null;

  function trapPanelFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="panel-scrim" role="presentation">
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("side-panel", maxWidth)}
        onKeyDown={trapPanelFocus}
      >
        <header className="side-panel-head">
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`${title} 닫기`}
            className="header-icon-action"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>
        <div className="side-panel-body">{children}</div>
        {footer && <footer className="side-panel-footer">{footer}</footer>}
      </aside>
    </div>
  );
}
