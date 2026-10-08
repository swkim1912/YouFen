// 커뮤니티(게시판·채팅·장터) 경로의 제목. 화면은 각 page.tsx(클라이언트 컴포넌트)가 그린다.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "커뮤니티" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
