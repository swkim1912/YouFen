// /community 는 커뮤니티(게시판·채팅·장터) 화면 자리다(docs/COMMUNITY.md). 커뮤니티 운영원칙 문서는 /guidelines 로 옮겼다(2026-10-08).
// 게시판(2단계)이 생기기 전까지는 예전 링크(/community)로 들어온 사람을 운영원칙 문서로 보낸다.
import { redirect } from "next/navigation";

export default function CommunityPage() {
  redirect("/guidelines");
}
