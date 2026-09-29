import { useState, useCallback } from 'react';
import { beginCapture, nextFrame } from './printAsImage';
import { fitOnPaper, PAPER_MM, PaperSize } from './pdfFit';
import { capturePage } from './capturePage';

/**
 * 인쇄물을 PDF 파일로 저장합니다.
 *
 * 인쇄 대화상자에서 'PDF로 저장'을 고르는 것과 같지만, 학교에서는 파일로
 * 보관하고 메신저로 돌리는 일이 잦아 버튼 하나로 끝나는 편이 낫습니다.
 *
 * 화면에 그려진 `.print-page` 한 장을 그대로 그림으로 떠서 A4에 얹습니다.
 * 보이는 것과 다르게 나올 여지가 없다는 것이 이 방식의 장점입니다.
 *
 * 무거운 라이브러리(jsPDF, 캡처 엔진)는 버튼을 누른 그 순간에 불러옵니다.
 */
export function usePdfSave() {
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  /**
   * @param filename 저장할 파일 이름
   * @param prepare  모든 장을 먼저 화면에 그려야 할 때 (전체 저장). 끝나면 되돌리는 함수를 돌려줍니다.
   * @param paper    종이 크기. 없으면 A4.
   */
  const savePdf = useCallback(async (filename: string, prepare?: () => () => void, paper: PaperSize = 'A4') => {
    const restore = prepare?.();
    // 창이 좁아 줄어든 페이지를 원래 A4 폭으로 되돌린 뒤에 뜹니다.
    // 인쇄(printAsImage)와 같은 조건이라, PDF 와 종이가 서로 다르지 않습니다.
    const endCapture = beginCapture();
    // 화면이 다 그려진 다음에 떠야 합니다.
    // 창이 가려져 있으면 requestAnimationFrame 이 멈춥니다. PDF 를 누르고 다른 창으로
    // 넘어가면 저장이 '1/1장' 에서 멈춰 있었습니다. 인쇄와 같은 기다림을 씁니다
    // (다음 그림 또는 0.12초, 먼저 오는 쪽).
    await nextFrame();
    await nextFrame();

    const pages = Array.from(document.querySelectorAll<HTMLElement>('.print-page'));
    if (pages.length === 0) {
      endCapture();
      restore?.();
      alert('저장할 내용이 없습니다.');
      return;
    }

    setSaving(true);
    setProgress({ current: 1, total: pages.length });

    try {
      const { default: jsPDF } = await import('jspdf');

      let pdf: InstanceType<typeof jsPDF> | null = null;

      for (let i = 0; i < pages.length; i++) {
        setProgress({ current: i + 1, total: pages.length });
        const el = pages[i];
        // 가로로 뽑을 장인지 그 장 자신에게 물어봅니다.
        const landscape = el.classList.contains('page-landscape');

        // 종이에 뽑을 것이므로 화면보다 크게 뜹니다. 3배면 A4 기준 대략 290dpi 입니다.
        // 브라우저가 화면 그대로 그리게 합니다. 글자가 밀리지 않습니다(capturePage 참고).
        const canvas = await capturePage(el, 3);

        /*
         * PDF 에는 JPEG(품질 0.95)로 넣습니다.
         *
         * PNG 가 파일은 더 작지만, jsPDF 가 PNG 를 풀었다가 다시 압축하느라
         * 한 장에 1초씩 걸립니다. 봉투 라벨 49장이면 2분이 넘습니다. JPEG 는
         * 그대로 들어가 한 장에 0.004초입니다.
         *
         * 화질은 재어 보고 정했습니다. 같은 장을 PNG 와 견주면 화소 평균 오차가
         * 0.89/255 이고, 눈에 띌 만큼(32 넘게) 다른 점은 0.002% 입니다.
         * 3배(약 290dpi)로 뜨므로 종이에서는 구별되지 않습니다.
         *
         * 인쇄(printAsImage)는 이 단계가 없어 PNG 그대로 둡니다.
         */
        const img = canvas.toDataURL('image/jpeg', 0.95);

        // 여백과 비율 계산은 인쇄와 같은 곳(pdfFit)에서 가져옵니다.
        const { x, y, w, h } = fitOnPaper(canvas.width, canvas.height, landscape, paper);
        const format = PAPER_MM[paper];   // [폭, 높이] mm — 방향은 orientation 이 돌립니다

        if (!pdf) {
          pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format, compress: true });
        } else {
          pdf.addPage(format, landscape ? 'landscape' : 'portrait');
        }
        pdf.addImage(img, 'JPEG', x, y, w, h, undefined, 'FAST');
      }

      pdf?.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    } catch (err) {
      console.error('PDF 저장 실패:', err);
      alert('PDF로 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      endCapture();
      setSaving(false);
      restore?.();
    }
  }, []);

  return { saving, progress, savePdf };
}
