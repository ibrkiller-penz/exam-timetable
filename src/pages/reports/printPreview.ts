/**
 * 인쇄 전 확인창.
 *
 * 왜 필요한가.
 *   전체 인쇄는 한 번에 마흔 장이 나갑니다. 고른 날짜가 틀렸거나 한 장이
 *   비어 있어도 종이가 다 나온 뒤에야 압니다. 나가기 전에 몇 장인지,
 *   어떤 장인지 눈으로 보고 누르게 합니다.
 *
 *   보여 주는 그림은 화면을 뜬 바로 그 그림입니다(printAsImage). 그러니
 *   여기 보이는 것이 곧 종이에 찍히는 것입니다.
 *
 * 이름을 가리는 까닭.
 *   확인창은 '이 종이가 맞나'를 보는 자리지 명단을 읽는 자리가 아닙니다.
 *   교무실 화면에 여러 장이 한꺼번에 펼쳐지므로 여기서만 홍○○ 으로
 *   보여 줍니다. 종이에는 본명이 찍힙니다(privacy.ts 의 setPreviewMask).
 *
 * 리액트 밖에서 불리므로(printAsImage 는 그냥 함수입니다) 덮개와 같은
 * 방식으로 직접 만듭니다.
 */

/** 확인창을 띄우고, 인쇄를 누르면 true 를 돌려줍니다. */
export function confirmPrint(images: string[], landscape: boolean): Promise<boolean> {
  return new Promise(resolve => {
    const n = images.length;

    const wrap = document.createElement('div');
    wrap.className = 'no-print';
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(15,23,42,.55);padding:24px;font-family:inherit';

    const panel = document.createElement('div');
    panel.style.cssText =
      'background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.3);' +
      'width:min(1080px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden';

    // ── 머리줄 ────────────────────────────────────────────────
    const head = document.createElement('div');
    head.style.cssText = 'padding:20px 24px 16px;border-bottom:1px solid #e2e8f0';
    head.innerHTML =
      '<p style="margin:0;font-weight:900;font-size:19px;color:#0f172a">인쇄하기 전에 확인하세요</p>' +
      `<p style="margin:6px 0 0;font-weight:700;font-size:14px;color:#64748b">` +
      `모두 <b style="color:#005691">${n}장</b>입니다. ` +
      `아래 그림이 종이에 그대로 찍힙니다. ` +
      `이름은 <b>여기서만</b> 가렸고, 종이에는 본명이 나옵니다.</p>`;

    // ── 종이들 ────────────────────────────────────────────────
    const body = document.createElement('div');
    body.style.cssText = 'padding:20px 24px;overflow:auto;background:#f1f5f9;flex:1;min-height:0';

    // 한 장이면 크게, 여러 장이면 늘어놓습니다. 가로 종이는 한 칸을 넓게 씁니다.
    const cols = n === 1 ? 1 : landscape ? 2 : 3;
    const grid = document.createElement('div');
    grid.style.cssText =
      `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:18px;` +
      (n === 1 ? 'max-width:560px;margin:0 auto' : '');

    // 종이 한 장은 화면에서 늘 작습니다. 표 글자까지 읽고 싶을 때가 있어
    // 누르면 창 가득 키워 보여 줍니다.
    const zoom = document.createElement('div');
    zoom.style.cssText =
      'position:absolute;inset:0;z-index:1;display:none;align-items:center;justify-content:center;' +
      'background:rgba(15,23,42,.8);padding:20px;cursor:zoom-out';
    const zoomImg = document.createElement('img');
    zoomImg.style.cssText =
      'max-width:100%;max-height:100%;object-fit:contain;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.4)';
    zoom.appendChild(zoomImg);
    const openZoom = (src: string) => { zoomImg.src = src; zoom.style.display = 'flex'; };
    const closeZoom = () => { zoom.style.display = 'none'; };
    zoom.onclick = closeZoom;

    images.forEach((src, i) => {
      const card = document.createElement('figure');
      card.style.cssText = 'margin:0;display:flex;flex-direction:column;gap:6px';
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${i + 1}장`;
      img.title = '누르면 크게 봅니다';
      img.style.cssText =
        'width:100%;height:auto;display:block;background:#fff;border:1px solid #cbd5e1;' +
        'border-radius:6px;cursor:zoom-in';
      img.onclick = () => openZoom(src);
      const cap = document.createElement('figcaption');
      cap.textContent = `${i + 1} / ${n}`;
      cap.style.cssText =
        'text-align:center;font-size:12.5px;font-weight:800;color:#64748b;font-variant-numeric:tabular-nums';
      card.append(img, cap);
      grid.appendChild(card);
    });
    body.appendChild(grid);

    // ── 버튼줄 ────────────────────────────────────────────────
    const foot = document.createElement('div');
    foot.style.cssText =
      'padding:14px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px';

    const BTN = 'padding:10px 18px;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '그만두기';
    cancel.style.cssText = `${BTN};background:#fff;color:#475569;border:1px solid #cbd5e1`;

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = `${n}장 인쇄`;
    ok.style.cssText = `${BTN};background:#005691;color:#fff;border:1px solid #005691`;

    foot.append(cancel, ok);
    panel.style.position = 'relative'; // 크게 보기 층을 이 안에 얹습니다.
    panel.append(head, body, foot, zoom);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    ok.focus();

    let done = false;
    const close = (answer: boolean) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(answer);
    };
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      // 크게 보는 중이면 그것만 닫습니다. 확인창까지 함께 닫히면 놀랍니다.
      if (zoom.style.display === 'flex') closeZoom();
      else close(false);
    }

    cancel.onclick = () => close(false);
    ok.onclick = () => close(true);
    // 바깥을 눌러도 닫습니다. 종이가 나가는 쪽이 아니라 그만두는 쪽으로.
    wrap.onclick = e => { if (e.target === wrap) close(false); };
    document.addEventListener('keydown', onKey, true);
  });
}
