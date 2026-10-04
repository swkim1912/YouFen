"use client";
// 가장 바깥 틀(app/layout.tsx)에서 오류가 나면 쓰이는 마지막 오류 화면. 사이트 틀 전체를 대신하므로 <html>·<body> 와 스타일을 직접 넣는다.
// 일반적인 화면 오류는 app/error.tsx 가 처리하고, 이 화면은 거의 보이지 않는다. (metadata 를 못 쓰므로 제목은 <title> 로)
import "./globals.css";
import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center bg-background px-4 text-center text-foreground">
        <title>오류 · 유펜 YouFen</title>
        <p className="text-6xl font-extrabold text-brand">오류</p>
        <h1 className="mt-4 text-xl font-bold">사이트를 불러오지 못했어요</h1>
        <p className="mt-2 text-sm text-muted">잠시 후 다시 시도해 주세요. 계속되면 고객지원으로 알려 주세요.</p>
        <div className="mt-7 flex gap-2">
          <button onClick={() => retry()} className="h-10 rounded-md bg-brand px-4 text-sm font-semibold text-brand-ink">다시 시도</button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 틀이 깨진 상태라 새로 불러오는 일반 링크를 쓴다 */}
          <a href="/" className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm">홈으로</a>
        </div>
      </body>
    </html>
  );
}
