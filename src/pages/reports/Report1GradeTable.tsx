import React from 'react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots, selSubjectBanEntries } from '../../store/selectors';
import { buildGradeTable } from '../../domain/reports/gradeTable';
import { Printer, Download} from 'lucide-react';
import { exportMultipleDOMTablesToExcel } from '../../utils/excelExport';

export const Report1GradeTable: React.FC = () => {
  const { meta, rooms, days, times, placement, stages } = useAppStore();
  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  const { columns, rows } = buildGradeTable(rooms, days, times, placementSlots, placement, entries);

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6 print:overflow-visible print:h-auto print:p-0">
      <div className="flex items-center justify-between mb-4 no-print">
        <h2 className="text-xl font-bold text-[#005691]">9-1. 전체 시험시간표</h2>
        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
        <button
          onClick={() => exportMultipleDOMTablesToExcel('table', 'Report1GradeTable.xlsx')}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 엑셀 내보내기
        </button>
      </div>

      {!stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황(8단계)이 확정되면 전체 시험시간표가 생성됩니다.
        </div>
      ) : (
        <div className="print-page page-landscape bg-white border border-gray-300 p-6 print:p-2 rounded-xl shadow-xs print:border-none print:shadow-none">
          <h1 className="text-center font-extrabold text-2xl mb-6 text-[#005691]">
            {meta.title}
          </h1>

          <style>{`@media print { @page { size: landscape; margin: 12mm; } }`}</style>
          <table className="w-full text-[11px] print:text-[10.5px] text-center border-collapse border border-gray-800 table-fixed break-words">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-800 divide-x divide-gray-800">
                <th className="py-1.5 px-2 w-[70px]">날짜</th>
                <th className="py-1.5 px-1 w-[90px]">구분</th>
                {columns.map(c => (
                  <th key={c.id} className="py-1.5 px-1 font-bold">
                    {c.roomName}
                  </th>
                ))}
                <th className="py-1.5 px-1 w-12 font-bold">인원계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((r, idx) => (
                <React.Fragment key={idx}>
                  {/* Row 1: Subject */}
                  <tr className="divide-x divide-gray-800">
                    {r.isFirstOfDate && (
                      <td
                        rowSpan={r.dateRowSpan * 2}
                        className="py-1 px-1 font-bold whitespace-pre-line bg-gray-50 align-middle"
                      >
                        {r.dateText}
                      </td>
                    )}
                    <td className="py-1 px-1 font-semibold bg-gray-50">{r.periodLabel}</td>
                    {r.cells.map((cell, cIdx) => (
                      <td key={cIdx} className="py-0.5 px-0.5 font-medium break-keep leading-tight">
                        {cell.subject}
                      </td>
                    ))}
                    <td className="py-0.5 px-0.5 bg-gray-50">-</td>
                  </tr>

                  {/* Row 2: StuCount & Time */}
                  <tr className="divide-x divide-gray-800 border-b-2 border-gray-800">
                    <td className="py-0.5 px-1 text-[10px] text-gray-600 bg-gray-50">{r.timeRange}</td>
                    {r.cells.map((cell, cIdx) => (
                      <td key={cIdx} className="py-0.5 px-0.5 font-semibold text-gray-800">
                        {cell.stuCount}
                      </td>
                    ))}
                    <td className="py-0.5 px-0.5 font-bold text-red-800 bg-gray-50">
                      {r.totalStuCount > 0 ? r.totalStuCount : '-'}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
