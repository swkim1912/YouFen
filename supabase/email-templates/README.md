# 인증 메일 문구 (Supabase Auth 템플릿)

적용 위치: Supabase 대시보드 → **Authentication → Emails → Templates**. 탭마다 **Subject**(제목)와 **Message body**(본문, 아래 파일 내용 전체)를 붙여 넣고 저장한다.
본문 안의 `{{ .ConfirmationURL }}`, `{{ .Token }}` 은 Supabase 가 실제 링크·코드로 바꿔 넣는 자리라 **그대로 둔다.**

| 대시보드 탭 | 제목(Subject) | 본문 파일 | 유펜에서 쓰는 곳 |
|---|---|---|---|
| Confirm signup | `[유펜] 이메일 인증을 완료해 주세요` | `confirm-signup.html` | 회원가입 4단계 인증 메일·재발송 |
| Reset Password | `[유펜] 비밀번호 재설정 안내` | `reset-password.html` | `/reset-password` |
| Reauthentication | `[유펜] 비밀번호 변경 인증 코드` | `reauthentication.html` | 상세 설정 > 비밀번호 변경(`PasswordChange`) |
| Change Email Address | `[유펜] 이메일 주소 변경 확인` | `change-email.html` | (화면 기능 없음 — Secure email change 대비) |
| Magic Link | `[유펜] 로그인 링크` | `magic-link.html` | (지금은 안 씀) |
| Invite user | `[유펜] 유펜에 초대되었습니다` | `invite.html` | (대시보드에서 직접 초대할 때) |

작성 원칙(스팸 분류 방지, Supabase 권장): 광고·소개 문구 없이 짧게, 링크·이미지 최소, 사용자 입력값(닉네임 등) 넣지 않기. 발송: Gmail SMTP(개인정보 처리방침 5항 Google LLC 항목에 기재).
