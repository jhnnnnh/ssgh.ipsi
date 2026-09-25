"use client";

import { useEffect, useState } from "react";
import { getSignedUrl } from "@/lib/wonseo-storage";
import type { WonseoImage } from "@/lib/database.types";

export function WonseoAttachmentPreview({
  images,
  onClick,
}: {
  images: WonseoImage[];
  onClick: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const firstPath = images[0]?.storage_path;

  useEffect(() => {
    if (!firstPath) return;
    let active = true;
    getSignedUrl(firstPath).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [firstPath]);

  if (images.length === 0) return null;

  return (
    <button
      onClick={onClick}
      className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="첨부 이미지" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full animate-pulse bg-slate-200" />
      )}
      <span className="absolute bottom-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-slate-900/80 text-white text-xs font-bold flex items-center justify-center">
        {images.length}
      </span>
    </button>
  );
}
