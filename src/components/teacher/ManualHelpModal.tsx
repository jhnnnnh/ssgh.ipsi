"use client";

import { CircleHelp, Download, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PdfViewer } from "@/components/ui/PdfViewer";

const MANUAL_PATH = "/docs/manual.pdf";
const MANUAL_FILENAME = "삼성여고_2026입시_담임교사용_매뉴얼.pdf";

/** 교사 화면 헤더의 "?" 버튼으로 여는 사용 매뉴얼 보기/다운로드 팝업. */
export function ManualHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="사용 매뉴얼"
      icon={<CircleHelp className="w-4 h-4 text-indigo-600" />}
      maxWidth="max-w-3xl"
      // 모달 배경의 backdrop-blur와 PDF <iframe>을 같이 쓰면 크롬에서 PDF가 검게만 나오는
      // 알려진 렌더링 버그가 있어, 이 모달만 블러를 끈다.
      backdropBlur={false}
      footer={
        <>
          <a
            href={MANUAL_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>새 탭에서 열기</span>
          </a>
          <a
            href={MANUAL_PATH}
            download={MANUAL_FILENAME}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF 다운로드</span>
          </a>
        </>
      }
    >
      <PdfViewer src={MANUAL_PATH} className="w-full max-h-[70dvh] overflow-y-auto" />
    </Modal>
  );
}
