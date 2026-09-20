import React, { useState } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { ReportSheetHeader } from './ReportSheetHeader';
import { PrintPageSize } from './PrintPageSize';
import { PdfSaveButton } from './PdfSaveButton';
import { usePrintAll } from './usePrintAll';
import { printAsImage } from './printAsImage';
import { buildExamRoomReport } from '../../domain/reports/examRoom';
import { DayLabel, PeriodLabel } from '../../domain/types';
import { Printer, Download} from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';

export const Report2ExamRoom: React.FC = () => {
  const { stages, days, rooms } = useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();

  const [selectedDay, setSelectedDay] = useState<DayLabel>('1일차');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodLabel>('1교시');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const { printingAll, setPrintingAll, printAll } = usePrintAll();

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
      <PrintPageSize />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#005691]">11-2. 고사실 명단</h2>
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
          onClick={printAll}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#00426e] hover:bg-[#003356] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
          title="이 교시의 모든 고사실을 한 번에 인쇄합니다."
        >
          <Printer className="w-4 h-4" /> 전체 출력
        </button>
        <PdfSaveButton filename={`고사실 명단 ${selectedDay} ${selectedPeriod}.pdf`} disabled={!stages.stage5}
          prepare={() => { setPrintingAll(true); return () => setPrintingAll(false); }} />
        <button
          onClick={() => printAsImage()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
        <button
          onClick={() => {
            // 한 실만 뽑으면 쓸 때마다 날짜·교시를 바꿔 가며 몇 번씩 눌러야 합니다.
            // 그 교시의 고사실을 전부 한 파일에, 실마다 시트 하나로 내보냅니다.
            const specs = uniqueRooms
              .map(rn => buildExamRoomReport(attendance, selectedDay, selectedPeriod, rn, rooms))
              .filter((x): x is NonNullable<typeof x> => Boolean(x))
              .map(rep => ({
                name: rep.examRoom,
                title: rep.isWaitRoom ? '대기실 인원현황표' : '고사실 응시현황표',
                subtitle: `${dayDate || ''} ${rep.period} · ${rep.examRoom} · ${rep.subject} · ${rep.totalStudents}명`,
                headers: [['연번', '학번', '성명', '좌석', '비고']],
                rows: rep.students.map(s => [s.seq, s.hakbun, displayName(s.name), s.seat ?? '', s.note]),
                widths: [7, 11, 12, 7, 14],
                numericCols: [0, 3],
              }));
            if (specs.length === 0) return;
            downloadWorkbook(specs, `고사실 명단 ${selectedDay} ${selectedPeriod}.xlsx`);
          }}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 엑셀 내보내기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <ReportGate what="고사실 명단" emptyHint="그 날짜·교시에 이 고사실을 쓰지 않습니다. 위에서 다른 고사실을 골라 보세요." />
      ) : (
        <div className="print-pages flex flex-col gap-8">
          {(printingAll ? uniqueRooms : [curRoom]).map(rn => {
            const rep = rn === curRoom ? report : buildExamRoomReport(attendance, selectedDay, selectedPeriod, rn, rooms);
            if (!rep) return null;
            const cnt = Math.max(1, Math.ceil(rep.students.length / PER_PAGE));
            const sheets = Array.from({ length: cnt }, (_, i) => rep.students.slice(i * PER_PAGE, (i + 1) * PER_PAGE));

            return sheets.map((pageStudents, pageIdx) => {
              // 20명까지는 한 칸으로 가운데 놓습니다. 한 칸에 다 들어가는데 두 칸으로
              // 벌리면 오른쪽이 통째로 비어 종이가 한쪽으로 쏠려 보입니다.
              // 20명을 넘으면 왼쪽을 20까지 채우고 나머지를 오른쪽에 둡니다.
              const oneColumn = pageStudents.length <= PER_COL;
              const cols = oneColumn ? [0] : [0, 1];
              const isLastPage = pageIdx === sheets.length - 1;

              return (
              <div
                key={`${rn}-${pageIdx}`}
                className="print-page page-portrait bg-white border border-gray-300 p-8 print:p-3 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none"
              >
                <ReportSheetHeader
                  title={rep.isWaitRoom ? '대기실 인원현황표' : '고사실 응시현황표'}
                  subtitle={`${rep.examRoom} · ${rep.period} · ${rep.subject}`}
                  pageLabel={cnt > 1 ? `#${pageIdx + 1} / ${cnt}` : undefined}
                  infoColumns="1.5fr 0.9fr 1fr 1.7fr 1fr"
                  emphasize={[2, 4]}
                  info={[
                    ['시행일', dayDate || '-'],
                    ['교시', rep.period],
                    ['고사실', rep.examRoom],
                    ['과목(단위)', rep.subject],
                    ['응시인원', `${rep.totalStudents}명${rep.separate.length ? ` (별도 ${rep.separate.length})` : ''}`],
                  ]}
                />

                <div className={`grid gap-3 ${oneColumn ? 'grid-cols-1 max-w-[62%] mx-auto' : 'grid-cols-2'}`}>
                  {cols.map(colIdx => (
                    <table key={colIdx} className="w-full table-fixed text-[14px] print:text-[12.5px] text-center border-collapse border-2 border-gray-800">
                      {/* 칸 너비를 못 박아 둡니다. 안 그러면 인쇄할 때 성명이 두 줄로 접혀
                          줄 높이가 배가 되고, 한 장에 실리는 줄 수가 줄어듭니다. */}
                      <colgroup>
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '27%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <thead className="bg-gray-100 border-b border-gray-800">
                        <tr className="divide-x divide-gray-800">
                          <th className="py-1.5 px-1 font-black">연번</th>
                          <th className="py-1.5 px-1 font-black">학번</th>
                          <th className="py-1.5 px-1 font-black">성명</th>
                          <th className="py-1.5 px-1 font-black">좌석</th>
                          <th className="py-1.5 px-1 font-black">비고</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {/* 한 칸을 20줄로 고정합니다. 사람이 적어도 칸 수는 같아 종이 모양이 일정합니다. */}
                        {Array.from({ length: PER_COL }).map((_, i) => {
                          const st = pageStudents[colIdx * PER_COL + i];
                          return (
                            <tr key={i} className="divide-x divide-gray-800 h-8 print:h-7 align-middle">
                              <td className="align-middle text-slate-500">{st ? st.seq : ''}</td>
                              <td className="align-middle font-bold text-slate-700 whitespace-nowrap">{st?.hakbun || ''}</td>
                              <td className="align-middle font-black text-[16px] print:text-[14px] text-slate-900 whitespace-nowrap">
                                {st?.name ? displayName(st.name) : ''}
                              </td>
                              <td className="align-middle font-black text-[17px] print:text-[15px] text-red-700">{st?.seat || ''}</td>
                              <td className="align-middle text-[11px] print:text-[10px] font-bold text-slate-700 whitespace-nowrap">{st?.note || ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ))}
                </div>

                {/* 이 교실 소속이지만 별도 고사실에서 보는 학생. 명단에서 빼고 여기서 알립니다. */}
                {isLastPage && rep.separate.length > 0 && (
                  <div className="mt-4 border-2 border-slate-800 rounded-lg px-4 py-3">
                    <div className="font-black text-[14px] text-slate-700 mb-1.5">별도 고사실 응시</div>
                    <ul className="space-y-0.5">
                      {rep.separate.map(s => (
                        <li key={s.hakbun} className="text-[15px] font-black text-slate-900">
                          {s.hakbun} / {displayName(s.name)}
                          <span className="font-bold text-slate-600"> 학생은 별도실({s.room}실)에서 응시합니다.</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              );
            });
          })}
        </div>
      )}
    </div>
  );
};
