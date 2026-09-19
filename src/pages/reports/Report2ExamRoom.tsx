import React, { useState } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
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

  const leftCol = report ? report.students.slice(0, 25) : [];
  const rightCol = report ? report.students.slice(25, 50) : [];

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
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황이 없거나 선택한 교시에 해당 고사실 배치가 없습니다.
        </div>
      ) : (
        <div className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs max-w-4xl mx-auto">
          <h1 className="text-center font-extrabold text-2xl mb-6 text-[#005691]">
            {report.isWaitRoom ? '대기실 인원현황표' : '고사실 응시현황표'}
          </h1>

          <div className="border border-gray-800 grid grid-cols-5 text-center text-xs mb-4">
            <div className="py-1.5 bg-gray-100 font-bold border-r border-gray-800">시행일</div>
            <div className="py-1.5 bg-gray-100 font-bold border-r border-gray-800">교시</div>
            <div className="py-1.5 bg-gray-100 font-bold border-r border-gray-800">고사실</div>
            <div className="py-1.5 bg-gray-100 font-bold border-r border-gray-800">과목(단위)</div>
            <div className="py-1.5 bg-gray-100 font-bold">응시인원</div>

            <div className="py-1.5 border-t border-r border-gray-800">{dayDate || '-'}</div>
            <div className="py-1.5 border-t border-r border-gray-800">{report.period}</div>
            <div className="py-1.5 border-t border-r border-gray-800 font-bold">{report.examRoom}</div>
            <div className="py-1.5 border-t border-r border-gray-800 font-semibold">{report.subject}</div>
            <div className="py-1.5 border-t border-gray-800 font-bold text-[#005691]">{report.totalStudents}명</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Left 25 */}
            <table className="w-full text-xs text-center border-collapse border border-gray-800">
              <thead className="bg-gray-100 border-b border-gray-800">
                <tr className="divide-x divide-gray-800">
                  <th className="py-1.5 px-1 w-10">연번</th>
                  <th className="py-1.5 px-2">학번</th>
                  <th className="py-1.5 px-2">성명</th>
                  <th className="py-1.5 px-2 w-14">좌석</th>
                  <th className="py-1.5 px-2 w-14">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {Array.from({ length: 25 }).map((_, i) => {
                  const s = leftCol[i];
                  return (
                    <tr key={i} className="divide-x divide-gray-800 h-7">
                      <td>{s ? s.seq : i + 1}</td>
                      <td className="font-medium">{s?.hakbun || ''}</td>
                      <td className="font-bold">{s?.name ? displayName(s.name) : ''}</td>
                      <td className="font-extrabold text-red-800">{s?.seat || ''}</td>
                      <td></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Right 25 */}
            <table className="w-full text-xs text-center border-collapse border border-gray-800">
              <thead className="bg-gray-100 border-b border-gray-800">
                <tr className="divide-x divide-gray-800">
                  <th className="py-1.5 px-1 w-10">연번</th>
                  <th className="py-1.5 px-2">학번</th>
                  <th className="py-1.5 px-2">성명</th>
                  <th className="py-1.5 px-2 w-14">좌석</th>
                  <th className="py-1.5 px-2 w-14">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {Array.from({ length: 25 }).map((_, i) => {
                  const s = rightCol[i];
                  return (
                    <tr key={i} className="divide-x divide-gray-800 h-7">
                      <td>{s ? s.seq : i + 26}</td>
                      <td className="font-medium">{s?.hakbun || ''}</td>
                      <td className="font-bold">{s?.name ? displayName(s.name) : ''}</td>
                      <td className="font-extrabold text-red-800">{s?.seat || ''}</td>
                      <td></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
