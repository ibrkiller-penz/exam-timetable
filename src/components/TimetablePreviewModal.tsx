import React from 'react';
import { useAppStore } from '../store/appStore';
import { selPlacementSlots, selSubjectBanEntries } from '../store/selectors';
import { buildGradeTable } from '../domain/reports/gradeTable';
import { downloadWorkbook } from '../utils/excelStyled';
import { Printer, Download, X } from 'lucide-react';
import { printAsImage } from '../pages/reports/printAsImage';

/**
 * 고사 시간표 미리보기.
 * 8. 학생 배치에서 확정 전에도 시간표를 바로 보고, 인쇄하거나 엑셀로 내려받습니다.
 * 표는 11-1 전체 시간표와 같은 함수로 만들어 인쇄물과 내용이 어긋나지 않습니다.
 */
export const TimetablePreviewModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { meta, rooms, days, times, placement, settings, slotBanLabels, slotBanLabelStyle } = useAppStore();
  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  const banCfg = { defaultStyle: settings.banLabelStyle, slotStyle: slotBanLabelStyle, manual: slotBanLabels };
  const { columns, rows } = buildGradeTable(rooms, days, times, placementSlots, placement, entries, banCfg);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6 print:static print:bg-white print:p-0" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] max-h-[90vh] flex flex-col overflow-hidden print:max-w-none print:max-h-none print:shadow-none print:rounded-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-[#005691] text-white px-5 py-3 flex items-center justify-between shrink-0 no-print">
          <span className="font-black text-[17px]">고사 시간표 미리보기</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printAsImage({ selector: '#timetable-preview .print-page', landscape: true })}
              className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-[14px] font-bold flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" /> 인쇄
            </button>
            <button
              onClick={() => {
                // 11-1 전체 시간표와 같은 모양으로 내보냅니다.
                const body: (string | number)[][] = [];
                for (const r of rows) {
                  body.push([r.isFirstOfDate ? r.dateText.replace(/\s+/g, ' ') : '', r.periodLabel, ...r.cells.map(c => c.subject), '']);
                  body.push(['', r.timeRange, ...r.cells.map(c => (c.stuCount === '·' ? '' : c.stuCount)), r.totalStuCount > 0 ? r.totalStuCount : '']);
                }
                downloadWorkbook([{
                  name: '고사 시간표',
                  title: meta.title,
                  subtitle: '고사실별 시험시간표 — 윗줄은 과목, 아랫줄은 응시 인원입니다.',
                  headers: [['날짜', '구분', ...columns.map(c => c.roomName), '인원계']],
                  rows: body,
                  widths: [12, 13, ...columns.map(() => 15), 9],
                  landscape: true,
                  numericCols: columns.map((_, i) => i + 2).concat([columns.length + 2]),
                }], `${meta.title || '고사'} 시간표.xlsx`);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-[14px] font-bold flex items-center gap-1.5 transition"
            >
              <Download className="w-4 h-4" /> 엑셀 다운로드
            </button>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition" aria-label="닫기">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 창이 화면보다 길면 아래가 잘립니다. flex-1 min-h-0 이라야
            남는 높이만큼만 차지하고 그 안에서 스크롤됩니다.
            안쪽 print-page 한 장이 인쇄·PDF 에 그대로 실립니다. */}
        <div id="timetable-preview" className="flex-1 min-h-0 overflow-auto p-4 bg-slate-100 print:overflow-visible print:bg-white print:p-0">
          <div className="print-page page-landscape bg-white p-8 rounded-xl shadow-xs mx-auto print:shadow-none print:rounded-none">
          <h1 className="text-center font-extrabold text-2xl mb-4 text-[#005691]">{meta.title} 시간표</h1>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-slate-500">7. 고사장 배치를 하면 시간표가 만들어집니다.</p>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-2 py-1.5 font-black">날짜</th>
                  <th className="border border-gray-400 px-2 py-1.5 font-black">구분</th>
                  {columns.map(c => (
                    <th key={c.id} className="border border-gray-400 px-2 py-1.5 font-black">
                      {c.roomName}
                      <div className="text-[11px] font-bold text-slate-500">(책상{c.capacity})</div>
                    </th>
                  ))}
                  <th className="border border-gray-400 px-2 py-1.5 font-black">인원계</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <React.Fragment key={i}>
                    <tr>
                      {r.isFirstOfDate && (
                        <td rowSpan={r.dateRowSpan * 2} className="border border-gray-400 px-2 py-1 text-center font-black align-middle">
                          {r.dateText}
                        </td>
                      )}
                      <td className="border border-gray-400 px-2 py-1 text-center font-bold text-[#005691]">{r.periodLabel}</td>
                      {r.cells.map((c, j) => (
                        <td key={j} className="border border-gray-400 px-2 py-1 text-center font-bold break-keep">
                          {c.subject}
                        </td>
                      ))}
                      <td className="border border-gray-400" />
                    </tr>
                    <tr>
                      <td className="border border-gray-400 px-2 py-1 text-center text-[11.5px] text-slate-600">{r.timeRange}</td>
                      {r.cells.map((c, j) => (
                        <td key={j} className="border border-gray-400 px-2 py-1 text-center font-bold">
                          {c.stuCount}
                        </td>
                      ))}
                      <td className="border border-gray-400 px-2 py-1 text-center font-black">{r.totalStuCount}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
