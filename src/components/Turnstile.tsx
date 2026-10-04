"use client";
// Cloudflare Turnstile(자동가입·로그인 봇 방지 확인). 로그인·회원가입·인증 메일 재발송·비밀번호 재설정·현재 비밀번호 확인에 쓴다.
// - 사용자는 대부분 아무것도 안 해도 통과한다(필요할 때만 체크 상자가 보임). 통과하면 일회용 토큰이 생기고,
//   그 토큰을 Supabase Auth 호출의 options.captchaToken 으로 보내면 Supabase 서버가 Cloudflare 에 진짜인지 확인한다.
// - 토큰은 한 번 쓰면 끝이라, 요청을 보낸 뒤에는 reset() 으로 새 토큰을 받는다.
// - 설정: NEXT_PUBLIC_TURNSTILE_SITE_KEY(사이트 키, 공개돼도 됨)를 .env.local·Vercel 에 넣고,
//   비밀 키(Secret key)는 Supabase 대시보드 Authentication > Attack Protection(Bot and Abuse Protection) > CAPTCHA 에 넣는다.
//   사이트 키가 없으면 위젯을 띄우지 않고 토큰 없이 호출한다(Supabase 에서 CAPTCHA 를 켜기 전까지는 그대로 동작).
import { useCallback, useEffect, useRef, useState } from "react";

const SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

let loading: Promise<void> | null = null;
/** Cloudflare 스크립트를 한 번만 불러온다 */
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error("turnstile-load")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** 봇 확인이 켜져 있는가(사이트 키가 설정되어 있는가) */
export const captchaEnabled = SITE_KEY.length > 0;

/**
 * 사용법: const cap = useTurnstile();  …  <cap.Widget />  …  signIn({ …, options: { captchaToken: cap.token } }); cap.reset();
 * - ready: 토큰이 준비됐는가(봇 확인이 꺼져 있으면 항상 true) → 버튼 disabled 에 쓴다
 */
export function useTurnstile() {
  const [token, setToken] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const idRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setToken(undefined);
    if (idRef.current && window.turnstile) window.turnstile.reset(idRef.current);
  }, []);

  // 위젯을 붙일 자리(ref 콜백): 화면에 나타나면 렌더, 사라지면 제거
  const mount = useCallback((el: HTMLDivElement | null) => {
    if (!captchaEnabled) return;
    if (!el) {
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
      return;
    }
    loadScript()
      .then(() => {
        if (!window.turnstile || idRef.current) return;
        idRef.current = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          theme: "dark",
          language: "ko",
          callback: (t: string) => { setToken(t); setFailed(false); },
          "expired-callback": () => setToken(undefined),
          "error-callback": () => { setToken(undefined); setFailed(true); },
        });
      })
      .catch(() => setFailed(true));
  }, []);

  // 화면을 떠날 때 위젯 정리
  useEffect(() => () => {
    if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
  }, []);

  return {
    token: captchaEnabled ? token : undefined,
    ready: !captchaEnabled || !!token,
    reset,
    /** 위젯이 들어갈 자리. 봇 확인이 꺼져 있으면 아무것도 그리지 않는다 */
    widget: captchaEnabled ? (
      <div className="flex min-h-[65px] flex-col items-center justify-center">
        <div ref={mount} />
        {failed && <p className="mt-1 text-xs text-loss">자동가입 방지 확인을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요</p>}
      </div>
    ) : null,
  };
}
