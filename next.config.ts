import type { NextConfig } from "next";

// 모든 페이지 응답에 붙는 보안 헤더
// - frame-ancestors 'none' / X-Frame-Options: 다른 사이트가 유펜을 몰래 틀(iframe) 안에 띄워 클릭을 유도하는 공격(클릭재킹) 차단
// - nosniff: 브라우저가 파일 형식을 멋대로 추측해 스크립트로 실행하지 않게
// - Referrer-Policy: 다른 사이트로 이동할 때 주소 전체(검색어 등)가 아니라 도메인만 전달
// - Permissions-Policy: 쓰지 않는 카메라·마이크·위치·결제 기능을 아예 끔
// - base-uri / object-src / form-action: 주입된 코드가 기준 주소·플러그인·폼 전송 대상을 바꾸지 못하게
// (스크립트 출처까지 제한하는 전체 CSP 는 Next 내부 인라인 스크립트와 Turnstile 때문에 nonce 설정이 필요해 지금은 넣지 않는다)
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // 'X-Powered-By: Next.js' 헤더 숨김(사용 기술 노출 최소화)
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
