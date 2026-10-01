"use client";
// 회원가입 (2단계): ① 기초 정보(이메일/비밀번호/성별/생년월일) → ② 추가 정보(종목·지역·신분·종별·닉네임·소속)
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { BirthSelect, isCompleteBirth } from "@/components/BirthSelect";
import { ExtraFields, emptyExtra, validateExtra } from "@/components/ProfileFields";

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [gender, setGender] = useState("");
  const [birth, setBirth] = useState("");
  const [extra, setExtra] = useState(emptyExtra);
  const [nickOk, setNickOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const next = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("올바른 이메일을 입력해 주세요");
    if (pw.length < 6) return toast.error("비밀번호는 6자 이상이어야 합니다");
    if (pw !== pw2) return toast.error("비밀번호가 일치하지 않습니다");
    if (!gender) return toast.error("성별을 선택해 주세요");
    if (!isCompleteBirth(birth)) return toast.error("생년월일(연/월/일)을 모두 선택해 주세요");
    // 이메일(아이디) 중복 확인: 2단계로 넘어가기 전에 검사
    setBusy(true);
    const { data, error } = await supabase.rpc("email_available", { e: email });
    setBusy(false);
    if (error) return toast.error("중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요");
    if (data !== true) return toast.error("이미 가입된 이메일입니다");
    setStep(2);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateExtra(extra);
    if (err) return toast.error(err);
    if (!nickOk) return toast.error("사용할 수 없는 닉네임입니다");
    setBusy(true);
    // 추가 정보는 user_metadata 로 보내고, DB 트리거(handle_new_user)가 profiles 행을 만들어 준다.
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: { data: { gender, birth_date: birth, ...extra } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data.session) toast.success("가입 완료! 이메일 인증 메일을 확인한 뒤 로그인해 주세요");
    else toast.success("가입을 환영합니다!");
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-lg border border-line bg-panel p-6">
        <h1 className="text-center text-xl font-bold">회원가입 ({step}/2)</h1>
        {step === 1 ? (
          <>
            <div><Label>이메일(아이디)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>비밀번호 (6자 이상)</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div><Label>비밀번호 확인</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>성별</Label>
                <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">선택</option><option>남</option><option>여</option>
                </Select>
              </div>
            </div>
            <div><Label>생년월일</Label><BirthSelect value={birth} onChange={setBirth} /></div>
            <Button type="button" className="w-full" onClick={next} disabled={busy}>다음</Button>
          </>
        ) : (
          <>
            <ExtraFields value={extra} onChange={setExtra} onNickStatus={setNickOk} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>이전</Button>
              <Button className="flex-1" disabled={busy}>가입하기</Button>
            </div>
          </>
        )}
        <p className="text-center text-sm text-muted">
          이미 계정이 있나요? <Link href="/login" className="text-brand">로그인</Link>
        </p>
        <Link href="/ranking" className="block text-center text-sm text-muted hover:text-foreground">회원가입하지 않고 이용하기</Link>
      </form>
    </div>
  );
}
