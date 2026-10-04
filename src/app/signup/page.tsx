"use client";
// 회원가입 페이지: 랜딩 카드(회원가입 탭). 가입 폼 본체는 components/auth/SignupForm.tsx
import { AuthLanding } from "@/components/auth/AuthLanding";

export default function SignupPage() {
  return <AuthLanding initial="signup" redirectIfAuthed />;
}
