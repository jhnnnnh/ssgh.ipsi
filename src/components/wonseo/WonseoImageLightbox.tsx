"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { getSignedUrl } from "@/lib/wonseo-storage";
import type { WonseoImage } from "@/lib/database.types";

/** 카드 썸네일을 눌렀을 때 바로 큰 화면으로 이미지를 보여주고, 좌우 화살표로
 * 같은 카드의 다른 첨부 이미지 사이를 이동할 수 있는 전체화면 뷰어. */
export function WonseoImageLightbox({
  open,
  onClose,
  images,
  startIndex = 0,
}: {
  open: boolean;
  onClose: () => void;
  images: WonseoImage[];
  startIndex?: number;
}) {
  const [index, setIndex] = useState(startIndex);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    const path = images[index]?.storage_path;
    if (!path) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(null);
    getSignedUrl(path).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [open, index, images]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, images.length]);

  if (!open || images.length === 0) return null;

  function goPrev() {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }
  function goNext() {
    setIndex((i) => (i + 1) % images.length);
  }

  return (
    <div
      className="fixed inset-0 bg-slate-950/90 z-[95] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full max-h-[90dvh] flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/80 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>

        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="첨부 이미지"
            className="max-w-full max-h-[85dvh] object-contain rounded-2xl shadow-xl border border-white/10"
          />
        ) : (
          <div className="w-full aspect-video max-h-[85dvh] rounded-2xl bg-white/10 animate-pulse" />
        )}

        {images.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-0 sm:-left-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-0 sm:-right-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
            <span className="mt-3 text-xs font-bold text-white/70">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
