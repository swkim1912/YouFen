"use client";
// 비밀번호 변경(상세 설정 안): 저장 버튼으로 바로 바뀌지 않고 3단계 확인을 거친다.
//   ① 현재 비밀번호 확인(재로그인)  ② 새 비밀번호 규칙 검사(8자 이상·영문+숫자 필수(특수문자 사용 가능)·현재와 달라야 함·이메일 아이디 불포함)
//   ③ 이메일로 온 인증 코드(nonce) 입력 → 코드와 함께 변경 요청(supabase.auth.reauthenticate + updateUser({nonce}))
// ※ 코드 검증을 서버가 강제하려면 Supabase 대시보드 Authentication > Sign In / Providers > Email 에서
//   'Secure password change'(비밀번호 변경 시 재인증 요구)를 켜야 한다. 꺼져 있어도 ①·②는 화면에서 지켜지고, 같은 비밀번호는 서버가 거절한다.
// 구글로만 가입한 회원은 비밀번호가 없어 이 항목을 보이지 않는다.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";
import { validatePassword } from "@/lib/password";
import { MIN_PASSWORD } from "@/lib/legal";

type Step = "closed" | "form" | "code";

export function PasswordChange() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("closed");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const hasPassword = user?.app_metadata?.providers ? (user.app_metadata.providers as string[]).includes("email") : true;
  if (!user?.email) return null;
  if (!hasPassword) return <p className="rounded-md border border-line p-3 text-xs text-muted">구글 계정으로 가입해서 비밀번호가 없어요. 비밀번호는 구글 계정 설정에서 관리해 주세요.</p>;

  const reset = () => { setStep("closed"); setCur(""); setPw(""); setPw2(""); setCode(""); };

  // ①② 현재 비밀번호 확인 + 새 비밀번호 검사 → 이메일로 인증 코드 발송
  const sendCode = async () => {
    if (!cur) return toast.error("현재 비밀번호를 입력해 주세요");
    if (pw === cur) return toast.error("현재 비밀번호와 다른 비밀번호를 입력해 주세요");
    const err = validatePassword(pw, user.email);
    if (err) return toast.error(err);
    if (pw !== pw2) return toast.error("새 비밀번호가 서로 달라요");
    setBusy(true);
    // 현재 비밀번호 확인(재로그인). 틀리면 여기서 멈춘다
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email!, password: cur });
    if (authErr) {
      setBusy(false);
      return toast.error("현재 비밀번호가 맞지 않아요");
    }
    const { error } = await supabase.auth.reauthenticate(); // 이메일로 인증 코드 발송
    setBusy(false);
    if (error) return toast.error("인증 코드를 보내지 못했어요. 잠시 후 다시 시도해 주세요");
    toast.success("이메일로 인증 코드를 보냈어요");
    setWait(60);
    setStep("code");
  };

  // ③ 코드와 함께 변경
  const change = async () => {
    if (!code.trim()) return toast.error("이메일로 받은 인증 코드를 입력해 주세요");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw, nonce: code.trim() });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      return toast.error(m.includes("different") ? "현재 비밀번호와 다른 비밀번호를 입력해 주세요" : m.includes("nonce") || m.includes("reauth") ? "인증 코드가 맞지 않거나 만료됐어요" : "변경하지 못했어요. 잠시 후 다시 시도해 주세요");
    }
    toast.success("비밀번호를 변경했어요");
    reset();
  };

  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <div className="flex items-center justify-between">
        <Label className="mb-0">비밀번호</Label>
        {step === "closed" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setStep("form")}>비밀번호 변경</Button>
        ) : (
          <button type="button" onClick={reset} className="text-xs text-muted underline">취소</button>
        )}
      </div>
      {step === "form" && (
        <div className="space-y-2">
          <p className="text-xs text-muted">안전을 위해 현재 비밀번호 확인과 이메일 인증을 거쳐 변경해요.</p>
          <div><Label>현재 비밀번호</Label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></div>
          <div><Label>새 비밀번호 ({MIN_PASSWORD}자 이상, 영문+숫자 필수·특수문자 사용 가능)</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
          <div><Label>새 비밀번호 확인</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></div>
          <Button type="button" className="w-full" onClick={sendCode} disabled={busy}>{busy ? "확인 중…" : "이메일로 인증 코드 받기"}</Button>
        </div>
      )}
      {step === "code" && (
        <div className="space-y-2">
          <p className="text-xs text-muted">{user.email} 로 보낸 인증 코드를 입력해 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.</p>
          <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="인증 코드" />
          <Button type="button" className="w-full" onClick={change} disabled={busy}>{busy ? "변경 중…" : "비밀번호 변경하기"}</Button>
          <Button type="button" variant="outline" className="w-full" onClick={sendCode} disabled={busy || wait > 0}>{wait > 0 ? `코드 다시 받기 (${wait}초)` : "코드 다시 받기"}</Button>
        </div>
      )}
    </div>
  );
}
