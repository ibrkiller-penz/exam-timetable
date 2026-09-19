import * as XLSX from 'xlsx';
import { NeisRow } from './types';
import { MSG } from './messages';

export interface ParseResult {
  rows: NeisRow[];
  removedCount: number;
  warnings: string[];
}

export function parseNeisFile(buffer: ArrayBuffer | Uint8Array): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error(MSG.NEIS_NOT_FILE_1);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(MSG.NEIS_NOT_FILE_1);

  let R1: { r: number; c: number } | null = null;
  let R2: { r: number; c: number } | null = null;
  let R_num: { r: number; c: number } | null = null;
  let hasRoomHeader = false;

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  let headerRow = -1;
  const cols: Partial<Record<'year' | 'semester' | 'grade' | 'curriculum' | 'subject' | 'room' | 'track' | 'ban' | 'num' | 'name', number>> = {};

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v === undefined || cell.v === null) continue;
      const strVal = String(cell.v).trim();
      if (strVal === '학년도' && headerRow === -1) {
        headerRow = r;
      }
    }
    if (headerRow !== -1) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
        if (!cell || cell.v === undefined || cell.v === null) continue;
        const strVal = String(cell.v).trim();
        if (strVal === '학년도') cols.year = c;
        else if (strVal === '학기') cols.semester = c;
        else if (strVal === '학년') cols.grade = c;
        else if (strVal.includes('편제') || strVal.includes('과정')) cols.curriculum = c;
        else if (strVal.includes('과목')) cols.subject = c;
        else if (strVal.includes('강의실')) cols.room = c;
        else if (strVal.includes('계열') || strVal.includes('학과')) cols.track = c;
        else if (strVal === '반' || strVal.includes('학반')) cols.ban = c;
        else if (strVal === '번호') cols.num = c;
        else if (strVal === '성명' || strVal === '이름' || strVal.includes('성명')) cols.name = c;
      }
      break;
    }
  }

  if (headerRow === -1 || cols.year === undefined) throw new Error(MSG.NEIS_NOT_FILE_1);
  if (cols.room === undefined) throw new Error(MSG.NEIS_NOT_FILE_2);
  if (cols.subject === undefined || cols.ban === undefined) throw new Error(MSG.NEIS_NOT_FILE_1);

  const rawRows: NeisRow[] = [];

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const getVal = (col?: number): string => {
      if (col === undefined) return '';
      const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
      return cell && cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '';
    };

    const subject = getVal(cols.subject);
    const ban = getVal(cols.ban);
    if (!subject && !ban) continue;

    const numParsed = Number(getVal(cols.num));
    const num = isNaN(numParsed) ? 0 : numParsed;
    const room = getVal(cols.room);

    rawRows.push({
      year: getVal(cols.year),
      semester: getVal(cols.semester),
      grade: getVal(cols.grade),
      curriculum: getVal(cols.curriculum),
      subject,
      room,
      track: getVal(cols.track),
      ban,
      num,
      name: getVal(cols.name),
      room2: room,
    });
  }

  const removed = rawRows.filter(r => r.name.includes('(미재학)'));
  let rows = rawRows.filter(r => !r.name.includes('(미재학)'));

  const needsPadding = rows.some(r => /^\d{2,}반$/.test(r.ban) || r.ban === '10반' || r.ban === '11반');
  if (needsPadding) {
    rows.forEach(r => {
      if (/^\d반$/.test(r.ban)) {
        r.ban = '0' + r.ban;
      }
    });
  }

  // Normalize rooms for 위탁 students who belong to a regular home class
  const normalRoomMap = new Map<string, string>();
  for (const r of rows) {
    if (r.room && !r.room.includes('위탁') && r.ban) {
      normalRoomMap.set(`${r.subject}__${r.ban}`, r.room);
    }
  }

  for (const r of rows) {
    if (r.room && r.room.includes('위탁') && r.ban) {
      const match = normalRoomMap.get(`${r.subject}__${r.ban}`);
      if (match) {
        r.room = match;
        r.room2 = match;
      }
    }
  }

  const warnings: string[] = [];
  const distinctGrades = new Set(rows.map(r => r.grade.charAt(0)).filter(Boolean));
  if (distinctGrades.size > 1) {
    warnings.push('MULTI_GRADE: 학년이 혼재되어 있습니다.');
  }

  return {
    rows,
    removedCount: removed.length,
    warnings,
  };
}
