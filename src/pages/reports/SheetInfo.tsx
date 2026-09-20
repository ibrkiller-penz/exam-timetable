import React from 'react';
import { FitCell } from './FitText';

/**
 * 인쇄물 머리글 아래의 정보 칸 — 위는 항목 이름, 아래는 값.
 *
 * 예전에는 이 칸을 grid 로 그리고 칸마다 Tailwind 로 선을 그었습니다. 그래서
 * 표에 걸어 둔 선 규칙(.sheet-table)이 하나도 먹지 않았고, 같은 종이 안에서
 * 위 칸과 아래 표의 선 굵기·색이 달랐습니다. 값 칸도 강조할 때만 글자를
 * 키워서 한 줄 안에서 크기가 들쭉날쭉했습니다.
 *
 * 이제 진짜 표로 그립니다. 선은 .sheet-table 한 곳에서 정한 것을 그대로 쓰고,
 * 강조는 크기가 아니라 굵기와 색으로 합니다.
 */
export const SheetInfo: React.FC<{
  /** [항목, 값] 쌍을 왼쪽부터. */
  items: Array<[string, React.ReactNode]>;
  /**
   * 칸 너비 비율. '1.5fr 0.9fr 1fr' 처럼 주거나 비워 두면 똑같이 나눕니다.
   * 표로 그리므로 fr 을 퍼센트로 바꿔 colgroup 에 넣습니다.
   */
  columns?: string;
  /** 굵게·색으로 도드라지게 할 항목 번호 (0부터). */
  emphasize?: number[];
  className?: string;
}> = ({ items, columns, emphasize = [], className }) => {
  if (!items || items.length === 0) return null;

  const weights = (() => {
    const parsed = (columns ?? '')
      .trim()
      .split(/\s+/)
      .map(v => parseFloat(v))
      .filter(v => Number.isFinite(v) && v > 0);
    return parsed.length === items.length ? parsed : items.map(() => 1);
  })();
  const total = weights.reduce((a, b) => a + b, 0);

  return (
    <table className={`sheet-table w-full table-fixed text-center ${className ?? 'mb-4'}`}>
      <colgroup>
        {weights.map((w, i) => (
          <col key={i} style={{ width: `${(w / total) * 100}%` }} />
        ))}
      </colgroup>
      <thead className="bg-gray-100">
        <tr>
          {items.map(([label], i) => (
            <th key={`h-${label}-${i}`} className="py-2 px-2 font-black">
              <FitCell base={16.5}>{label}</FitCell>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {items.map(([label, value], i) => (
            <td
              key={`v-${label}-${i}`}
              className={`py-2.5 px-2 ${emphasize.includes(i) ? 'font-black text-[#005691]' : 'font-bold text-slate-800'}`}
            >
              <FitCell>{value}</FitCell>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
};
