import React from 'react';
import { useAppStore } from '../../store/appStore';

/**
 * 인쇄물 한 장의 머리글.
 *
 * 좌석배치도 모양을 기준으로 삼았습니다. 종이마다 제목 크기도 정보 칸 모양도
 * 제각각이면, 같은 고사에서 나온 서류로 보이지 않습니다.
 *
 *  1) 가운데 큰 제목
 *  2) 그 아래 한 줄 — 어느 고사실, 몇 교시, 무슨 과목인지
 *  3) 표 모양 정보 칸 — 위는 항목 이름, 아래는 값
 */
export const ReportSheetHeader: React.FC<{
  title: string;
  /** 제목 아래 한 줄. 무엇에 대한 종이인지 한눈에 보이게 합니다. */
  subtitle?: string;
  /** 정보 칸. [항목, 값] 쌍을 왼쪽부터 늘어놓습니다. */
  info?: Array<[string, React.ReactNode]>;
  /** 칸마다 너비를 달리 주고 싶을 때 (예: '1.5fr 0.9fr 1fr 1.7fr 1fr'). */
  infoColumns?: string;
  /** 여러 장일 때 '#1 / 2'. */
  pageLabel?: string;
  /** 값 칸에서 크게 보여 줄 항목의 번호 (0부터). */
  emphasize?: number[];
}> = ({ title, subtitle, info, infoColumns, pageLabel, emphasize = [] }) => {
  // 어느 고사의 서류인지 종이만 보고 알아야 합니다. 화면 맨 위에 적은 고사 제목을 그대로 씁니다.
  const meta = useAppStore(s => s.meta);

  return (
  <div className="shrink-0">
    {/* 11-1 처럼 큰 제목 자체가 고사 제목인 종이에서는 두 번 쓰지 않습니다. */}
    {meta?.title && title !== meta.title && (
      <p className="text-center text-[17px] font-bold text-slate-500 tracking-tight mb-0.5">{meta.title}</p>
    )}
    <div className="flex items-center justify-center gap-3 mb-1">
      <h1 className="text-center font-black text-[46px] leading-[1.15] pt-0.5 text-[#005691] tracking-tight break-keep">
        {title}
      </h1>
      {pageLabel && (
        <span className="text-[16px] font-black text-slate-600 bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-0.5">
          {pageLabel}
        </span>
      )}
    </div>

    {subtitle && (
      <p className="text-center text-[22px] font-black text-slate-800 mb-4">
        {subtitle}
      </p>
    )}

    {info && info.length > 0 && (
      <div
        className="w-full border-2 border-gray-800 grid text-center text-[15px] mb-4"
        style={{ gridTemplateColumns: infoColumns ?? `repeat(${info.length}, minmax(0, 1fr))` }}
      >
        {info.map(([label], i) => (
          <div
            key={`h-${label}-${i}`}
            className={`py-2 bg-gray-100 font-black ${i < info.length - 1 ? 'border-r border-gray-800' : ''}`}
          >
            {label}
          </div>
        ))}
        {info.map(([label, value], i) => (
          <div
            key={`v-${label}-${i}`}
            className={`py-2.5 border-t-[3px] border-double border-gray-800 ${i < info.length - 1 ? 'border-r border-gray-800' : ''} ${
              emphasize.includes(i) ? 'font-black text-[19px]' : 'font-bold'
            }`}
          >
            {value}
          </div>
        ))}
      </div>
    )}
  </div>
  );
};
