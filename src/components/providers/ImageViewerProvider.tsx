"use client";

import { createContext, useContext, useState } from "react";
import { X } from "lucide-react";

const ImageViewerContext = createContext<((url: string) => void) | null>(null);

export function ImageViewerProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);

  return (
    <ImageViewerContext.Provider value={setUrl}>
      {children}
      {url && (
        <div
          className="fixed inset-0 bg-slate-950/90 z-[95] flex items-center justify-center p-4"
          onClick={() => setUrl(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90dvh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setUrl(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="확대 이미지"
              className="max-w-full max-h-[85dvh] object-contain rounded-2xl shadow-xl border border-white/10"
            />
          </div>
        </div>
      )}
    </ImageViewerContext.Provider>
  );
}

export function useImageViewer() {
  const ctx = useContext(ImageViewerContext);
  if (!ctx) throw new Error("useImageViewer must be used within ImageViewerProvider");
  return ctx;
}
