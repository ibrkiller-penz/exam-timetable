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

/**
 * 비율을 지킨 채 종이 안에 넣고 가운데 놓습니다.
 * 억지로 늘리면 글자가 눌리고, 넘치면 가장자리가 잘립니다.
 */
export function fitOnA4(canvasW: number, canvasH: number, landscape: boolean): A4Fit {
  const pageW = landscape ? 297 : 210;
  const pageH = landscape ? 210 : 297;
  const boxW = pageW - PAGE_MARGIN_MM * 2;
  const boxH = pageH - PAGE_MARGIN_MM * 2;

  const ratio = canvasW / canvasH;
  let w = boxW;
  let h = boxW / ratio;
  if (h > boxH) { h = boxH; w = boxH * ratio; }

  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}
