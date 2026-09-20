import React, { useState } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { ReportSheetHeader } from './ReportSheetHeader';
import { PrintPageSize } from './PrintPageSize';
import { ReportActions } from './ReportActions';
import { ReportHeader } from './ReportHeader';
import { usePrintAll } from './usePrintAll';
import { printAsImage } from './printAsImage';
import { buildSeatMapReport } from '../../domain/reports/seatMap';
import { DayLabel, PeriodLabel } from '../../domain/types';
import { Printer, Download} from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';
import { saveCloudImmediately } from '../../domain/firebase';

export const Report4SeatMap: React.FC = () => {
  const { days, settings, rooms, ui, setReportSelection, updateRoom, updateSettings, stages } = useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();

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
  const { printingAll, setPrintingAll, printAll } = usePrintAll();
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyTargets, setApplyTargets] = useState<string[]>([]);

  const applicableRooms = rooms.filter(r => r.roomName && r.roomName !== '0' && r.id !== roomObj?.id);

  const applyLayout = (alsoDefault: boolean) => {
    applyTargets.forEach(id => updateRoom(id, { cols: curCols, rows: curRows, layoutDirection: curLayout }));
    // 전부 고른 경우에만 앞으로 만들 고사실의 기본값도 같이 바꿉니다.
    if (alsoDefault) updateSettings({ seatColumns: curCols, seatsPerColumn: curRows, seatLayoutDirection: curLayout });
    setApplyOpen(false);
  };

  // 전체 출력일 때 고사실마다 좌석배치도를 만듭니다.
  const seatMapOf = (roomName: string) => {
    const ro = rooms.find(x => x.roomName === roomName);
    return buildSeatMapReport(
      attendance, selectedDay, selectedPeriod, roomName,
      ro?.cols ?? settings.seatColumns,
      ro?.layoutDirection ?? settings.seatLayoutDirection ?? 'col',
      ro?.rows ?? settings.seatsPerColumn
    );
  };

  // 한 번에 인쇄하는 장들은 종이 방향이 같아야 합니다(@page 는 하나뿐).
  // 열이 많은 고사실이 하나라도 있으면 모두 가로로 눕힙니다.
  const anyWide = (printingAll ? uniqueRooms : [curRoom])
    .some(rn => (seatMapOf(rn)?.columns ?? 0) >= 6);

  const rn0 = curRoom;
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

  /** 엑셀 내보내기. 화면의 표를 긁지 않고 자료에서 바로 만듭니다. */
  const exportExcel = () => {
      // 자리 모양 그대로 옮깁니다. 한 칸이 세 줄(좌석번호 / 학번 / 성명)입니다.
      const specs = uniqueRooms.map(rn => {
        const ro = rooms.find(x => x.roomName === rn);
        const c = ro?.cols ?? settings.seatColumns;
        const rws = ro?.rows ?? settings.seatsPerColumn;
        const rep = buildSeatMapReport(attendance, selectedDay, selectedPeriod, rn, c, ro?.layoutDirection ?? 'col', rws);
        if (!rep) return null;
        const rowCount = Math.max(...rep.grid.map(col => col.length), 0);
        const body: (string | number)[][] = [];
        for (let i = 0; i < rowCount; i++) {
          body.push(rep.grid.map(col => col[i]?.physicalSeatNum ?? ''));
          body.push(rep.grid.map(col => col[i]?.hakbun ?? ''));
          body.push(rep.grid.map(col => (col[i]?.name ? displayName(col[i].name) : '')));
        }
        return {
          name: rn,
          title: rep.isWaitRoom ? '대기실 좌석배치도' : '고사실 좌석배치도',
          subtitle: `${dayDate || ''} ${rep.period} · ${rep.examRoom} · ${rep.subject} · ${rep.totalStudents}명 — 위쪽이 교탁입니다.`,
          headers: [rep.grid.map((_, i) => `${i + 1}열`)],
          rows: body,
          widths: rep.grid.map(() => 15),
          big: true,
          landscape: rep.columns >= 6,
        };
      }).filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (specs.length === 0) return;
      downloadWorkbook(specs, `좌석배치도 ${selectedDay} ${selectedPeriod}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <PrintPageSize landscape={anyWide} />
      <ReportHeader
        num="11-4"
        title="고사실 좌석배치도"
        actions={
          <ReportActions
            disabled={!stages.stage5}
            onExcel={exportExcel}
            pdfFilename={`좌석배치도 ${selectedDay} ${selectedPeriod}.pdf`}
            pdfAllFilename={`좌석배치도 ${selectedDay} ${selectedPeriod} 전체.pdf`}
            prepareAll={() => { setPrintingAll(true); return () => setPrintingAll(false); }}
            onPrint={() => printAsImage()}
            onPrintAll={printAll}
          />
        }
      >
        <select
          value={selectedDay}
          onChange={e => setReportSelection({ day: e.target.value as any })}
          className="report-select"
        >
          {[1, 2, 3, 4, 5].map(d => (
            <option key={d} value={`${d}일차`}>{`${d}일차`}</option>
          ))}
        </select>
        <select
          value={selectedPeriod}
          onChange={e => setReportSelection({ period: e.target.value as any })}
          className="report-select"
        >
          {[1, 2, 3, 4, 5].map(p => (
            <option key={p} value={`${p}교시`}>{`${p}교시`}</option>
          ))}
        </select>
        <select
          value={curRoom}
          onChange={e => setReportSelection({ room: e.target.value })}
          className="report-select"
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
      </ReportHeader>

      {!report || !stages.stage5 ? (
        <ReportGate what="좌석배치도" emptyHint="그 날짜·교시에 이 고사실을 쓰지 않습니다. 위에서 다른 고사실을 골라 보세요." />
      ) : (
        /* 학생들이 복도에 서서 자기 자리를 찾는 종이입니다.
           제목을 크게 쓰고, 좌석 칸이 페이지를 꽉 채우도록 늘립니다.
           전체 출력일 때는 이 교시의 모든 고사실을 한 번에 그립니다. */
        <div className="print-pages flex flex-col gap-8">
          {(printingAll ? uniqueRooms : [rn0]).map(rn => {
            const rep = rn === rn0 ? report : seatMapOf(rn);
            if (!rep) return null;
            return (
        <div key={rn} className={`print-page ${anyWide ? 'page-landscape' : 'page-portrait'} bg-white border border-gray-300 p-8 rounded-xl shadow-xs mx-auto flex flex-col`}>
          <ReportSheetHeader
            title={rep.isWaitRoom ? '대기실 좌석배치도' : '고사실 좌석배치도'}
            subtitle={`${rep.examRoom} · ${rep.period} · ${rep.subject}`}
            infoColumns="1.5fr 0.9fr 1fr 1.7fr 1fr"
            emphasize={[2, 4]}
            info={[
              ['시행일', dayDate || '-'],
              ['교시', rep.period],
              ['고사실', rep.examRoom],
              ['과목(단위)', rep.subject],
              ['응시인원', `${rep.totalStudents}명`],
            ]}
          />

          {/* 교탁 — 어느 쪽이 앞인지 한눈에 보여야 자리를 제대로 찾습니다. */}
          <div className="flex justify-center mb-3 shrink-0">
            <div className="w-2/3 py-2 bg-gray-800 text-white text-center font-black text-[18px] rounded tracking-widest">
              교 탁 (앞)
            </div>
          </div>

          {/* 좌석 — 남는 높이를 나눠 가져 페이지를 꽉 채웁니다. */}
          <div
            className="w-full grid gap-3 flex-1"
            style={{ gridTemplateColumns: `repeat(${rep.columns}, minmax(0, 1fr))` }}
          >
            {rep.grid.map((col, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-3 min-h-0">
                <div className="text-center font-black text-[15px] text-slate-500 pb-0.5 border-b-2 border-slate-300 shrink-0">
                  {colIdx + 1}열
                </div>
                {col.map(cell => {
                  // 앉는 사람이 없는 자리도 칸은 그립니다. 교실의 실제 자리 모양과 같아야
                  // 학생이 제 자리를 세어 찾을 수 있습니다.
                  const empty = !cell.name;
                  return (
                    <div
                      key={cell.seat}
                      className={`px-2 py-2 text-center rounded-lg flex-1 flex flex-col items-center justify-center min-h-[58px] ${
                        empty ? 'border-2 border-dashed border-gray-300 bg-gray-50/40' : 'border-2 border-gray-800 bg-white'
                      }`}
                    >
                      <div className={`font-black text-[23px] leading-none ${empty ? 'text-gray-300' : 'text-red-700'}`}>
                        {cell.physicalSeatNum}
                      </div>
                      {!empty && (
                        <>
                          <div className="text-[13px] text-gray-500 font-black leading-tight mt-0.5">{cell.hakbun}</div>
                          <div className="text-[23px] font-black text-gray-900 leading-tight break-keep tracking-tight">
                            {displayName(cell.name)}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 이 교실 소속이지만 별도 고사실에서 보는 학생.
              자리에서는 빼되, 감독 선생님이 누가 없는지 알아야 합니다. */}
          {(() => {
            const away = attendance
              .filter(r => r.day === selectedDay && r.period === selectedPeriod && r.examRoom === rn && r.separateRoom)
              .sort((a, b) => a.seq - b.seq);
            if (away.length === 0) return null;
            return (
              <div className="mt-4 border-2 border-slate-800 rounded-lg px-4 py-3 shrink-0">
                <div className="font-black text-[15px] text-slate-700 mb-1.5">별도 고사실 응시</div>
                <ul className="space-y-0.5">
                  {away.map(r => (
                    <li key={r.key3} className="text-[17px] font-black text-slate-900">
                      {`${r.grade}${String(r.ban).replace('반', '').padStart(2, '0')}${String(r.num).padStart(2, '0')}`}
                      {' / '}
                      {displayName(r.name)}
                      <span className="font-bold text-slate-600"> 학생은 별도실({r.separateRoom}실)에서 응시합니다.</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
            );
          })}
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
