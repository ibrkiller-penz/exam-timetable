import { useState, useCallback } from 'react';
import { beginCapture } from './printAsImage';
import { fitOnA4 } from './pdfFit';

/**
 * 인쇄물을 PDF 파일로 저장합니다.
 *
 * 인쇄 대화상자에서 'PDF로 저장'을 고르는 것과 같지만, 학교에서는 파일로
 * 보관하고 메신저로 돌리는 일이 잦아 버튼 하나로 끝나는 편이 낫습니다.
 *
 * 화면에 그려진 `.print-page` 한 장을 그대로 그림으로 떠서 A4에 얹습니다.
 * 보이는 것과 다르게 나올 여지가 없다는 것이 이 방식의 장점입니다.
 *
 * 무거운 라이브러리(jsPDF, html2canvas)는 버튼을 누른 그 순간에 불러옵니다.
 */
export function usePdfSave() {
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  /**
   * @param filename 저장할 파일 이름
   * @param prepare  모든 장을 먼저 화면에 그려야 할 때 (전체 저장). 끝나면 되돌리는 함수를 돌려줍니다.
   */
  const savePdf = useCallback(async (filename: string, prepare?: () => () => void) => {
    const restore = prepare?.();
    // 창이 좁아 줄어든 페이지를 원래 A4 폭으로 되돌린 뒤에 뜹니다.
    // 인쇄(printAsImage)와 같은 조건이라, PDF 와 종이가 서로 다르지 않습니다.
    const endCapture = beginCapture();
    // 화면이 다 그려진 다음에 떠야 합니다.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

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
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      let pdf: InstanceType<typeof jsPDF> | null = null;

      for (let i = 0; i < pages.length; i++) {
        setProgress({ current: i + 1, total: pages.length });
        const el = pages[i];
        // 가로로 뽑을 장인지 그 장 자신에게 물어봅니다.
        const landscape = el.classList.contains('page-landscape');

        const canvas = await html2canvas(el, {
          scale: 2.5,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const img = canvas.toDataURL('image/jpeg', 0.92);

        // 여백과 비율 계산은 인쇄와 같은 곳(pdfFit)에서 가져옵니다.
        const { x, y, w, h } = fitOnA4(canvas.width, canvas.height, landscape);

        if (!pdf) {
          pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
        } else {
          pdf.addPage('a4', landscape ? 'landscape' : 'portrait');
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
