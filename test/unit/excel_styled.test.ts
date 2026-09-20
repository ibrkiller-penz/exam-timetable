import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { addSheet } from '../../src/utils/excelStyled';

/**
 * 엑셀 내보내기가 실제로 서식을 갖추는지 확인합니다.
 *
 * 예전에는 화면의 표를 긁어 시트로 만들어, 열 너비가 없어 날짜가 '######'으로
 * 나오고 테두리도 굵은 글씨도 없었습니다. 눈으로만 확인하면 또 놓칩니다.
 */
describe('서식을 갖춘 엑셀', () => {
  const build = () => {
    const wb = new ExcelJS.Workbook();
    const used = new Set<string>();
    const ws = addSheet(wb, {
      name: '고사실 명단',
      title: '고사실 응시현황표',
      subtitle: '2026-10-12 1교시 · 3-1 · 한국사(1) · 27명',
      headers: [['연번', '학번', '성명', '좌석', '비고']],
      rows: [
        [1, '30101', '가나다', 1, ''],
        [2, '30109', '라마바', 2, '별도'],
      ],
      numericCols: [0, 3],
    }, used);
    return { wb, ws };
  };

  it('열 너비가 내용에 맞게 잡힌다', () => {
    const { ws } = build();
    // 한글 이름이 들어가는 성명 열은 숫자만 있는 연번 열보다 넓어야 합니다.
    const seq = ws.getColumn(1).width!;
    const name = ws.getColumn(3).width!;
    expect(seq).toBeGreaterThan(0);
    expect(name).toBeGreaterThan(seq);
  });

  it('제목은 표 너비만큼 병합되고 크게 쓰인다', () => {
    const { ws } = build();
    const title = ws.getCell('A1');
    expect(title.value).toBe('고사실 응시현황표');
    expect(title.font?.bold).toBe(true);
    expect(title.font?.size).toBeGreaterThanOrEqual(14);
    expect(ws.getCell('E1').isMerged).toBe(true);
  });

  it('머리글은 바탕색과 테두리를 갖는다', () => {
    const { ws } = build();
    // 제목 1줄 + 부제 1줄 + 빈 줄 1줄 = 머리글은 4행입니다.
    const head = ws.getCell('A4');
    expect(head.value).toBe('연번');
    expect(head.font?.bold).toBe(true);
    expect((head.fill as any)?.fgColor?.argb).toBeTruthy();
    expect(head.border?.bottom).toBeTruthy();
  });

  it('숫자 열은 글자가 아니라 숫자로 들어간다', () => {
    const { ws } = build();
    expect(ws.getCell('A5').value).toBe(1);   // 연번
    expect(ws.getCell('B5').value).toBe('30101'); // 학번은 0으로 시작할 수 있어 글자로 둡니다
    expect(ws.getCell('D5').value).toBe(1);   // 좌석
  });

  it('머리글이 고정되고 인쇄할 때 장마다 반복된다', () => {
    const { ws } = build();
    expect((ws.views[0] as any).state).toBe('frozen');
    expect(ws.pageSetup.printTitlesRow).toBe('4:4');
    expect(ws.pageSetup.fitToWidth).toBe(1);
  });

  it('시트 이름이 겹치거나 금지 글자를 쓰면 바로잡는다', () => {
    const wb = new ExcelJS.Workbook();
    const used = new Set<string>();
    const spec = { name: '3/1', headers: [['a']], rows: [['b']] };
    const a = addSheet(wb, spec as any, used);
    const b = addSheet(wb, spec as any, used);
    expect(a.name).toBe('3 1');
    expect(b.name).toBe('3 1(2)');
  });

  it('실제로 xlsx 파일로 써진다', async () => {
    const { wb } = build();
    const buf = await wb.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(1000);
    // xlsx는 zip입니다. 앞 두 글자가 PK여야 합니다.
    const head = Buffer.from(buf.slice(0, 2));
    expect(head.toString('latin1')).toBe('PK');
  });
});
