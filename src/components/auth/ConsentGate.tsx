"use client";
// 약관 동의 기록이 없는 로그인 회원(약관 도입 전에 가입한 회원)에게 한 번 동의를 받는 창.
// - 동의하기 전에는 닫을 수 없고, '로그아웃'만 할 수 있다. 동의하면 profiles.consent_version/at 이 기록된다(RPC record_consent).
// - 약관을 크게 고쳐 다시 동의를 받아야 할 때는 src/lib/legal.ts 의 CONSENT_VERSION 을 올리면 같은 창이 다시 뜬다
//   (예전 버전에 동의한 회원에게는 '약관이 바뀌었어요' + LEGAL_CHANGES 요약을 보여 준다).
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { useDialogFocus } from "@/components/ui/modal";
import { ConsentChecks, emptyConsent, isConsentComplete } from "./ConsentChecks";
import { CONSENT_VERSION, LEGAL_CHANGES, LEGAL_UPDATED } from "@/lib/legal";

export function ConsentGate() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [consent, setConsent] = useState(emptyConsent);
  const [busy, setBusy] = useState(false);
  // 온보딩 전(구글 가입 직후)은 온보딩 화면에서 동의를 받는다
  // 동의 창이 떠 있는 동안 키보드 초점을 창 안에 둔다
  const boxRef = useDialogFocus<HTMLDivElement>(!!profile && !!profile.onboarded && profile.consent_version !== CONSENT_VERSION);
  if (!profile || !profile.onboarded || profile.consent_version === CONSENT_VERSION) return null;

  const agree = async () => {
    if (!isConsentComplete(consent)) return toast.error("필수 항목에 모두 동의해 주세요");
    setBusy(true);
    const { data } = await supabase.rpc("record_consent", { p_version: CONSENT_VERSION });
    const r = data as { ok: boolean; message?: string } | null;
    if (!r?.ok) {
      setBusy(false);
      return toast.error(r?.message ?? "동의를 저장하지 못했어요");
    }
    await refreshProfile();
    setBusy(false);
    toast.success("동의해 주셔서 감사합니다");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#03080e]/80 p-4 backdrop-blur-[2px]">
      <div ref={boxRef} tabIndex={-1} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-line bg-panel p-5 shadow-xl outline-none" role="dialog" aria-modal="true" aria-label="약관 동의">
        {profile.consent_version ? (
          // 예전 버전에 동의한 회원: 바뀐 내용을 요약해 보여 주고 다시 동의를 받는다
          <div className="space-y-2">
            <h2 className="text-lg font-bold">약관이 바뀌었어요</h2>
            <p className="text-sm text-muted">이용약관·개인정보 처리방침·커뮤니티 운영원칙이 개정되었어요({LEGAL_UPDATED}). 계속 이용하려면 다시 동의해 주세요.</p>
            <ul className="list-disc space-y-0.5 rounded-md bg-panel2 py-2 pl-7 pr-3 text-xs leading-relaxed">
              {LEGAL_CHANGES.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-bold">이용약관 동의가 필요해요</h2>
            <p className="mt-1 text-sm text-muted">서비스 약관과 개인정보 처리방침이 마련되었어요. 계속 이용하려면 아래 내용에 동의해 주세요.</p>
          </div>
        )}
        <ConsentChecks value={consent} onChange={setConsent} />
        <Button className="w-full" onClick={agree} disabled={busy}>동의하고 계속하기</Button>
        <button type="button" onClick={signOut} className="block w-full text-center text-sm text-muted underline hover:text-foreground">동의하지 않고 로그아웃</button>
      </div>
    </div>
  );
}
