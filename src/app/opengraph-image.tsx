// 링크 미리보기(카카오톡·문자·SNS) 대표 이미지 1200×630. 빌드할 때 한 번 만들어 정적 파일로 내보낸다(요청마다 그리지 않음).
// 하위 페이지도 따로 정하지 않으면 이 이미지를 같이 쓴다. Next 가 og:image / twitter:image 태그를 자동으로 넣는다.
// 디자인: 로그인 화면(AuthLanding)과 같은 브랜드 네이비 바탕 + 피스트 사선 무늬 + Sky 빛 번짐, 가운데 로고와 문구, 아래 티어 엠블럼 사다리.
// 글꼴: npm pretendard 의 OTF(빌드 때만 읽음, 외부 다운로드 없음). 로고·엠블럼은 public/ 의 SVG 를 그대로 넣는다.
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "유펜 YouFen — 내 전적부터 시즌 티어까지, 한 곳에서";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const W = 1200;
const H = 630;
const SKY = "#0CA4E1";
const TIERS = ["bronze", "silver", "gold", "platinum", "diamond", "master", "challenger"] as const;

const dataUri = (svg: Buffer | string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** 배경: 사선 줄무늬(아래로 갈수록 흐려짐) + 왼쪽·오른쪽 위 빛 번짐 — AuthLanding 배경을 그림 한 장으로 옮긴 것 */
function backgroundSvg() {
  const lines: string[] = [];
  // 115° 사선: x 방향으로 46px 간격, 화면 밖에서 시작해 전체를 덮는다
  for (let x = -H; x < W + H; x += 46) lines.push(`<line x1="${x}" y1="0" x2="${x - H * Math.tan((25 * Math.PI) / 180)}" y2="${H}" />`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.9" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
    <radialGradient id="g1" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${SKY}" stop-opacity="0.22"/><stop offset="1" stop-color="${SKY}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#0C86C0" stop-opacity="0.38"/><stop offset="1" stop-color="#0C86C0" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a1726"/>
  <circle cx="40" cy="380" r="420" fill="url(#g1)"/>
  <circle cx="1160" cy="-40" r="440" fill="url(#g2)"/>
  <g mask="url(#m)" stroke="${SKY}" stroke-opacity="0.11" stroke-width="1.5">${lines.join("")}</g>
</svg>`;
}

export default async function Image() {
  const root = process.cwd();
  const [font, fontBold, logo, ...emblems] = await Promise.all([
    readFile(join(root, "node_modules/pretendard/dist/public/static/Pretendard-SemiBold.otf")),
    readFile(join(root, "node_modules/pretendard/dist/public/static/Pretendard-ExtraBold.otf")),
    readFile(join(root, "public/brand/yf-logo-horizontal-dark.svg")),
    ...TIERS.map((t) => readFile(join(root, `public/tier/emblems/${t}-sm.svg`))),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", fontFamily: "Pretendard", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri(backgroundSvg())} width={W} height={H} alt="" style={{ position: "absolute", left: 0, top: 0 }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", paddingTop: 106 }}>
          {/* 작은 문구: — All You need to Fence */}
          <div style={{ display: "flex", alignItems: "center", fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.82)", letterSpacing: 1 }}>
            <div style={{ width: 44, height: 2, background: SKY, marginRight: 16 }} />
            <span>All&nbsp;</span>
            <span style={{ color: SKY }}>You</span>
            <span>&nbsp;need to Fence</span>
            <div style={{ width: 44, height: 2, background: SKY, marginLeft: 16 }} />
          </div>

          {/* 로고 (1111×279 비율) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(logo)} width={598} height={150} alt="" style={{ marginTop: 34 }} />

          {/* 한 줄 소개 */}
          <div style={{ display: "flex", marginTop: 30, fontSize: 40, fontWeight: 800, letterSpacing: -0.5 }}>
            <span>내 전적부터 시즌 티어까지,&nbsp;</span>
            <span style={{ color: SKY }}>한 곳에서.</span>
          </div>

          {/* 티어 엠블럼 사다리 (낮음 → 높음) */}
          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 46, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            {emblems.map((svg, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={TIERS[i]} src={dataUri(svg)} width={64} height={64} alt="" style={{ margin: "0 14px", transform: `translateY(${(TIERS.length - 1 - i) * -3}px)` }} />
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Pretendard", data: font, style: "normal", weight: 600 },
        { name: "Pretendard", data: fontBold, style: "normal", weight: 800 },
      ],
    }
  );
}
