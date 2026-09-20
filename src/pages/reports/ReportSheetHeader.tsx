import React from 'react';
import { useAppStore } from '../../store/appStore';
import { SheetInfo } from './SheetInfo';

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
      <p className="text-center text-[19px] font-bold text-slate-500 tracking-tight mb-0.5">{meta.title}</p>
    )}
    <div className="flex items-center justify-center gap-3 mb-1">
      <h1 className="text-center font-black text-[50px] leading-[1.15] pt-0.5 text-[#005691] tracking-tight break-keep">
        {title}
      </h1>
      {pageLabel && (
        <span className="text-[17px] font-black text-slate-600 bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-0.5">
          {pageLabel}
        </span>
      )}
    </div>

    {subtitle && (
      <p className="text-center text-[25px] font-black text-slate-800 mb-4">
        {subtitle}
      </p>
    )}

    {info && info.length > 0 && (
      <SheetInfo items={info} columns={infoColumns} emphasize={emphasize} />
    )}
  </div>
  );
};
