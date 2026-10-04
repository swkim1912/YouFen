# YouFen 로고 파일

최종 시안 B (스포티 이탤릭). 모든 SVG는 텍스트 없이 path만 사용 — 폰트 로딩 불필요.

| 파일 | 용도 |
|---|---|
| `yf-symbol.svg` | 심볼(YF 칼 마크), 컬러, 투명 배경 · viewBox 294×279 |
| `yf-symbol-white.svg` | 심볼 흰색 단색 (하늘색/어두운 배경 위) |
| `yf-logo-horizontal.svg` | 가로형: 심볼 + YouFen (You #0CA4E1 / Fen #0C86C0), 밝은 배경용 |
| `yf-logo-horizontal-dark.svg` | 가로형 어두운 배경용 (You #FFFFFF / Fen #0CA4E1), 권장 배경 #0E2236 |
| `yf-wordmark.svg` / `yf-wordmark-dark.svg` | 워드마크만 |
| `yf-app-icon.svg` | 앱 아이콘: 하늘색 둥근 사각형(rx 25%) + 흰 심볼 |
| `yf-app-icon-{512,256,192,180,32}.png` | 위 아이콘 PNG (PWA 512/192, apple-touch 180, 파비콘 32) |
| `yf-symbol.png`, `yf-symbol-white.png` | 초기 래스터 컷(294×279). SVG 사용 권장 |

- 색: Sky `#0CA4E1` · Blue `#0C86C0` · Navy `#0E2236`
- 워드마크: Saira Bold Italic(wght 700, wdth 100), 자간 -0.01em, 커닝 적용 후 outline 변환. Saira는 SIL Open Font License.
- 심볼은 원본 이미지(제미나이 생성)를 트레이싱한 벡터입니다.
- 여백: 로고 주변에 최소 심볼 높이의 1/4 여백을 두세요. 심볼 최소 크기 약 24px (그 이하에서는 칼날이 뭉개짐).
