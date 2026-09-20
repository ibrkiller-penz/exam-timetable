import React, { useLayoutEffect, useRef } from 'react';

/**
 * 칸 너비에 맞춰 글자 크기를 정합니다.
 *
 * 두 가지로 씁니다.
 *
 *  1) grow (기본) — 칸을 채우도록 키웁니다.
 *     봉투 라벨의 과목명처럼 '글자 수와 상관없이 늘 같은 폭'으로 보여야 하는
 *     자리. 글자 수로 크기를 어림하던 때에는 '한국사2' 와 '심화 영어 독해Ⅰ'
 *     의 폭이 제각각이라 봉투마다 크기가 달라 보였습니다.
 *
 *  2) grow={false} — 표 칸 안. 글자는 최대한 크게(기본 크기 그대로) 두되,
 *     한 줄에 안 들어가 두 줄로 접힐 것 같으면 **그 칸만** 줄여서 맞춥니다.
 *     줄이 접히면 줄 높이가 배가 되어 한 장에 실리는 줄 수가 달라집니다.
 *
 * 기준 크기로 한 번 그려 재고, 목표 폭에 닿도록 비례로 키우거나 줄입니다.
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
  /** 칸을 채우도록 키울지. false 면 넘칠 때만 줄입니다(표 칸). */
  grow?: boolean;
  max?: number;
  min?: number;
  className?: string;
}> = ({ text, ratio = 0.8, heightRatio = 0.62, grow = true, max = 120, min = 14, className }) => {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;

    const fit = () => {
      const target = box.clientWidth * ratio;
      if (target <= 0) return;

      if (!grow) {
        // 기본 크기로 두고, 넘칠 때만 비례로 줄입니다.
        // 대부분의 칸은 여기서 끝나 잰 값을 한 번만 읽습니다.
        el.style.fontSize = `${max}px`;
        const w = el.scrollWidth;
        if (w <= target || !w) return;
        el.style.fontSize = `${Math.max(min, (max * target) / w)}px`;
        return;
      }

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

/**
 * 표 칸 안의 글자.
 *
 * 글자는 표의 기본 크기 그대로 두고, 한 줄에 안 들어갈 때만 그 칸을 줄입니다.
 * 긴 과목명 하나 때문에 표 전체 글자를 줄이지 않아도 됩니다.
 */
export const FitCell: React.FC<{
  children: React.ReactNode;
  /** 표의 기본 글자 크기. .sheet-table 과 맞춥니다. */
  base?: number;
  min?: number;
  className?: string;
}> = ({ children, base = 17.5, min = 10.5, className }) => {
  // 글자가 아닌 것(빈 칸·요소)은 잴 것이 없으니 그대로 둡니다.
  if (typeof children !== 'string' && typeof children !== 'number') return <>{children}</>;
  const text = String(children);
  if (!text) return <>{children}</>;

  return <FitText text={text} grow={false} ratio={0.96} max={base} min={min} className={className} />;
};
