import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import { ImageViewerProvider } from "@/components/providers/ImageViewerProvider";

export const metadata: Metadata = {
  title: "삼성여고 2026 입시",
  description: "실시간 수시 상담 및 입시 관리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <ImageViewerProvider>{children}</ImageViewerProvider>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
