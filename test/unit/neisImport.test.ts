import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';

describe('neisImport', () => {
  it('parses valid NEIS workbook with padding and removes non-students while keeping empty names', () => {
    const rawRows = makeNeisRows({ includeInvalid: true });
    const buffer = makeNeisWorkbook(rawRows);
    const res = parseNeisFile(buffer);

    expect(res.removedCount).toBe(1);
    expect(res.rows.length).toBe(rawRows.length - 1);
    expect(res.rows[0].ban).toBe('01반');
    expect(res.rows.some(r => r.name.includes('미재학'))).toBe(false);
    expect(res.rows.some(r => r.name === '')).toBe(true);
  });

  it('works seamlessly when all student names are empty', () => {
    const rawRows = makeNeisRows().map(r => ({ ...r, name: '' }));
    const buffer = makeNeisWorkbook(rawRows);
    const res = parseNeisFile(buffer);

    expect(res.removedCount).toBe(0);
    expect(res.rows.length).toBe(rawRows.length);
    expect(res.rows.every(r => r.name === '')).toBe(true);
  });

  it('correctly parses user real excel files without student names', () => {
    const fs = require('fs');
    const path = require('path');
    const f2 = 'C:/Users/pc/Desktop/안티그래비티 결과/시험 시간표 소스/학생편성현황(2026학년도  2학기  2)이름삭제.xlsx';
    if (fs.existsSync(f2)) {
      const buf = fs.readFileSync(f2);
      const res2 = parseNeisFile(buf);
      expect(res2.rows.length).toBe(2050);
      expect(res2.rows[0].subject).toBe('독서와 작문(4)');
    }

    const f3 = 'C:/Users/pc/Desktop/안티그래비티 결과/시험 시간표 소스/학생편성현황(2026학년도  2학기  3)이름삭제.xlsx';
    if (fs.existsSync(f3)) {
      const buf3 = fs.readFileSync(f3);
      const res3 = parseNeisFile(buf3);
      expect(res3.rows.length).toBe(1946);
      expect(res3.rows[0].subject).toBe('고전문학 감상(4)');
    }
  });
});
