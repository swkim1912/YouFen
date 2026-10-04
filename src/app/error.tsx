"use client";
// 화면 오류 화면: 페이지를 그리다 예상치 못한 오류가 나면 흰 화면 대신 이 화면을 보여준다(Next 의 error 파일 규칙, 클라이언트 컴포넌트여야 함).
// '다시 시도'(retry)는 그 화면만 다시 불러오고, 계속 안 되면 홈으로 가거나 고객지원으로 알려 달라고 안내한다.
// 오류 내용은 콘솔에만 남기고 화면에는 보여주지 않는다(내부 정보 노출 방지).
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      standalone
      code="오류"
      title="화면을 불러오지 못했어요"
      desc={<>일시적인 문제일 수 있어요. 다시 시도해 주세요.<br />계속 같은 화면이 나오면 고객지원으로 알려 주시면 빠르게 확인할게요.</>}
    >
      <Button onClick={() => retry()}>다시 시도</Button>
      <StatusLink href="/">홈으로</StatusLink>
      <StatusLink href="/support">고객지원</StatusLink>
    </StatusScreen>
  );
}
