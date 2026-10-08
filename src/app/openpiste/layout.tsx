// 오픈피스트(함께 운동할 사람 모집) 경로의 제목. 화면은 각 page.tsx(클라이언트 컴포넌트)가 그린다.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "오픈피스트" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
