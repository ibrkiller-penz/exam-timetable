import React from 'react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots, selSubjectBanEntries } from '../../store/selectors';
import { buildGradeTable } from '../../domain/reports/gradeTable';
import { Printer, Download} from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';

export const Report1GradeTable: React.FC = () => {
  const { meta, rooms, days, times, placement, stages, settings, slotBanLabels, slotBanLabelStyle } = useAppStore();
  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  // 화면에서 정한 분반 표기를 인쇄물에도 그대로 씁니다.
  const banCfg = { defaultStyle: settings.banLabelStyle, slotStyle: slotBanLabelStyle, manual: slotBanLabels };

  // 배치가 하나라도 있으면 표를 만들 수 있습니다. 응시현황 확정과는 무관합니다.
  const hasPlacement = Object.values(placement || {}).some(row => Object.values(row || {}).some(v => v && v !== '배치금지'));

  const { columns, rows } = buildGradeTable(rooms, days, times, placementSlots, placement, entries, banCfg);

  // 한 장에 몇 일을 실을지.
  // 4일까지는 한 장에 들어가지만, 5일은 줄이 눈려 읽기 힘들어
  // 3일 + 2일로 나눕니다.
  const DAYS_PER_PAGE = 3;
  const dayBlocks: typeof rows[] = [];
  for (const r of rows) {
    if (r.isFirstOfDate || dayBlocks.length === 0) dayBlocks.push([]);
    dayBlocks[dayBlocks.length - 1].push(r);
  }
  const pages: typeof rows[] =
    dayBlocks.length <= 4
      ? [rows]
      : Array.from({ length: Math.ceil(dayBlocks.length / DAYS_PER_PAGE) }, (_, i) =>
          dayBlocks.slice(i * DAYS_PER_PAGE, (i + 1) * DAYS_PER_PAGE).flat()
        );

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6 print:overflow-visible print:h-auto print:p-0">
      <div className="flex items-center justify-between mb-4 no-print">
        <h2 className="text-xl font-bold text-[#005691]">10-1. 전체 시험시간표</h2>
        <button
          onClick={() => window.print()}
          disabled={!hasPlacement}
          className="px-4 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
        <button
          onClick={() => {
            // 화면의 표를 긁지 않고 자료에서 바로 만듭니다.
            // 한 교시가 두 줄(과목 / 인원)이라 엑셀에서도 그대로 두 줄로 씁니다.
            const headers = [['날짜', '구분', ...columns.map(c => c.roomName), '인원계']];
            const body: (string | number)[][] = [];
            for (const r of rows) {
              body.push([r.isFirstOfDate ? r.dateText.replace(/\s+/g, ' ') : '', r.periodLabel, ...r.cells.map(c => c.subject), '']);
              body.push(['', r.timeRange, ...r.cells.map(c => (c.stuCount === '·' ? '' : c.stuCount)), r.totalStuCount > 0 ? r.totalStuCount : '']);
            }
            downloadWorkbook([{
              name: '전체 시험시간표',
              title: meta.title,
              subtitle: '고사실별 시험시간표 — 윗줄은 과목, 아랫줄은 응시 인원입니다.',
              headers,
              rows: body,
              widths: [12, 13, ...columns.map(() => 15), 9],
              landscape: true,
              numericCols: columns.map((_, i) => i + 2).concat([columns.length + 2]),
            }], `${meta.title || '고사'} 전체 시험시간표.xlsx`);
          }}
          disabled={!hasPlacement}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 엑셀 내보내기
        </button>
      </div>

      {!hasPlacement ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          7. 고사장 배치를 하면 전체 시험시간표가 만들어집니다.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {pages.map((pageRows, pageIdx) => (
            <div
              key={pageIdx}
              className="print-page page-landscape bg-white border border-gray-300 p-6 print:p-2 rounded-xl shadow-xs print:border-none print:shadow-none"
            >
              <div className="flex items-center justify-center gap-3 mb-4">
                <h1 className="text-center font-extrabold text-2xl text-[#005691]">{meta.title}</h1>
                {pages.length > 1 && (
                  <span className="text-[14px] font-black text-slate-600 bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-0.5">
                    #{pageIdx + 1} / {pages.length}
                  </span>
                )}
              </div>

              <table className="w-full text-[11.5px] print:text-[10.5px] text-center border-collapse table-fixed break-words">
                <thead>
                  <tr className="bg-[#eef4f9] text-[#00426e]">
                    <th className="py-2 px-2 w-[64px] font-black border-b-2 border-[#005691]">날짜</th>
                    <th className="py-2 px-1 w-[86px] font-black border-b-2 border-[#005691]">구분</th>
                    {columns.map(c => (
                      <th key={c.id} className="py-2 px-1 font-black border-b-2 border-[#005691] border-l border-[#cfe0ed]">
                        {c.roomName}
                      </th>
                    ))}
                    <th className="py-2 px-1 w-12 font-black border-b-2 border-[#005691] border-l border-[#cfe0ed]">인원계</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, idx) => {
                    // 날짜가 바뀔 때만 진한 줄을 그어 일차를 갈라 보이게 합니다.
                    // 칸마다 진한 선을 그으면 격자무늬처럼 보여 정작 찾는 것이 안 보입니다.
                    const dayIdx = pageRows.slice(0, idx + 1).filter(x => x.isFirstOfDate).length;
                    const tint = dayIdx % 2 === 0 ? 'bg-slate-50/60' : 'bg-white';
                    return (
                      <React.Fragment key={idx}>
                        <tr className={tint}>
                          {r.isFirstOfDate && (
                            <td
                              rowSpan={r.dateRowSpan * 2}
                              className="py-1 px-1 font-black text-[12.5px] text-slate-800 whitespace-pre-line align-middle bg-[#f4f7fa] border-t-2 border-[#005691]"
                            >
                              {r.dateText}
                            </td>
                          )}
                          <td className={`py-1 px-1 font-bold text-slate-700 bg-[#f8fafc] border-l border-[#e2e8f0] ${r.isFirstOfDate ? 'border-t-2 border-t-[#005691]' : 'border-t border-[#e2e8f0]'}`}>
                            {r.periodLabel}
                          </td>
                          {r.cells.map((cell, cIdx) => {
                            const isWait = cell.subject === '대기';
                            const isEmpty = !cell.subject || cell.subject === '·';
                            return (
                              <td
                                key={cIdx}
                                className={`py-1 px-0.5 break-keep leading-tight border-l border-[#e2e8f0] ${
                                  r.isFirstOfDate ? 'border-t-2 border-t-[#005691]' : 'border-t border-[#e2e8f0]'
                                } ${isEmpty ? 'text-slate-300' : isWait ? 'text-slate-400 font-medium' : 'text-[#00426e] font-bold'}`}
                              >
                                {cell.subject}
                              </td>
                            );
                          })}
                          <td className={`py-1 px-0.5 bg-[#f8fafc] text-slate-300 border-l border-[#e2e8f0] ${r.isFirstOfDate ? 'border-t-2 border-t-[#005691]' : 'border-t border-[#e2e8f0]'}`}>-</td>
                        </tr>

                        <tr className={tint}>
                          <td className="py-0.5 px-1 text-[10px] text-slate-500 bg-[#f8fafc] border-l border-[#e2e8f0]">{r.timeRange}</td>
                          {r.cells.map((cell, cIdx) => (
                            <td key={cIdx} className="py-0.5 px-0.5 font-semibold text-slate-700 border-l border-[#e2e8f0]">
                              {cell.stuCount}
                            </td>
                          ))}
                          <td className="py-0.5 px-0.5 font-black text-[#b91c1c] bg-[#f8fafc] border-l border-[#e2e8f0]">
                            {r.totalStuCount > 0 ? r.totalStuCount : '-'}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
