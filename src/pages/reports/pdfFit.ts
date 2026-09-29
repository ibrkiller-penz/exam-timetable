/**
 * 뜬 그림을 A4 한 장에 앉히는 계산. 인쇄·PDF 가 모두 이 한 곳을 씁니다.
 *
 * 각자 계산하던 때에는 같은 인쇄물인데도 PDF 는 종이에 꽉 차고 인쇄는 조금
 * 작게 나오는 식으로 어긋났습니다. 여백과 비율을 여기서 한 번만 정합니다.
 */

/** 종이 가장자리 여백. 프린터가 물리적으로 못 찍는 자리를 피합니다. */
export const PAGE_MARGIN_MM = 5;

export interface A4Fit {
  pageW: number; pageH: number;
  x: number; y: number; w: number; h: number;
}

/** 종이 크기. */
export type PaperSize = 'A4' | 'B4';

/**
 * 종이 크기(mm, 세로로 놓았을 때 폭×높이).
 * B4 는 학교 복사기의 B4(JIS, 257×364mm) 입니다. 브라우저의 'B4' 는 ISO B4
 * (250×353mm)라 복사기 B4 와 조금 달라, 숫자로 못 박습니다.
 */
export const PAPER_MM: Record<PaperSize, [number, number]> = {
  A4: [210, 297],
  B4: [257, 364],
};

/**
 * 비율을 지킨 채 종이 안에 넣고 가운데 놓습니다.
 * 억지로 늘리면 글자가 눌리고, 넘치면 가장자리가 잘립니다.
 *
 * B4 에는 같은 장을 그대로 키워 앉힙니다. A4 와 B4 는 가로세로 비율이 거의
 * 같아서(1:1.414 / 1:1.416), 여백은 그대로이고 글자가 1.22배 커집니다.
 * 예전에는 A4 크기로 만든 장을 B4 에 찍어 위아래 좌우 여백이 넓고 글자가 작았습니다.
 */
export function fitOnPaper(canvasW: number, canvasH: number, landscape: boolean, paper: PaperSize = 'A4'): A4Fit {
  const [pw, ph] = PAPER_MM[paper];
  const pageW = landscape ? ph : pw;
  const pageH = landscape ? pw : ph;
  const boxW = pageW - PAGE_MARGIN_MM * 2;
  const boxH = pageH - PAGE_MARGIN_MM * 2;

  const ratio = canvasW / canvasH;
  let w = boxW;
  let h = boxW / ratio;
  if (h > boxH) { h = boxH; w = boxH * ratio; }

  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

/** A4 에 앉힙니다. 예전 이름을 쓰는 곳을 위해 둡니다. */
export function fitOnA4(canvasW: number, canvasH: number, landscape: boolean): A4Fit {
  return fitOnPaper(canvasW, canvasH, landscape, 'A4');
}
