"use client";
// 화면에서 불러온 값(선수 이름·대회 이름·랭킹 필터 등)으로 브라우저 탭 제목을 바꾼다. 예: "오상훈 · 유펜 YouFen".
// 기본 제목은 각 경로의 layout.tsx(metadata)가 정하고, 이 훅은 값이 있을 때만 덮어쓴다(title 이 비어 있으면 그대로 둠).
// Next 가 페이지를 연 직후 기본 제목을 한 번 더 써 넣는 경우가 있어, <title> 이 바뀌면 다시 우리 제목으로 맞춘다.
// ※ 링크 미리보기(카카오톡 등)는 서버가 보낸 HTML 만 읽기 때문에 여기서 바꾼 제목은 미리보기에 쓰이지 않는다.
import { useEffect } from "react";

export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const want = `${title} · 유펜 YouFen`;
    let base = document.title; // Next 가 정한 제목(마지막으로 본 것) — 화면을 떠날 때 되돌린다
    const apply = () => {
      if (document.title === want) return; // 같으면 쓰지 않아 감시와 무한 반복되지 않음
      base = document.title;
      document.title = want;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      obs.disconnect();
      // 다른 페이지로 이동하면서 새 페이지 제목을 덮어썼을 수 있으므로, 마지막으로 본 Next 제목으로 되돌린다
      if (document.title === want) document.title = base;
    };
  }, [title]);
}
