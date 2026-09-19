const fs = require('fs');

// Report1GradeTable.tsx (9-1)
fs.writeFileSync('src/pages/reports/Report1GradeTable.tsx', `import React from 'react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots, selSubjectBanEntries } from '../../store/selectors';
import { buildGradeTable } from '../../domain/reports/gradeTable';
import { Printer } from 'lucide-react';

export const Report1GradeTable: React.FC = () => {
  const { meta, rooms, days, times, placement, stages } = useAppStore();
  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  const { columns, rows } = buildGradeTable(rooms, days, times, placementSlots, placement, entries);

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex items-center justify-between mb-4 no-print">
        <h2 className="text-xl font-bold text-gray-900">9-1. 전체 시험시간표</h2>
        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-40"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
      </div>

      {!stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황(8단계)이 확정되면 전체 시험시간표가 생성됩니다.
        </div>
      ) : (
        <div className="print-page page-landscape bg-white border border-gray-300 p-6 rounded-xl shadow-xs">
          <h1 className="text-center font-extrabold text-2xl mb-6 text-gray-900">
            {meta.title}
          </h1>

          <table className="w-full text-xs text-center border-collapse border border-gray-800">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-800 divide-x divide-gray-800">
                <th className="py-2.5 px-2 w-20">날짜</th>
                <th className="py-2.5 px-2 w-28">구분</th>
                {columns.map(c => (
                  <th key={c.id} className="py-2.5 px-1 font-bold">
                    {c.roomName}
                  </th>
                ))}
                <th className="py-2.5 px-2 w-16 font-bold">인원계</th>
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
                        className="py-2 px-2 font-bold whitespace-pre-line bg-gray-50 align-middle"
                      >
                        {r.dateText}
                      </td>
                    )}
                    <td className="py-1.5 px-2 font-semibold bg-gray-50">{r.periodLabel}</td>
                    {r.cells.map((cell, cIdx) => (
                      <td key={cIdx} className="py-1.5 px-1 font-medium">
                        {cell.subject}
                      </td>
                    ))}
                    <td className="py-1.5 px-1 bg-gray-50">-</td>
                  </tr>

                  {/* Row 2: StuCount & Time */}
                  <tr className="divide-x divide-gray-800 border-b-2 border-gray-800">
                    <td className="py-1 px-2 text-[11px] text-gray-600 bg-gray-50">{r.timeRange}</td>
                    {r.cells.map((cell, cIdx) => (
                      <td key={cIdx} className="py-1 px-1 font-semibold text-gray-800">
                        {cell.stuCount}
                      </td>
                    ))}
                    <td className="py-1 px-1 font-bold text-blue-800 bg-gray-50">
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
`, 'utf8');

// Report2ExamRoom.tsx (9-2)
fs.writeFileSync('src/pages/reports/Report2ExamRoom.tsx', `import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { buildExamRoomReport } from '../../domain/reports/examRoom';
import { DayLabel, PeriodLabel } from '../../domain/types';
import { Printer } from 'lucide-react';

export const Report2ExamRoom: React.FC = () => {
  const { attendance, stages, days } = useAppStore();

  const [selectedDay, setSelectedDay] = useState<DayLabel>('1일차');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodLabel>('1교시');
  const [selectedRoom, setSelectedRoom] = useState<string>('1-1');

  const uniqueRooms = Array.from(new Set(attendance.map(r => r.examRoom))).filter(Boolean);
  const curRoom = selectedRoom || uniqueRooms[0] || '1-1';

  const report = buildExamRoomReport(attendance, selectedDay, selectedPeriod, curRoom);

  const leftCol = report ? report.students.slice(0, 25) : [];
  const rightCol = report ? report.students.slice(25, 50) : [];

  const dayDate = days[Number(selectedDay.replace('일차', '')) - 1]?.date ?? '';

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">9-2. 고사실 응시현황표</h2>
          <select
            value={selectedDay}
            onChange={e => setSelectedDay(e.target.value as DayLabel)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(d => (
              <option key={d} value={\`\${d}일차\`}>{\`\${d}일차\`}</option>
            ))}
          </select>
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value as PeriodLabel)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(p => (
              <option key={p} value={\`\${p}교시\`}>{\`\${p}교시\`}</option>
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
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-40"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황이 없거나 선택한 교시에 해당 고사실 배치가 없습니다.
        </div>
      ) : (
        <div className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs max-w-4xl mx-auto">
          <h1 className="text-center font-extrabold text-2xl mb-6 text-gray-900">
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
            <div className="py-1.5 border-t border-gray-800 font-bold text-blue-700">{report.totalStudents}명</div>
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
                      <td className="font-bold">{s?.name || ''}</td>
                      <td className="font-extrabold text-blue-800">{s?.seat || ''}</td>
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
                      <td className="font-bold">{s?.name || ''}</td>
                      <td className="font-extrabold text-blue-800">{s?.seat || ''}</td>
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
`, 'utf8');

// Report3RoomTimetable.tsx (9-3)
fs.writeFileSync('src/pages/reports/Report3RoomTimetable.tsx', `import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { buildRoomTimetableReport } from '../../domain/reports/roomTimetable';
import { Printer } from 'lucide-react';

export const Report3RoomTimetable: React.FC = () => {
  const { attendance, rooms, days, times, stages } = useAppStore();
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id ?? '');

  const room = rooms.find(r => r.id === selectedRoomId) ?? rooms[0];
  const report = room ? buildRoomTimetableReport(room, attendance, days, times) : null;

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">9-3. 고사실 시험시간표</h2>
          <select
            value={selectedRoomId}
            onChange={e => setSelectedRoomId(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {rooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.roomName || '(별도실)'} ({r.banName || '별도실'})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-40"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황이 확정되면 고사실 시험시간표가 생성됩니다.
        </div>
      ) : (
        <div className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="font-extrabold text-2xl text-gray-900">고사실 시험시간표</h1>
            <span className="text-sm font-bold text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
              고사실: {room.roomName} ({room.banName || '별도실'})
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
                      <td key={d.day} className="py-1.5 font-semibold text-blue-700">
                        {report.grid[p][d.day]?.stuCount ? \`\${report.grid[p][d.day].stuCount}명\` : '-'}
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
`, 'utf8');

// Report4SeatMap.tsx (9-4)
fs.writeFileSync('src/pages/reports/Report4SeatMap.tsx', `import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { buildSeatMapReport } from '../../domain/reports/seatMap';
import { DayLabel, PeriodLabel } from '../../domain/types';
import { Printer } from 'lucide-react';

export const Report4SeatMap: React.FC = () => {
  const { attendance, stages, days, settings, updateSettings } = useAppStore();

  const [selectedDay, setSelectedDay] = useState<DayLabel>('1일차');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodLabel>('1교시');
  const [selectedRoom, setSelectedRoom] = useState<string>('1-1');

  const uniqueRooms = Array.from(new Set(attendance.map(r => r.examRoom))).filter(Boolean);
  const curRoom = selectedRoom || uniqueRooms[0] || '1-1';

  const report = buildSeatMapReport(attendance, selectedDay, selectedPeriod, curRoom, settings.seatColumns);
  const dayDate = days[Number(selectedDay.replace('일차', '')) - 1]?.date ?? '';

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">9-4. 고사실 좌석배치도</h2>
          <select
            value={selectedDay}
            onChange={e => setSelectedDay(e.target.value as DayLabel)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(d => (
              <option key={d} value={\`\${d}일차\`}>{\`\${d}일차\`}</option>
            ))}
          </select>
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value as PeriodLabel)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(p => (
              <option key={p} value={\`\${p}교시\`}>{\`\${p}교시\`}</option>
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

          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-gray-600">열수:</span>
            <input
              type="number"
              min={3}
              max={8}
              value={settings.seatColumns}
              onChange={e => updateSettings({ seatColumns: Number(e.target.value) || 5 })}
              className="w-12 px-1.5 py-1 border border-gray-300 rounded text-center text-xs"
            />
          </div>
        </div>

        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-40"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황이 없거나 선택한 교시에 해당 고사실 배치가 없습니다.
        </div>
      ) : (
        <div className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs max-w-4xl mx-auto">
          <h1 className="text-center font-extrabold text-2xl mb-6 text-gray-900">
            {report.isWaitRoom ? '대기실 좌석배치도' : '고사실 좌석배치도'}
          </h1>

          <div className="border border-gray-800 grid grid-cols-5 text-center text-xs mb-6">
            <div className="py-1.5 bg-gray-100 font-bold border-r border-gray-800">시행일</div>
            <div className="py-1.5 bg-gray-100 font-bold border-r border-gray-800">교시</div>
            <div className="py-1.5 bg-gray-100 font-bold border-r border-gray-800">고사실</div>
            <div className="py-1.5 bg-gray-100 font-bold border-r border-gray-800">과목(단위)</div>
            <div className="py-1.5 bg-gray-100 font-bold">응시인원</div>

            <div className="py-1.5 border-t border-r border-gray-800">{dayDate || '-'}</div>
            <div className="py-1.5 border-t border-r border-gray-800">{report.period}</div>
            <div className="py-1.5 border-t border-r border-gray-800 font-bold">{report.examRoom}</div>
            <div className="py-1.5 border-t border-r border-gray-800 font-semibold">{report.subject}</div>
            <div className="py-1.5 border-t border-gray-800 font-bold text-blue-700">{report.totalStudents}명</div>
          </div>

          {/* Podium (교탁) */}
          <div className="flex justify-center mb-4">
            <div className="w-36 py-1.5 bg-gray-200 text-gray-800 text-center font-bold text-xs rounded border border-gray-400 shadow-xs">
              【 교 탁 (앞) 】
            </div>
          </div>

          {/* Seat Grid: Columns right to left or left to right */}
          <div
            className="grid gap-3 mb-8"
            style={{ gridTemplateColumns: \`repeat(\${report.columns}, minmax(0, 1fr))\` }}
          >
            {report.grid.map((col, colIdx) => (
              <div key={colIdx} className="space-y-2">
                <div className="text-center font-bold text-xs text-gray-600 pb-1 border-b border-gray-200">
                  {colIdx + 1}열
                </div>
                {col.map(cell => (
                  <div
                    key={cell.seat}
                    className="border border-gray-800 p-2 text-center rounded bg-gray-50/70 shadow-xs"
                  >
                    <div className="font-extrabold text-sm text-blue-800">좌석 {cell.seat}</div>
                    <div className="text-[11px] text-gray-600 font-medium">{cell.hakbun}</div>
                    <div className="text-xs font-bold text-gray-900">{cell.name}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
`, 'utf8');

console.log('Reports 1-4 written.');
