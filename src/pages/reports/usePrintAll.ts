import { useState, useCallback } from 'react';
import { printAsImage } from './printAsImage';

/**
 * '전체 출력'.
 *
 * 고사실이 열 곳이면 날짜·교시를 바꿔 가며 열 번 인쇄해야 했습니다.
 * 잠깐 모든 장을 그려 놓고 한 번에 인쇄한 뒤, 다시 보던 장으로 돌아옵니다.
 *
 * 인쇄는 화면에 그려진 장을 그대로 그림으로 떠서 A4 에 얹는 방식입니다.
 * 브라우저가 인쇄용으로 다시 그리며 표가 잘리던 문제를 피합니다.
 * 자세한 까닭은 printAsImage.ts 에 적어 두었습니다.
 */
export function usePrintAll() {
  const [printingAll, setPrintingAll] = useState(false);

  const printAll = useCallback(() => {
    setPrintingAll(true);
    // 모든 장이 화면에 그려진 뒤에 떠야 합니다. 바로 뜨면 보던 장 하나만 나옵니다.
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          await printAsImage();
        } finally {
          setPrintingAll(false);
        }
      });
    });
  }, []);

  return { printingAll, setPrintingAll, printAll };
}
