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

  /*
   * 두 모양 가운데 고릅니다. 고른 것은 설정에 남습니다.
   *  - 좌석 + 명렬: 한 장을 반으로 나눠 위는 좌석, 아래는 명렬 40칸.
   *    감독 선생님이 한 장으로 자리도 찾고 출결도 부릅니다. (기본)
   *  - 좌석만: 좌석이 장 전체를 씁니다. 복도에 붙여 학생이 제 자리를 찾는 종이입니다.
   */
  const withRoster = (settings.seatMapStyle ?? 'roster') === 'roster';

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
        num="10-4"
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

        {/* 좌석 + 명렬 / 좌석만 */}
        <span className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          {([['roster', '좌석 + 명렬'], ['seats', '좌석만']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => updateSettings({ seatMapStyle: v })}
              className={`px-3 py-1 text-[13px] font-bold transition ${
                (settings.seatMapStyle ?? 'roster') === v ? 'bg-[#005691] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              aria-pressed={(settings.seatMapStyle ?? 'roster') === v}
            >
              {label}
            </button>
          ))}
        </span>

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
            className={`w-full grid ${withRoster ? 'gap-1.5' : 'gap-3'} flex-1 min-h-0`}
            style={{ gridTemplateColumns: `repeat(${rep.columns}, minmax(0, 1fr))` }}
          >
            {rep.grid.map((col, colIdx) => (
              <div key={colIdx} className={`flex flex-col ${withRoster ? 'gap-1' : 'gap-3'} min-h-0`}>
                <div className="text-center font-black text-[15px] text-slate-500 pb-0.5 border-b-2 border-slate-300 shrink-0">
                  {colIdx + 1}열
                </div>
                {col.map(cell => {
                  // 앉는 사람이 없는 자리도 칸은 그립니다. 교실의 실제 자리 모양과 같아야
                  // 학생이 제 자리를 세어 찾을 수 있습니다.
                  const empty = !cell.occupied;
                  /*
                   * 글자 크기는 줄 수에 맞춰 줄입니다.
                   * 좌석+명렬은 좌석이 반 장만 쓰므로 8줄, 좌석만은 10줄을 기준으로
                   * 그보다 줄이 많은 교실은 그만큼 작게 씁니다. 이름이 칸 밑으로
                   * 잘려 나가지 않게 하려는 것입니다.
                   */
                  const k = Math.min(1, (withRoster ? 8 : 10) / Math.max(1, rep.rowsPerColumn));
                  const px = (n: number) => `${Math.round(n * k * 10) / 10}px`;
                  /*
                   * 번호는 왼쪽, 세로줄 하나, 학번·이름은 오른쪽.
                   *
                   * 칸이 옆으로 넓고 위아래로 낮습니다. 세 줄(번호·학번·이름)을
                   * 쌓으면 글자를 작게 써야 했습니다. 번호를 옆으로 떼어 두 줄로
                   * 만들면 번호도 이름도 크게 쓸 수 있고, 번호만 훑어 자리를
                   * 세기도 쉽습니다.
                   */
                  return (
                    <div
                      key={cell.seat}
                      className={`rounded-lg flex-1 min-h-0 flex items-stretch overflow-hidden ${
                        empty ? 'border-2 border-dashed border-gray-300 bg-gray-50/40' : 'border-2 border-gray-800 bg-white'
                      }`}
                    >
                      <div
                        style={{ fontSize: px(withRoster ? 22 : 30) }}
                        className={`w-[36%] shrink-0 flex items-center justify-center font-black leading-none border-r-2 ${
                          empty ? 'text-gray-300 border-dashed border-gray-300' : 'text-red-700 border-gray-800'
                        }`}
                      >
                        {cell.physicalSeatNum}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-1">
                        {!empty && (
                          <>
                            <div style={{ fontSize: px(withRoster ? 11 : 14), lineHeight: 1.12 }} className="text-gray-500 font-black">{cell.hakbun}</div>
                            <div style={{ fontSize: px(withRoster ? 16 : 24), lineHeight: 1.15 }} className="font-black text-gray-900 break-keep tracking-tight truncate max-w-full">
                              {displayName(cell.name)}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {withRoster && <SeatRoster rep={rep} />}

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

/**
 * 좌석배치도 아래에 붙는 명렬.
 *
 * 감독 선생님이 출결을 부르고 답안지를 걷을 때 봅니다. 좌석 그림만으로는
 * '누가 몇 번 자리'를 한눈에 훑기 어렵습니다. 학번 순으로 두 단으로 나눠
 * 한 장에 들어가게 합니다.
 *
 * 좌석번호는 그림에 적힌 번호(교실에서의 실제 자리)를 그대로 씁니다.
 * 고사실 명단·수험표와 같은 번호입니다.
 */
const SeatRoster: React.FC<{ rep: NonNullable<ReturnType<typeof buildSeatMapReport>> }> = ({ rep }) => {
  // 그림의 자리 번호를 학번으로 찾습니다.
  const seatOf = new Map<string, number>();
  for (const col of rep.grid) for (const c of col) if (c.occupied) seatOf.set(c.hakbun, c.physicalSeatNum);

  const list = [...rep.studentList].sort((a, b) => a.seq - b.seq);
  /*
   * 늘 40칸입니다. 왼쪽 1~20, 오른쪽 21~40. 사람이 적으면 빈 줄로 남깁니다.
   * 칸 수가 교실마다 달라지면 장마다 좌석 그림 높이가 달라져 보기 어지럽습니다.
   * 40명을 넘는 교실은 없지만, 넘으면 줄을 늘려 아무도 빠지지 않게 합니다.
   */
  const half = Math.max(20, Math.ceil(list.length / 2));
  const cols = [list.slice(0, half), list.slice(half)];

  const head = 'border border-slate-400 bg-slate-700 text-white font-black text-[12px] py-[3px]';
  const cell = 'border border-slate-300 text-[12px] leading-none py-0';
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 items-start shrink-0 border-t-2 border-dashed border-slate-300 pt-3">
      {cols.map((rows, ci) => (
        <table key={ci} className="w-full table-fixed border-collapse text-center">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '18%' }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th className={head}>연번</th>
              <th className={head}>학번</th>
              <th className={head}>성명</th>
              <th className={head}>좌석</th>
              <th className={head}>비고</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: half }, (_, i) => {
              const r = rows[i];
              return (
                <tr key={i} className={i % 4 === 3 ? 'border-b-2 border-slate-400' : ''} style={{ height: '4.6mm' }}>
                  <td className={`${cell} text-slate-500`}>{r ? ci * half + i + 1 : ''}</td>
                  <td className={`${cell} font-bold`}>{r?.hakbun ?? ''}</td>
                  <td className={`${cell} font-bold`}>{r ? displayName(r.name) : ''}</td>
                  <td className={`${cell} font-black text-red-700`}>{r ? (seatOf.get(r.hakbun) ?? '') : ''}</td>
                  <td className={cell}></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
};
