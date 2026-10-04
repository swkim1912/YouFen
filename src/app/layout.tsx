import type { Metadata } from "next";
import "./globals.css";
import "./tier-frame.css"; // 티어 프로필 카드 테두리 (components/TierFrame.tsx)
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from "sonner";

// 페이지 제목: 각 경로의 layout.tsx(또는 서버 page)가 title 을 주면 "랭킹 · 유펜 YouFen" 처럼 붙고, 없으면 기본 제목.
// 선수 이름·대회 이름처럼 화면에서 불러오는 제목은 usePageTitle()(lib/pageTitle.ts)이 브라우저 탭 제목만 바꾼다.
// 링크 미리보기(카카오톡 등): 대표 이미지는 같은 폴더의 opengraph-image.tsx 가 빌드 때 만든다.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://youfen.vercel.app";
const DESC = "협회 대회 결과로 만든 펜싱 랭킹·티어, 내 전적 기록과 피드백 노트를 한 곳에서.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "유펜 YouFen · 펜싱 전적·랭킹", template: "%s · 유펜 YouFen" },
  description: DESC,
  applicationName: "유펜 YouFen",
  // og:title·og:description 은 비워 두면 각 페이지의 제목·설명을 그대로 쓴다(Next 가 채움)
  openGraph: { type: "website", siteName: "유펜 YouFen", locale: "ko_KR" },
  twitter: { card: "summary_large_image" },
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
