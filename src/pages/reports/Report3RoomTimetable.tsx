import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { buildRoomTimetableReport } from '../../domain/reports/roomTimetable';
import { Printer, Download} from 'lucide-react';
import { exportMultipleDOMTablesToExcel } from '../../utils/excelExport';

export const Report3RoomTimetable: React.FC = () => {
  const { attendance, rooms, days, times, stages } = useAppStore();
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id ?? '');

  const room = rooms.find(r => r.id === selectedRoomId) ?? rooms[0];
  const report = room ? buildRoomTimetableReport(room, attendance, days, times) : null;

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#005691]">9-3. 고사실 시험시간표</h2>
          <select
            value={selectedRoomId}
            onChange={e => setSelectedRoomId(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {rooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.roomName || r.banName || '(별도실)'} {r.banName && r.banName !== r.roomName ? `(${r.banName})` : ''}
              </option>
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
          onClick={() => exportMultipleDOMTablesToExcel('table', 'Report3RoomTimetable.xlsx')}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 엑셀 내보내기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황이 확정되면 고사실 시험시간표가 생성됩니다.
        </div>
      ) : (
        <div className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="font-extrabold text-2xl text-[#005691]">고사실 시험시간표</h1>
            <span className="text-sm font-bold text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
              고사실: {room.roomName} {room.banName && room.banName !== room.roomName ? `(${room.banName})` : ''}
            </span>
          </div>

          <table className="w-full text-xs text-center border-collapse border border-gray-800">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-800 divide-x divide-gray-800">
                <th className="py-2.5 px-2 w-16">교시</th>
                <th className="py-2.5 px-2 w-20">구분</th>
                {report.activeDays.map(d => (
                  <th key={d.day} className="py-2 px-2 font-bold">
                    <div>{d.label}</div>
                    <div className="text-[11px] text-gray-600">{d.dateText}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {report.activePeriods.map(p => (
                <React.Fragment key={p}>
                  <tr className="divide-x divide-gray-800">
                    <td rowSpan={3} className="py-2 font-bold bg-gray-50 align-middle">
                      {p}교시
                    </td>
                    <td className="py-1.5 bg-gray-50 font-semibold">과목</td>
                    {report.activeDays.map(d => (
                      <td key={d.day} className="py-1.5 font-bold text-gray-900">
                        {report.grid[p][d.day]?.subject || '-'}
                      </td>
                    ))}
                  </tr>

                  <tr className="divide-x divide-gray-800">
                    <td className="py-1.5 bg-gray-50 font-semibold">응시자수</td>
                    {report.activeDays.map(d => (
                      <td key={d.day} className="py-1.5 font-semibold text-[#005691]">
                        {report.grid[p][d.day]?.stuCount ? `${report.grid[p][d.day].stuCount}명` : '-'}
                      </td>
                    ))}
                  </tr>

                  <tr className="divide-x divide-gray-800 border-b-2 border-gray-800">
                    <td className="py-1 bg-gray-50 text-[11px] text-gray-500">시험시간</td>
                    {report.activeDays.map(d => (
                      <td key={d.day} className="py-1 text-[11px] text-gray-600">
                        {report.grid[p][d.day]?.timeStr || '-'}
                      </td>
                    ))}
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
