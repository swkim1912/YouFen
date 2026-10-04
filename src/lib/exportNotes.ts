// 피드백 노트 내보내기: CSV(엑셀에서 바로 열림) 또는 엑셀(.xlsx) 파일로 내려받는다. 모두 브라우저 안에서 만들며 서버로 보내지 않는다.
// - CSV 는 UTF-8 BOM 을 붙여 엑셀에서 한글이 깨지지 않게 하고, = + - @ 로 시작하는 칸은 수식으로 실행되지 않게 앞에 ' 를 붙인다.
// - xlsx 는 필요한 최소 XML 파일들을 fflate 로 zip 해서 만든다(문자열은 inlineStr 이라 수식으로 해석되지 않는다).
import type { FeedbackNote } from "./types";
import type { RecordView } from "./records";

const KIND_LABEL: Record<string, string> = { PRIVATE: "프라이빗", OPEN: "오픈", TOURNAMENT: "대회" };
const HEADER = ["작성일", "제목", "내용", "연결된 경기", "상대", "내 점수", "상대 점수", "경기 종류", "경기일"];

const pad = (n: number) => String(n).padStart(2, "0");
const dt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const day = (iso: string) => dt(iso).slice(0, 10);

/** 노트 → 표(첫 줄 머리글). 경기와 연결된 노트는 상대·점수·종류·경기일도 채운다 */
export function notesToRows(notes: FeedbackNote[], games: Map<string, RecordView>): string[][] {
  const rows = notes.map((n) => {
    const g = n.game_id ? games.get(n.game_id) : undefined;
    return [
      dt(n.created_at), n.title ?? "", n.content,
      g ? "예" : "아니오(독립 노트)", g?.oppName ?? "", g ? String(g.mine) : "", g ? String(g.theirs) : "",
      g ? KIND_LABEL[g.rec.kind] ?? g.rec.kind : "", g ? day(g.rec.played_at) : "",
    ];
  });
  return [HEADER, ...rows];
}

/** 수식 주입 방지: 수식 문자로 시작하면 ' 를 앞에 붙인다 */
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function toCsv(rows: string[][]): string {
  const q = (s: string) => `"${safe(s).replace(/"/g, '""')}"`;
  return "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n");
}

const xmlEsc = (s: string) =>
  // XML 1.0 에서 쓸 수 없는 제어문자는 지우고 특수문자는 이스케이프
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function colName(i: number) {
  return String.fromCharCode(65 + i); // 9칸 이하라 A~I
}

export async function toXlsx(rows: string[][]): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import("fflate");
  const widths = [17, 24, 60, 18, 14, 9, 9, 11, 12];
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => `<c r="${colName(ci)}${ri + 1}" t="inlineStr" s="${ri === 0 ? 2 : 1}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`)
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const x = (s: string) => strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + s);
  return zipSync({
    "[Content_Types].xml": x('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    "_rels/.rels": x('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": x('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="피드백 노트" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": x('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    // 서식: 0=기본 1=줄바꿈+위쪽 정렬 2=머리글(굵게)
    "xl/styles.xml": x('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Malgun Gothic"/></font><font><b/><sz val="11"/><name val="Malgun Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    "xl/worksheets/sheet1.xml": x(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

/** 브라우저 다운로드 */
export function download(data: BlobPart | Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportFilename = (ext: string) => {
  const d = new Date();
  return `유펜_피드백노트_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.${ext}`;
};
