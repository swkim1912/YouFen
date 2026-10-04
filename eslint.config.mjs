import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 데이터 로딩용 useEffect 안에서 setState 를 호출하는 패턴을 이 프로젝트에서는 허용한다
  { rules: { "react-hooks/set-state-in-effect": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 디자인 스킬(impeccable·taste-skill) 설치 폴더 — 우리 코드가 아님
    ".claude/**",
    ".agents/**",
  ]),
]);

export default eslintConfig;
