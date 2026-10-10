"use client";
// 회원가입 폼 (4단계): ① 약관 동의(만 14세 이상 포함) → ② 기초 정보(이메일/비밀번호/성별/생년월일) → ③ 추가 정보(종목·지역·신분·종별·닉네임·소속) → ④ 이메일 인증
// - 동의 내용은 user_metadata(consent_version, age14)로 보내고 DB 트리거(handle_new_user)가 profiles 에 기록한다. 생년월일로도 만 14세 미만이면 막는다(DB 도 한 번 더 검사).
// - ④ 이메일 인증: Supabase Auth 의 'Confirm email' 설정이 켜져 있으면 가입 직후 세션이 없고 인증 메일이 발송된다 → 이 단계에서 재발송·확인을 안내한다.
//   설정이 꺼져 있으면 가입 즉시 로그인되어 ④ 는 건너뛴다(대시보드 설정: Authentication > Providers > Email > Confirm email).
// - 이메일 중복 확인은 ③의 가입 요청 결과로 한다(봇 확인을 거쳐야 해서 남의 이메일 가입 여부를 대량으로 조회할 수 없다).
//   ※ 'Confirm email' 이 꺼져 있으면 Supabase 가 중복 이메일에 바로 오류('already registered')를 돌려주고, 같은 안내로 바꿔 보여 준다.
// 랜딩 카드(AuthLanding) 안에서 쓴다.
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { BirthSelect, isCompleteBirth } from "@/components/BirthSelect";
import { ExtraFields, emptyExtra, validateExtra } from "@/components/ProfileFields";
import { ConsentChecks, emptyConsent, isConsentComplete } from "./ConsentChecks";
import { CONSENT_VERSION, MIN_PASSWORD } from "@/lib/legal";
import { ageOf, validatePassword } from "@/lib/password";
import { useTurnstile } from "@/components/Turnstile";

const RESEND_WAIT = 60; // 인증 메일 재발송 대기(초)

export function SignupForm({ onDone }: { onDone?: () => void } = {}) {
  const [step, setStep] = useState(1);
  const [consent, setConsent] = useState(emptyConsent);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [gender, setGender] = useState("");
  const [birth, setBirth] = useState("");
  const [extra, setExtra] = useState(emptyExtra);
  const [nickOk, setNickOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // 재발송 남은 대기 시간
  const cap = useTurnstile(); // 자동가입 방지: 가입·인증 메일 재발송·인증 확인(로그인) 요청마다 새 토큰을 쓴다
  const needCap = () => (cap.ready ? false : (toast.error("자동가입 방지 확인을 마친 뒤 다시 눌러 주세요"), true));

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const toStep2 = () => {
    if (!isConsentComplete(consent)) return toast.error("필수 항목에 모두 동의해 주세요");
    setStep(2);
  };

  // 이메일 중복은 여기서 미리 확인하지 않는다(누구나 아무 이메일의 가입 여부를 조회할 수 있던 email_available 을 없앰).
  // 중복이면 마지막 가입 요청(봇 확인 필요) 결과로 알려 준다 — submit 참고.
  const toStep3 = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("올바른 이메일을 입력해 주세요");
    const pwErr = validatePassword(pw, email);
    if (pwErr) return toast.error(pwErr);
    if (pw !== pw2) return toast.error("비밀번호가 일치하지 않습니다");
    if (!gender) return toast.error("성별을 선택해 주세요");
    if (!isCompleteBirth(birth)) return toast.error("생년월일(연/월/일)을 모두 선택해 주세요");
    if (ageOf(birth) < 14) return toast.error("만 14세 미만은 가입할 수 없습니다");
    setStep(3);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateExtra(extra);
    if (err) return toast.error(err);
    if (!nickOk) return toast.error("사용할 수 없는 닉네임입니다");
    if (needCap()) return;
    setBusy(true);
    // 추가 정보·동의 기록은 user_metadata 로 보내고, DB 트리거(handle_new_user)가 profiles 행을 만들어 준다.
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        emailRedirectTo: window.location.origin, // 메일의 인증 링크를 누르면 사이트로 돌아와 로그인된다
        data: { gender, birth_date: birth, ...extra, consent_version: CONSENT_VERSION, age14: "true" },
        captchaToken: cap.token,
      },
    });
    setBusy(false);
    cap.reset();
    if (error)
      return toast.error(
        error.message.includes("Database error") ? "가입할 수 없습니다. 입력한 정보(생년월일 등)를 확인해 주세요"
        : error.message.toLowerCase().includes("captcha") ? "자동가입 방지 확인에 실패했어요. 다시 시도해 주세요"
        : error.message.toLowerCase().includes("already registered") ? "이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요"
        : error.message,
      );
    // 이미 가입된 이메일: 이메일 인증이 켜져 있으면 Supabase 는 오류 대신 '로그인 수단(identities)이 빈' 가짜 결과를 돌려주고 메일도 보내지 않는다.
    // (구글로 가입한 이메일도 같다.) 이메일 칸이 있는 2단계로 돌려보낸다.
    if (data.user && data.user.identities?.length === 0) {
      setStep(2);
      return toast.error("이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요");
    }
    if (data.session) return void toast.success("가입을 환영합니다!"); // 이메일 인증 설정이 꺼진 경우 즉시 로그인
    setWait(RESEND_WAIT);
    setStep(4);
  };

  const resend = async () => {
    if (needCap()) return;
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: window.location.origin, captchaToken: cap.token } });
    cap.reset();
    if (error) return toast.error("잠시 후 다시 시도해 주세요");
    toast.success("인증 메일을 다시 보냈어요");
    setWait(RESEND_WAIT);
  };

  // 인증을 마쳤다고 눌렀을 때: 가입 때 입력한 비밀번호로 로그인해 보고, 아직이면 안내한다
  const checkVerified = async () => {
    if (needCap()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw, options: { captchaToken: cap.token } });
    setBusy(false);
    cap.reset();
    if (error) toast.error(error.message.toLowerCase().includes("confirm") ? "아직 이메일 인증이 확인되지 않았어요. 메일의 인증 링크를 눌러 주세요" : "로그인하지 못했어요. 로그인 탭에서 다시 시도해 주세요");
  };

  const titles = ["약관 동의", "기본 정보", "추가 정보", "이메일 인증"];
  return (
    <div>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-xl font-extrabold">회원가입 <span className="text-sm font-normal text-muted">({step}/4 · {titles[step - 1]})</span></h2>
        {step === 1 && (
          <>
            <p className="text-sm text-muted">서비스 이용을 위해 아래 내용을 확인하고 동의해 주세요.</p>
            <ConsentChecks value={consent} onChange={setConsent} />
            <Button type="button" className="w-full" onClick={toStep2}>다음</Button>
          </>
        )}
        {step === 2 && (
          <>
            <div><Label>이메일(아이디)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
            <div>
              <Label>비밀번호 ({MIN_PASSWORD}자 이상, 영문+숫자 필수·특수문자 사용 가능)</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </div>
            <div><Label>비밀번호 확인</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>성별</Label>
                <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">선택</option><option>남</option><option>여</option>
                </Select>
              </div>
            </div>
            <div><Label>생년월일 (만 14세 이상만 가입할 수 있어요)</Label><BirthSelect value={birth} onChange={setBirth} /></div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>이전</Button>
              <Button type="button" className="flex-1" onClick={toStep3} disabled={busy}>다음</Button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <ExtraFields value={extra} onChange={setExtra} onNickStatus={setNickOk} />
            {cap.widget}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>이전</Button>
              <Button className="flex-1" disabled={busy}>{busy ? "가입 중…" : "가입하고 인증 메일 받기"}</Button>
            </div>
          </>
        )}
        {step === 4 && (
          <div className="space-y-4 text-center">
            <MailCheck size={44} className="mx-auto text-brand" />
            <div>
              <p className="font-bold">인증 메일을 보냈어요</p>
              <p className="mt-1 break-all text-sm text-muted">{email}</p>
              <p className="mt-2 text-sm text-muted">메일의 인증 링크를 누르면 가입이 완료되고 바로 로그인돼요. 메일이 안 보이면 스팸함도 확인해 주세요.</p>
            </div>
            {cap.widget}
            <Button type="button" className="w-full" onClick={checkVerified} disabled={busy}>인증을 마쳤어요</Button>
            <Button type="button" variant="outline" className="w-full" onClick={resend} disabled={wait > 0}>{wait > 0 ? `인증 메일 다시 받기 (${wait}초)` : "인증 메일 다시 받기"}</Button>
            <button type="button" onClick={() => onDone?.()} className="text-sm text-muted underline hover:text-foreground">로그인 화면으로</button>
          </div>
        )}
      </form>
    </div>
  );
}
