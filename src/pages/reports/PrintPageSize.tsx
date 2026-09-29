import React from 'react';
import { PAPER_MM, PaperSize } from './pdfFit';

/**
 * 이 인쇄물이 쓸 용지 방향.
 *
 * 예전에는 이름 붙인 페이지(`@page a4-landscape` + `page: a4-landscape`)로
 * 방향을 정했습니다. 그런데 브라우저는 이름이 다른 페이지를 만나면 새 장을
 * 시작하기 때문에, 첫 장이 백지로 나오고 내용이 2쪽부터 밀려 나왔습니다.
 *
 * 한 번에 한 가지 인쇄물만 화면에 있으므로, @page 하나를 그때그때 바꿉니다.
 */
export const PrintPageSize: React.FC<{ landscape?: boolean; paper?: PaperSize }> = ({ landscape, paper = 'A4' }) => {
  const [pw, ph] = PAPER_MM[paper];
  const [w, h] = landscape ? [ph, pw] : [pw, ph];
  return (
    <style>
      {`@media print { @page { size: ${w}mm ${h}mm; margin: ${landscape ? '10mm' : '12mm'}; } }`}
    </style>
  );
};
