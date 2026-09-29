import { describe, it, expect } from 'vitest';
import { fitOnPaper, fitOnA4, PAPER_MM } from '../../src/pages/reports/pdfFit';

/**
 * 종이 크기.
 *
 * 전체 시간표를 B4 로 게시하는데, A4 로 만든 장을 B4 에 찍어 여백이 넓고
 * 글자가 작았다(최희정 선생님 제보). 인쇄와 PDF 가 모두 fitOnPaper 한 곳에서
 * 종이 크기를 가져온다.
 */
describe('종이 크기', () => {
  it('B4 는 복사기 B4(JIS) 257×364mm 이다 — 브라우저의 ISO B4(250×353)가 아니다', () => {
    expect(PAPER_MM.B4).toEqual([257, 364]);
  });

  it('가로로 놓으면 폭과 높이가 바뀐다', () => {
    const b4 = fitOnPaper(1000, 707, true, 'B4');
    expect(b4.pageW).toBe(364);
    expect(b4.pageH).toBe(257);
  });

  it('같은 장을 B4 에 앉히면 A4 보다 1.2배 넘게 커진다 — 글자가 커진다', () => {
    const a4 = fitOnPaper(2970, 2100, true, 'A4');
    const b4 = fitOnPaper(2970, 2100, true, 'B4');
    expect(b4.w / a4.w).toBeGreaterThan(1.2);
    // 가운데 놓이고 종이 밖으로 넘치지 않습니다.
    expect(b4.x).toBeGreaterThanOrEqual(0);
    expect(b4.x + b4.w).toBeLessThanOrEqual(b4.pageW);
    expect(b4.y + b4.h).toBeLessThanOrEqual(b4.pageH);
  });

  it('예전 이름(fitOnA4)은 A4 그대로다', () => {
    expect(fitOnA4(100, 141, false)).toEqual(fitOnPaper(100, 141, false, 'A4'));
  });
});
