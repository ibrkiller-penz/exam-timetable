import React, { useState } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
import { ReportGate } from './ReportGate';
import { buildExamRoomReport } from '../../domain/reports/examRoom';
import { DayLabel, PeriodLabel } from '../../domain/types';
import { Printer, Download} from 'lucide-react';
import { exportMultipleDOMTablesToExcel } from '../../utils/excelExport';

export const Report2ExamRoom: React.FC = () => {
  const { attendance, stages, days, rooms } = useAppStore();

  const [selectedDay, setSelectedDay] = useState<DayLabel>('1일차');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodLabel>('1교시');
  const [selectedRoom, setSelectedRoom] = useState<string>('');

  const uniqueRooms = Array.from(new Set(attendance.map(r => r.examRoom))).filter(Boolean);
  const curRoom = selectedRoom || uniqueRooms[0] || '1-1';

  const report = buildExamRoomReport(attendance, selectedDay, selectedPeriod, curRoom, rooms);

  // 한 장에 40명(20명 × 2줄)까지 싫습니다.
  // 50칸을 한 장에 욱여넣으면 줄이 눈려 읽기 힘들고, 빈 칸도 많이 남습니다.
  const PER_PAGE = 40;
  const PER_COL = PER_PAGE / 2;
  const all = report ? report.students : [];
  const pageCount = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const pages = Array.from({ length: pageCount }, (_, i) => all.slice(i * PER_PAGE, (i + 1) * PER_PAGE));

  const dayDate = days[Number(selectedDay.replace('일차', '')) - 1]?.date ?? '';

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#005691]">10-2. 고사실 명단</h2>
          <select
            value={selectedDay}
            onChange={e => setSelectedDay(e.target.value as DayLabel)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(d => (
              <option key={d} value={`${d}일차`}>{`${d}일차`}</option>
            ))}
          </select>
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value as PeriodLabel)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(p => (
              <option key={p} value={`${p}교시`}>{`${p}교시`}</option>
            ))}
          </select>
          <select
            value={curRoom}
            onChange={e => setSelectedRoom(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {uniqueRooms.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
        <button
          onClick={() => exportMultipleDOMTablesToExcel('table', 'Report2ExamRoom.xlsx')}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 엑셀 내보내기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <ReportGate what="고사실 명단" emptyHint="그 날짜·교시에 이 고사실을 쓰지 않습니다. 위에서 다른 고사실을 골라 보세요." />
      ) : (
        <div className="flex flex-col gap-8">
          {pages.map((pageStudents, pageIdx) => (
            <div
              key={pageIdx}
              className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none"
            >
              <div className="flex items-center justify-center gap-3 mb-6">
                <h1 className="text-center font-black text-[36px] leading-none text-[#005691] tracking-tight">
                  {report.isWaitRoom ? '대기실 인원현황표' : '고사실 응시현황표'}
                </h1>
                {/* 두 장 이상이면 몇 번째 장인지 밝혀 놓습니다. */}
                {pageCount > 1 && (
                  <span className="text-[15px] font-black text-slate-700 bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-0.5">
                    #{pageIdx + 1} / {pageCount}
                  </span>
                )}
              </div>

              <div className="border-2 border-gray-800 grid grid-cols-5 text-center text-[14px] mb-4">
                <div className="py-2 bg-gray-100 font-black border-r border-gray-800">시행일</div>
                <div className="py-2 bg-gray-100 font-black border-r border-gray-800">교시</div>
                <div className="py-2 bg-gray-100 font-black border-r border-gray-800">고사실</div>
                <div className="py-2 bg-gray-100 font-black border-r border-gray-800">과목(단위)</div>
                <div className="py-2 bg-gray-100 font-black">응시인원</div>

                <div className="py-1.5 border-t border-r border-gray-800">{dayDate || '-'}</div>
                <div className="py-1.5 border-t border-r border-gray-800">{report.period}</div>
                <div className="py-2 border-t border-r border-gray-800 font-black text-[18px]">{report.examRoom}</div>
                <div className="py-1.5 border-t border-r border-gray-800 font-semibold">{report.subject}</div>
                <div className="py-2 border-t border-gray-800 font-black text-[18px] text-[#005691]">{report.totalStudents}명</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[0, 1].map(colIdx => (
                  <table key={colIdx} className="w-full text-[15px] text-center border-collapse border-2 border-gray-800">
                    <thead className="bg-gray-100 border-b border-gray-800">
                      <tr className="divide-x divide-gray-800">
                        <th className="py-2 px-1 w-12 font-black">연번</th>
                        <th className="py-2 px-2 font-black">학번</th>
                        <th className="py-2 px-2 font-black">성명</th>
                        <th className="py-2 px-2 w-16 font-black">좌석</th>
                        <th className="py-2 px-2 w-20 font-black">비고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {Array.from({ length: PER_COL }).map((_, i) => {
                        const s = pageStudents[colIdx * PER_COL + i];
                        const blankSeq = pageIdx * PER_PAGE + colIdx * PER_COL + i + 1;
                        return (
                          <tr key={i} className="divide-x divide-gray-800 h-9">
                            <td>{s ? s.seq : blankSeq}</td>
                            <td className="font-bold text-slate-700">{s?.hakbun || ''}</td>
                            <td className="font-black text-[18px] text-slate-900">{s?.name ? displayName(s.name) : ''}</td>
                            <td className="font-black text-[19px] text-red-700">{s?.seat || ''}</td>
                            <td className="text-[10px] font-bold text-slate-700 whitespace-nowrap">{s?.note || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
