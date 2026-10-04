// 점수 안내 페이지의 제목(브라우저 탭·링크 미리보기용). 화면은 page.tsx(클라이언트 컴포넌트)가 그리고, 이 파일은 제목만 정한다.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "점수 안내", description: "유펜 랭킹 점수와 티어를 계산하는 방법" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
