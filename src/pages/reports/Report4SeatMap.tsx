import React, { useState } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
import { ReportGate } from './ReportGate';
import { buildSeatMapReport } from '../../domain/reports/seatMap';
import { DayLabel, PeriodLabel } from '../../domain/types';
import { Printer, Download} from 'lucide-react';
import { exportMultipleDOMTablesToExcel } from '../../utils/excelExport';
import { saveCloudImmediately } from '../../domain/firebase';

export const Report4SeatMap: React.FC = () => {
  const { attendance, days, settings, rooms, ui, setReportSelection, updateRoom, updateSettings, stages } = useAppStore();

  const selectedDay = ui.report.day || '1일차';
  const selectedPeriod = ui.report.period || '1교시';
  const selectedRoom = ui.report.room || '';

  const uniqueRooms = Array.from(new Set(attendance.map(r => r.examRoom))).filter(Boolean);
  const curRoom = selectedRoom || uniqueRooms[0] || '1-1';
  const roomObj = rooms.find(r => r.roomName === curRoom);
  const curCols = roomObj?.cols ?? settings.seatColumns;
  const curRows = roomObj?.rows ?? settings.seatsPerColumn;
  const curLayout = roomObj?.layoutDirection ?? settings.seatLayoutDirection ?? 'col';

  // 지금 열·행·배치순서를 어느 고사실에 옮길지 고르는 창.
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyTargets, setApplyTargets] = useState<string[]>([]);

  const applicableRooms = rooms.filter(r => r.roomName && r.roomName !== '0' && r.id !== roomObj?.id);

  const applyLayout = (alsoDefault: boolean) => {
    applyTargets.forEach(id => updateRoom(id, { cols: curCols, rows: curRows, layoutDirection: curLayout }));
    // 전부 고른 경우에만 앞으로 만들 고사실의 기본값도 같이 바꿉니다.
    if (alsoDefault) updateSettings({ seatColumns: curCols, seatsPerColumn: curRows, seatLayoutDirection: curLayout });
    setApplyOpen(false);
  };

  const report = buildSeatMapReport(
    attendance, 
    selectedDay, 
    selectedPeriod, 
    curRoom, 
    curCols, 
    curLayout,
    curRows
  );
  const dayDate = days[Number(selectedDay.replace('일차', '')) - 1]?.date ?? '';

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#005691]">10-4. 고사실 좌석배치도</h2>
          <select
            value={selectedDay}
            onChange={e => setReportSelection({ day: e.target.value as any })}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(d => (
              <option key={d} value={`${d}일차`}>{`${d}일차`}</option>
            ))}
          </select>
          <select
            value={selectedPeriod}
            onChange={e => setReportSelection({ period: e.target.value as any })}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(p => (
              <option key={p} value={`${p}교시`}>{`${p}교시`}</option>
            ))}
          </select>
          <select
            value={curRoom}
            onChange={e => setReportSelection({ room: e.target.value })}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {uniqueRooms.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-gray-600">열수(가로):</span>
            <input
              type="number"
              min={3}
              max={10}
              value={curCols}
              onChange={e => roomObj && updateRoom(roomObj.id, { cols: Number(e.target.value) || 5 })}
              className="w-12 px-1.5 py-1 border border-gray-300 rounded text-center text-xs"
            />
          </div>
          
          <div className="flex items-center gap-1.5 text-xs ml-2">
            <span className="font-semibold text-gray-600">행수(세로):</span>
            <input
              type="number"
              min={3}
              max={15}
              value={curRows}
              onChange={e => roomObj && updateRoom(roomObj.id, { rows: Number(e.target.value) || 8 })}
              className="w-12 px-1.5 py-1 border border-gray-300 rounded text-center text-xs"
            />
          </div>
          
          <div className="flex items-center gap-1.5 text-xs ml-2">
            <span className="font-semibold text-gray-600">배치순서:</span>
            <select
              value={curLayout}
              onChange={e => roomObj && updateRoom(roomObj.id, { layoutDirection: e.target.value as 'col' | 'row' })}
              className="px-2 py-1 bg-white border border-gray-300 rounded text-xs"
            >
              <option value="col">세로(한쪽)로 먼저 몰기</option>
              <option value="row">가로(앞자리)로 먼저 채우기</option>
            </select>
          </div>
          
          {/* 교실 구조가 같은 고사실끼리만 묶어 적용할 수 있어야 합니다.
              세미나실과 일반 교실은 열·행이 다릅니다. */}
          <button
            onClick={() => { setApplyTargets(rooms.filter(r => r.id !== roomObj?.id).map(r => r.id)); setApplyOpen(true); }}
            disabled={!roomObj}
            className="ml-2 px-3 py-1 bg-[#005691] hover:bg-[#004270] text-white rounded font-bold shadow-sm transition flex items-center gap-1 text-[13px] disabled:bg-gray-200 disabled:text-gray-400"
            title="지금 열·행·배치순서를 다른 고사실에도 적용합니다."
          >
            💾 다른 고사실에도 적용
          </button>
        </div>

        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
        <button
          onClick={() => exportMultipleDOMTablesToExcel('table', 'Report4SeatMap.xlsx')}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 엑셀 내보내기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <ReportGate what="좌석배치도" emptyHint="그 날짜·교시에 이 고사실을 쓰지 않습니다. 위에서 다른 고사실을 골라 보세요." />
      ) : (
        /* 열이 많으면 세로 A4에 칸이 눌려 이름이 읽히지 않습니다. 그때는 가로로 눕힙니다. */
        <div className={`print-page ${report.columns >= 6 ? 'page-landscape' : 'page-portrait'} bg-white border border-gray-300 p-8 rounded-xl shadow-xs mx-auto`}>
          <h1 className="text-center font-extrabold text-2xl mb-6 text-[#005691]">
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
            <div className="py-1.5 border-t border-gray-800 font-bold text-[#005691]">{report.totalStudents}명</div>
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
            style={{ gridTemplateColumns: `repeat(${report.columns}, minmax(0, 1fr))` }}
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
                    <div className="font-extrabold text-sm text-red-800">좌석 {cell.physicalSeatNum}</div>
                    <div className="text-[11px] text-gray-600 font-medium">{cell.hakbun}</div>
                    <div className="text-xs font-bold text-gray-900">{displayName(cell.name)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 어느 고사실에 같이 적용할지 고릅니다. */}
      {applyOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6 no-print" onClick={() => setApplyOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#005691] text-white px-5 py-4">
              <div className="font-black text-[17px]">다른 고사실에도 적용</div>
              <div className="text-[13px] text-blue-100 font-medium mt-0.5">
                {curRoom} 기준 — {curCols}열 × {curRows}행 · {curLayout === 'col' ? '세로 먼저' : '가로 먼저'}
              </div>
            </div>

            <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
              <button
                onClick={() => setApplyTargets(applicableRooms.map(r => r.id))}
                className="px-2.5 py-1 text-[13px] font-bold bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                전체 선택
              </button>
              <button
                onClick={() => setApplyTargets([])}
                className="px-2.5 py-1 text-[13px] font-bold bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                전체 해제
              </button>
              <span className="text-[13px] text-slate-500 ml-auto">{applyTargets.length}실 선택됨</span>
            </div>

            <div className="p-5 overflow-auto grid grid-cols-2 gap-1.5">
              {applicableRooms.map(r => {
                const on = applyTargets.includes(r.id);
                return (
                  <label
                    key={r.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                      on ? 'bg-blue-50 border-[#005691]' : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setApplyTargets(prev => on ? prev.filter(id => id !== r.id) : [...prev, r.id])}
                      className="w-4 h-4 rounded accent-[#005691]"
                    />
                    <span className="font-bold text-[14px] text-slate-800">{r.roomName}</span>
                    <span className="text-[12px] text-slate-400 ml-auto">
                      {(r.cols ?? settings.seatColumns)}×{(r.rows ?? settings.seatsPerColumn)}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setApplyOpen(false)}
                className="px-4 py-2 bg-white hover:bg-gray-100 text-slate-700 border border-gray-300 rounded-lg font-bold text-[14px]"
              >
                취소
              </button>
              <button
                onClick={() => applyLayout(applyTargets.length === applicableRooms.length)}
                disabled={applyTargets.length === 0}
                className="px-4 py-2 bg-[#005691] hover:bg-[#00426e] text-white rounded-lg font-bold text-[14px] disabled:bg-gray-200 disabled:text-gray-400"
              >
                {applyTargets.length}실에 적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
