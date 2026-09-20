/**
 * 화면에 보이는 그대로 인쇄합니다.
 *
 * 왜 이렇게 하나.
 *   브라우저 인쇄는 화면과 다른 규칙으로 다시 그립니다. 표 너비, 줄바꿈,
 *   글자 크기가 조금씩 달라지면서 오른쪽이 잘리거나 한 줄이 다음 장으로
 *   넘어가는 일이 반복됐습니다. @page 와 여백을 아무리 맞춰도, 브라우저와
 *   프린터 드라이버마다 결과가 달라 끝이 없었습니다.
 *
 *   그래서 화면에 그려진 한 장을 '사진처럼' 떠서, 그 그림을 A4 안에
 *   비율 그대로 넣고 인쇄합니다. 화면에서 잘 보이면 종이에서도 똑같이
 *   나옵니다. PDF 저장이 이미 이 방식이고, 인쇄도 같은 길로 보냅니다.
 *
 * 무거운 라이브러리(html2canvas)는 인쇄를 누른 그 순간에 불러옵니다.
 */

import { fitOnA4, PAGE_MARGIN_MM } from './pdfFit';

/**
 * 그림을 뜨는 동안에만 붙는 표시.
 * 창이 좁아 줄어든 페이지를 원래 A4 폭으로 되돌립니다(index.css 의 .capturing).
 * 인쇄와 PDF 가 같은 조건에서 뜨도록 여기서 내보냅니다.
 */
export function beginCapture(): () => void {
  document.documentElement.classList.add('capturing');
  return () => document.documentElement.classList.remove('capturing');
}

/** 진행 상황을 알리는 간단한 덮개. 리액트 밖에서 쓰므로 직접 만듭니다. */
function showBusy(): { step: (cur: number, total: number) => void; close: () => void } {
  const wrap = document.createElement('div');
  wrap.className = 'no-print';
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';

  const box = document.createElement('div');
  box.style.cssText =
    'background:#fff;border-radius:16px;padding:24px 32px;box-shadow:0 20px 40px rgba(0,0,0,.25);text-align:center;font-family:inherit';
  box.innerHTML =
    '<p style="font-weight:900;color:#1e293b;margin:0 0 6px">인쇄 준비 중…</p>' +
    '<p data-n style="font-weight:700;color:#64748b;margin:0;font-size:14px">1 / 1 장</p>';

  wrap.appendChild(box);
  document.body.appendChild(wrap);

  const n = box.querySelector('[data-n]') as HTMLElement;
  return {
    step: (cur, total) => { n.textContent = `${cur} / ${total} 장`; },
    close: () => { wrap.remove(); },
  };
}

export interface PrintAsImageOptions {
  /** 어떤 요소를 한 장으로 볼지. 기본은 인쇄물 공통 클래스입니다. */
  selector?: string;
  /**
   * 용지 방향. 주지 않으면 첫 장에 붙은 `page-landscape` 로 알아냅니다.
   * (한 인쇄물 안에서는 방향이 섞이지 않습니다.)
   */
  landscape?: boolean;
  /**
   * 그림을 얼마나 크게 뜰지. 클수록 글자가 또렷하지만 느려집니다.
   * 2.5 면 A4 기준 대략 200dpi 로, 표와 한글이 깨끗하게 나옵니다.
   */
  scale?: number;
}

export async function printAsImage(opts: PrintAsImageOptions = {}): Promise<void> {
  const selector = opts.selector ?? '.print-page';
  const pages = Array.from(document.querySelectorAll<HTMLElement>(selector));

  // 뜰 것이 없으면 예전처럼 브라우저 인쇄에 맡깁니다. 빈손으로 돌아가는 것보다 낫습니다.
  if (pages.length === 0) {
    window.print();
    return;
  }

  const landscape = opts.landscape ?? pages[0].classList.contains('page-landscape');
  const busy = showBusy();
  const endCapture = beginCapture();

  try {
    const { default: html2canvas } = await import('html2canvas');

    const images: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      busy.step(i + 1, pages.length);
      // 한 장 뜰 때마다 화면에 숨 쉴 틈을 줍니다. 안 그러면 덮개의 숫자가 멈춰 보입니다.
      await new Promise(r => requestAnimationFrame(() => r(null)));

      const canvas = await html2canvas(pages[i], {
        scale: opts.scale ?? 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      images.push(canvas.toDataURL('image/jpeg', 0.94));
    }

    await printImages(images, landscape);
  } catch (err) {
    console.error('인쇄 준비 실패:', err);
    // 그림으로 뜨지 못했더라도 인쇄 자체는 되게 합니다.
    window.print();
  } finally {
    endCapture();
    busy.close();
  }
}

/**
 * 뜬 그림들을 숨은 iframe 에 얹어 인쇄합니다.
 *
 * 한 장짜리 칸(printable area)을 정확한 mm 로 만들고, 그림은 그 안에서
 * 비율을 지킨 채 최대로 키웁니다. 칸보다 커질 수 없으니 잘릴 일이 없습니다.
 */
function printImages(images: string[], landscape: boolean): Promise<void> {
  return new Promise(resolve => {
    // 여백과 비율은 PDF 저장과 같은 계산을 씁니다(pdfFit).
    const margin = PAGE_MARGIN_MM;
    const box = fitOnA4(1, 1, landscape);
    const boxW = box.pageW - margin * 2;
    const boxH = box.pageH - margin * 2;

    const old = document.getElementById('image-print-iframe');
    if (old) old.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'image-print-iframe';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) { resolve(); return; }

    doc.open();
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>인쇄</title><style>' +
      `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${margin}mm; }` +
      'html,body { margin:0; padding:0; background:#fff; }' +
      `.sheet { width:${boxW}mm; height:${boxH - 0.5}mm; display:flex; align-items:center;` +
      ' justify-content:center; overflow:hidden; page-break-after:always; break-after:page; }' +
      '.sheet:last-child { page-break-after:auto; break-after:auto; }' +
      '.sheet img { max-width:100%; max-height:100%; object-fit:contain; display:block; }' +
      '</style></head><body>' +
      images.map(src => `<div class="sheet"><img src="${src}"></div>`).join('') +
      '</body></html>'
    );
    doc.close();

    const imgs = Array.from(doc.images);
    let left = imgs.length;
    const go = () => {
      const win = iframe.contentWindow;
      if (!win) { resolve(); return; }
      // 인쇄창을 닫은 뒤에 치웁니다. 먼저 치우면 인쇄가 취소됩니다.
      const cleanup = () => { setTimeout(() => iframe.remove(), 500); resolve(); };
      win.onafterprint = cleanup;
      win.focus();
      win.print();
      // onafterprint 를 안 주는 브라우저가 있어, 넉넉히 기다렸다가 치웁니다.
      setTimeout(cleanup, 60000);
    };

    if (left === 0) { go(); return; }
    const done = () => { if (--left === 0) setTimeout(go, 60); };
    imgs.forEach(img => {
      if (img.complete) done();
      else { img.onload = done; img.onerror = done; }
    });
  });
}
