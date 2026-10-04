import type { Metadata } from "next";
import "./globals.css";
import "./tier-frame.css"; // 티어 프로필 카드 테두리 (components/TierFrame.tsx)
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "유펜 YouFen",
  description: "펜싱 전적 기록·검색·피드백 노트 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
        <Toaster theme="dark" position="top-center" />
      </body>
    </html>
  );
}
