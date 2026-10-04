// 없는 주소(404) 화면: 사이트 틀(AppShell) 안에 한글 안내 + 홈·랭킹 버튼. Next 기본 영어 화면 대신 쓰인다.
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요" };

export default function NotFound() {
  return (
    <AppShell>
      <StatusScreen
        code="404"
        title="페이지를 찾을 수 없어요"
        desc={<>주소가 바뀌었거나 없는 페이지예요.<br />주소를 다시 확인하거나 아래에서 이동해 주세요.</>}
      >
        <StatusLink href="/" primary>홈으로</StatusLink>
        <StatusLink href="/ranking">랭킹 보기</StatusLink>
      </StatusScreen>
    </AppShell>
  );
}
