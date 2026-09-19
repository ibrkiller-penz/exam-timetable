// 타입만 가져옵니다. 실제 모듈은 내보낼 때만 불러옵니다 (아래 downloadWorkbook).
// ExcelJS가 무거워, 함께 묶으면 엑셀을 한 번도 안 쓰는 사람까지 매번 받게 됩니다.
import type ExcelJS from 'exceljs';

/**
 * 서식을 갖춘 엑셀 내보내기.
 *
 * 예전에는 화면의 <table>을 그대로 긁어 시트로 만들었습니다. 그래서
 *  - 열 너비가 없어 날짜·과목이 `######`으로 나오고
 *  - 테두리도 굵은 글씨도 없어 어디가 제목인지 알 수 없고
 *  - 화면에만 쓰는 표까지 시트로 딸려 들어갔습니다.
 *
 * 이제 화면이 아니라 자료에서 바로 만듭니다. 종이로 뽑은 것과
 * 같은 모양이 나오도록 제목·머리글·테두리·열 너비를 여기서 한 번에 입힙니다.
 */

const NAVY = 'FF005691';
const HEAD_BG = 'FFEEF4F9';
const LINE = 'FF94A3B8';

export type CellValue = string | number | null | undefined;

export interface SheetSpec {
  /** 시트 이름. 엑셀이 금지하는 글자는 알아서 걸러냅니다. */
  name: string;
  /** 표 위에 크게 얹는 제목. */
  title?: string;
  /** 제목 아래 한 줄 설명 (시행일, 고사실 …). */
  subtitle?: string;
  /** 머리글. 두 줄이면 배열 두 개를 넣습니다. */
  headers: CellValue[][];
  rows: CellValue[][];
  /** 열 너비 (글자 수 기준). 없으면 내용에서 어림잡습니다. */
  widths?: number[];
  /** 'A1:C1' 같은 병합 범위. 행 번호는 제목·머리글을 포함한 최종 위치입니다. */
  merges?: string[];
  /** 가로로 눕혀 인쇄할지. */
  landscape?: boolean;
  /** 숫자로 두어야 계산이 되는 열 (0부터). */
  numericCols?: number[];
}

/** 시트 이름에 못 쓰는 글자를 걸러내고 31자로 자릅니다. */
const safeSheetName = (name: string, used: Set<string>): string => {
  let base = (name || '시트').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || '시트';
  let n = base;
  let i = 2;
  while (used.has(n)) n = `${base}(${i++})`;
  used.add(n);
  return n;
};

/** 한글은 영문보다 두 배쯤 넓어, 글자 수만 세면 열이 좁아집니다. */
const textWidth = (v: CellValue): number => {
  const s = v === null || v === undefined ? '' : String(v);
  return [...s].reduce((w, ch) => w + (/[\x00-\x7F]/.test(ch) ? 1 : 1.8), 0);
};

const thin = { style: 'thin' as const, color: { argb: LINE } };
const boxed = { top: thin, left: thin, bottom: thin, right: thin };

export function addSheet(wb: ExcelJS.Workbook, spec: SheetSpec, used: Set<string>) {
  const ws = wb.addWorksheet(safeSheetName(spec.name, used), {
    pageSetup: {
      paperSize: 9, // A4
      orientation: spec.landscape ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const colCount = Math.max(
    ...spec.headers.map(h => h.length),
    ...spec.rows.map(r => r.length),
    1
  );
  const lastCol = ws.getColumn(colCount).letter;

  let r = 0;

  if (spec.title) {
    r++;
    const row = ws.getRow(r);
    row.getCell(1).value = spec.title;
    row.getCell(1).font = { name: '맑은 고딕', size: 16, bold: true, color: { argb: NAVY } };
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = 26;
    ws.mergeCells(`A${r}:${lastCol}${r}`);
  }

  if (spec.subtitle) {
    r++;
    const row = ws.getRow(r);
    row.getCell(1).value = spec.subtitle;
    row.getCell(1).font = { name: '맑은 고딕', size: 10, color: { argb: 'FF64748B' } };
    row.getCell(1).alignment = { horizontal: 'center' };
    row.height = 16;
    ws.mergeCells(`A${r}:${lastCol}${r}`);
  }

  if (spec.title || spec.subtitle) r++; // 표와 제목 사이 한 줄 띄웁니다.

  const headerStart = r + 1;
  for (const h of spec.headers) {
    r++;
    const row = ws.getRow(r);
    h.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v ?? '';
      cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF00426E' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = boxed;
    });
    row.height = 20;
  }
  const headerEnd = r;

  for (const dataRow of spec.rows) {
    r++;
    const row = ws.getRow(r);
    for (let i = 0; i < colCount; i++) {
      const cell = row.getCell(i + 1);
      const v = dataRow[i];
      const numeric = spec.numericCols?.includes(i) && v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
      cell.value = numeric ? Number(v) : (v ?? '');
      cell.font = { name: '맑은 고딕', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = boxed;
    }
    row.height = 18;
  }

  // 열 너비 — 없으면 머리글과 내용 중 가장 긴 것에 맞춥니다.
  for (let i = 0; i < colCount; i++) {
    const given = spec.widths?.[i];
    if (given) {
      ws.getColumn(i + 1).width = given;
      continue;
    }
    const widest = Math.max(
      ...spec.headers.map(h => textWidth(h[i])),
      ...spec.rows.map(row => textWidth(row[i])),
      4
    );
    ws.getColumn(i + 1).width = Math.min(Math.max(widest + 2.5, 6), 40);
  }

  spec.merges?.forEach(range => {
    try { ws.mergeCells(range); } catch { /* 이미 병합된 범위는 넘어갑니다. */ }
  });

  // 머리글이 늘 보이도록 고정하고, 인쇄할 때도 장마다 반복합니다.
  if (headerEnd >= headerStart) {
    ws.views = [{ state: 'frozen', ySplit: headerEnd }];
    ws.pageSetup.printTitlesRow = `${headerStart}:${headerEnd}`;
  }

  return ws;
}

/** 시트 여러 장을 한 파일로 내려받습니다. */
export async function downloadWorkbook(specs: SheetSpec[], filename: string) {
  // 버튼을 누른 그 순간에 불러옵니다.
  const { default: ExcelJSRuntime } = await import('exceljs');
  const wb = new ExcelJSRuntime.Workbook();
  wb.creator = '고사시간표 시스템';
  wb.created = new Date();

  const used = new Set<string>();
  for (const spec of specs) addSheet(wb, spec, used);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
