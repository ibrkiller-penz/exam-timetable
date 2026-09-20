import React from 'react';

/**
 * 인쇄물 화면 맨 위 줄.
 *
 * 종이마다 제목 크기도, 고르는 칸 모양도, 버튼 자리도 달랐습니다. 화면을
 * 옮길 때마다 어디를 눌러야 하는지 다시 찾아야 했습니다. 한 곳에서 정합니다.
 *
 *   [번호] 제목
 *   고르는 칸들…                                   [엑셀][PDF][인쇄]
 *
 * 고르는 칸은 화면마다 다르므로 children 으로 받고, 모양만 여기서 맞춥니다.
 * 칸에는 `report-select` / `report-seg` 를 쓰면 같은 크기로 보입니다.
 */
export const ReportHeader: React.FC<{
  /** '11-2' 처럼 메뉴 번호. 왼쪽 메뉴와 같은 번호라야 찾기 쉽습니다. */
  num: string;
  title: string;
  /** 날짜·고사실 고르는 칸 등. */
  children?: React.ReactNode;
  /** 보통 <ReportActions />. */
  actions?: React.ReactNode;
}> = ({ num, title, children, actions }) => (
  <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 mb-5 no-print bg-white p-4 rounded-xl shadow-xs border border-slate-200">
    <div className="flex flex-col gap-3 w-full min-w-0">
      <h2 className="text-xl font-black text-[#005691] flex items-center gap-2">
        <span className="px-2 h-7 rounded-lg bg-[#005691]/10 text-[#005691] flex items-center justify-center text-[13px] font-black shrink-0">
          {num}
        </span>
        {title}
      </h2>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>

    {actions && <div className="shrink-0 w-full xl:w-auto">{actions}</div>}
  </div>
);

/** 머리줄 안에서 칸들을 갈라 놓는 세로선. */
export const HeaderDivider: React.FC = () => <div className="h-6 w-px bg-slate-200 mx-0.5" />;

/** '무엇을 고르는 칸인지' 알려 주는 작은 이름표. */
export const HeaderLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[13px] font-bold text-slate-500 whitespace-nowrap">{children}</span>
);
