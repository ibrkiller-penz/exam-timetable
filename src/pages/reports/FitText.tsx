import React, { useLayoutEffect, useRef } from 'react';

/**
 * 칸 너비에 맞춰 글자 크기를 정합니다.
 *
 * 봉투 라벨의 과목명처럼 '글자 수와 상관없이 늘 같은 폭'으로 보여야 하는
 * 자리에 씁니다. 글자 수로 크기를 어림하던 때에는 '한국사2' 와
 * '심화 영어 독해Ⅰ' 의 폭이 제각각이라 봉투마다 크기가 달라 보였습니다.
 *
 * 기준 크기로 한 번 그려 재고, 목표 폭에 닿도록 비례로 키웁니다.
 * 글자 모양을 늘이지 않으므로(가로로 찌그러지지 않습니다) 보기에 자연스럽습니다.
 *
 * 크기는 상태가 아니라 요소에 바로 적습니다. 상태로 두었더니, 계산한 값이
 * 이전과 같을 때 다시 그리지 않아 크기가 지워진 채로 남았습니다.
 */
export const FitText: React.FC<{
  text: string;
  /** 칸 너비의 몇 할까지 쓸지. 0.8이면 80%. */
  ratio?: number;
  /** 칸 높이의 몇 할까지 쓸지. 짧은 이름이 위아래로 넘치지 않게 막습니다. */
  heightRatio?: number;
  max?: number;
  min?: number;
  className?: string;
}> = ({ text, ratio = 0.8, heightRatio = 0.62, max = 120, min = 14, className }) => {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;

    const fit = () => {
      const target = box.clientWidth * ratio;
      if (target <= 0) return;

      const REF = 100;
      el.style.fontSize = `${REF}px`;
      const mw = el.scrollWidth;
      const mh = el.scrollHeight;
      el.style.fontSize = '';
      if (!mw) { el.style.fontSize = `${max}px`; return; }

      // 폭으로 정한 크기가 칸 높이를 넘으면, 높이에 맞춥니다.
      // '기하' 같은 두 글자 이름을 폭에만 맞추면 위아래로 넘칩니다.
      const byWidth = (REF * target) / mw;
      const room = box.clientHeight * heightRatio;
      const byHeight = mh && room > 0 ? (REF * room) / mh : byWidth;

      el.style.fontSize = `${Math.max(min, Math.min(max, byWidth, byHeight))}px`;
    };

    fit();

    // 글꼴이 늦게 붙으면 처음 잰 값이 어긋납니다. 붙고 나서 한 번 더 잽니다.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(fit).catch(() => {});

    // 창 크기가 바뀌면 칸 너비도 바뀝니다.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  });

  return (
    <span ref={ref} className={className} style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>
      {text}
    </span>
  );
};
