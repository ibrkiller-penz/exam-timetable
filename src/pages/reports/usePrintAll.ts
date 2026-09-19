import { useState, useCallback } from 'react';

/**
 * '전체 출력'.
 *
 * 고사실이 열 곳이면 날짜·교시를 바꿔 가며 열 번 인쇄해야 했습니다.
 * 잠깐 모든 장을 그려 놓고 한 번에 인쇄한 뒤, 다시 보던 장으로 돌아옵니다.
 *
 * 화면을 그린 다음에 인쇄해야 하므로 한 번 쉬었다가(requestAnimationFrame)
 * window.print()를 부릅니다. 바로 부르면 보던 장 하나만 나옵니다.
 */
export function usePrintAll() {
  const [printingAll, setPrintingAll] = useState(false);

  const printAll = useCallback(() => {
    setPrintingAll(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setPrintingAll(false);
      });
    });
  }, []);

  return { printingAll, printAll };
}
