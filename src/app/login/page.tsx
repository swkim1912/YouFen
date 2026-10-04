"use client";
// 로그인 페이지: 랜딩 카드(로그인 탭). 이미 로그인 상태면 마이 펜싱으로.
import { AuthLanding } from "@/components/auth/AuthLanding";

export default function LoginPage() {
  return <AuthLanding initial="login" redirectIfAuthed />;
}
