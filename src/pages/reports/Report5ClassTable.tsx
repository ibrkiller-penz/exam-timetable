import React, { useState } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { ReportSheetHeader } from './ReportSheetHeader';
import { PrintPageSize } from './PrintPageSize';
import { printAsImage } from './printAsImage';
import { PdfSaveButton } from './PdfSaveButton';
import { usePrintAll } from './usePrintAll';
import { buildClassTableReport } from '../../domain/reports/classTable';
import { DayIdx } from '../../domain/types';
import { Printer, Download} from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export const Report5ClassTable: React.FC = () => {
  const { students,  days, times, rooms, stages, meta } = useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();

  const [selectedBan, setSelectedBan] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<DayIdx>(1);
  const [roomOverrides, setRoomOverrides] = useState<Record<string, string>>({});

  const uniqueBans = Array.from(new Set(students.map(s => s.ban))).filter(Boolean);
  const curBan = selectedBan || uniqueBans[0] || '01반';

  const { printingAll, setPrintingAll, printAll } = usePrintAll();

  /** 한 반·한 일차의 표 한 벌. 날짜 글씨와 소속 고사실도 같이 붙여 둡니다. */
  const makeSheet = (ban: string, day: DayIdx) => {
    const rep = buildClassTableReport(ban, day, students, attendance, days, times, rooms);
    return {
      report: rep,
      dateFormatted: rep.dayDateText ? dayjs(rep.dayDateText).locale('ko').format('YYYY. M. D.(dd)') : '',
      actualRoomName: roomOverrides[ban] ?? rep.roomName,
    };
  };

  const current = makeSheet(curBan, selectedDay);
  const report = current.report;
  const dateFormatted = current.dateFormatted;
  const actualRoomName = current.actualRoomName;

  /**
   * '전체 출력'을 누르면 모든 반 × 모든 일차를 한 번에 그려 놓고 인쇄합니다.
   * 반이 열 곳이면 반과 일차를 바꿔 가며 수십 번 눌러야 했습니다.
   * 시험이 없는 일차는 빼서 빈 장이 끼지 않게 합니다.
   */
  const reportsToRender = printingAll
    ? uniqueBans.flatMap(ban =>
        ([1, 2, 3, 4, 5] as DayIdx[])
          .map(d => makeSheet(ban, d))
          .filter(x => x.report.students.length > 0 && x.report.activePeriods.length > 0),
      )
    : [current];

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <PrintPageSize />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#005691]">11-5. 학급 시험시간표</h2>
          <select
            value={curBan}
            onChange={e => setSelectedBan(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {uniqueBans.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={selectedDay}
            onChange={e => setSelectedDay(Number(e.target.value) as DayIdx)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(d => (
              <option key={d} value={d}>{d}일차</option>
            ))}
          </select>
          <div className="flex items-center text-xs font-bold text-slate-800 bg-slate-100 rounded-lg border border-slate-300 ml-2">
            <span className="pl-2 pr-1 py-1.5 whitespace-nowrap">소속 고사실:</span>
            <select
              className="bg-transparent pr-4 py-1.5 pl-1 focus:outline-none border-none cursor-pointer w-auto text-slate-900 font-extrabold"
              value={actualRoomName}
              onChange={e => setRoomOverrides({...roomOverrides, [curBan]: e.target.value})}
            >
              <option value="">-- 없음 --</option>
              {rooms.filter(r => r.roomName).map(r => (
                <option key={r.id} value={r.roomName}>{r.roomName}</option>
              ))}
              {report.roomName && !rooms.some(r => r.roomName === report.roomName) && (
                <option value={report.roomName}>{report.roomName}</option>
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* PDF 는 늘 전체를 한 파일로 담습니다. 반마다 따로 저장하면 파일이 흩어집니다. */}
          <PdfSaveButton
            filename={`${meta?.title || '고사'} 학급 시험시간표.pdf`}
            disabled={!stages.stage5}
            prepare={() => { setPrintingAll(true); return () => setPrintingAll(false); }}
          />
        <button
          onClick={printAll}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-white hover:bg-blue-50 text-[#005691] border border-[#005691] rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
          title="모든 반의 모든 일차를 한 번에 인쇄합니다."
        >
          <Printer className="w-4 h-4" /> 전체 출력
        </button>
        <button
          onClick={() => printAsImage()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" /> 이 장만 인쇄
        </button>
        <button
          onClick={() => {
            // 교시마다 과목/고사실 두 칸이라, 머리글을 두 줄로 겹쳐 씁니다.
            const header: (string | number)[] = ['번호', '성명'];
            report.activePeriods.forEach(p => header.push(`${p}교시
과목명`, `${p}교시
고사실`));
            downloadWorkbook([{
              name: `${report.ban} ${report.day}일차`,
              title: `${report.ban} 시험시간표`,
              subtitle: `${report.day}일차 ${dateFormatted} · 소속 고사실 ${actualRoomName || '없음'}`,
              headers: [header],
              rows: report.students.map(s => [
                s.num,
                displayName(s.name),
                ...report.activePeriods.flatMap(p => [s.periods[p]?.subject || '-', s.periods[p]?.room || '-']),
              ]),
              widths: [7, 12, ...report.activePeriods.flatMap(() => [18, 11])],
              numericCols: [0],
              landscape: report.activePeriods.length >= 3,
            }], `${report.ban} 시험시간표 ${report.day}일차.xlsx`);
          }}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 엑셀 내보내기
        </button>
        </div>
      </div>

      {!report || !stages.stage5 ? (
        <ReportGate what="학급 시험시간표" />
      ) : (
        <div className="print-pages flex flex-col gap-8">
          {reportsToRender.map(({ report, dateFormatted, actualRoomName }) => (() => {
            // 한 장에 30명까지 싣습니다. 넘으면 장을 나눕니다.
            const PER_PAGE = 30;
            const cnt = Math.max(1, Math.ceil(report.students.length / PER_PAGE));
            const sheets = Array.from({ length: cnt }, (_, i) => report.students.slice(i * PER_PAGE, (i + 1) * PER_PAGE));

            return sheets.map((pageStudents, pageIdx) => (
              <div
                key={`${report.ban}-${report.day}-${pageIdx}`}
                className="print-page page-portrait bg-white border border-gray-300 p-8 print:p-3 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none"
              >
                <ReportSheetHeader
                  title={`${report.ban} 시험시간표`}
                  subtitle={`${report.day}일차 · ${dateFormatted}`}
                  pageLabel={cnt > 1 ? `#${pageIdx + 1} / ${cnt}` : undefined}
                  emphasize={[1, 3]}
                  info={[
                    ['학급', report.ban],
                    ['소속 고사실', actualRoomName || '없음'],
                    ['시행일', dateFormatted || '-'],
                    ['인원', `${report.students.length}명`],
                  ]}
                />

                <table className="w-full table-fixed text-[14px] print:text-[13px] text-center border-collapse border-2 border-gray-800">
                  {/* 칸 너비를 못 박아 종이 폭을 다 쓰게 합니다. */}
                  <colgroup>
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '13%' }} />
                    {report.activePeriods.map(p => (
                      <React.Fragment key={p}>
                        <col style={{ width: `${(80 / report.activePeriods.length) * 0.62}%` }} />
                        <col style={{ width: `${(80 / report.activePeriods.length) * 0.38}%` }} />
                      </React.Fragment>
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-800 divide-x divide-gray-800">
                      <th rowSpan={2} className="py-2 px-1 font-black text-[15px]">번호</th>
                      <th rowSpan={2} className="py-2 px-1 font-black text-[15px]">성명</th>
                      {report.activePeriods.map(p => (
                        <th key={p} colSpan={2} className="py-1.5 px-1 font-black text-[16px]">
                          {p}교시
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-gray-50 border-b border-gray-800 divide-x divide-gray-800">
                      {report.activePeriods.map(p => (
                        <React.Fragment key={p}>
                          <th className="py-1 px-1 font-bold text-[12.5px] text-slate-500">과목명</th>
                          <th className="py-1 px-1 font-bold text-[12.5px] text-slate-500">고사실</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {pageStudents.map(st => (
                      <tr key={st.num} className="divide-x divide-gray-800 h-8 print:h-7">
                        <td className="font-bold text-slate-600">{st.num}</td>
                        <td className="font-black text-[16px] print:text-[15px] text-gray-900 whitespace-nowrap">{displayName(st.name)}</td>
                        {report.activePeriods.map(p => {
                          const room = st.periods[p]?.room || '-';
                          const sep = room.includes('(별)');
                          return (
                            <React.Fragment key={p}>
                              <td className="font-bold text-slate-800 break-keep leading-tight px-1">{st.periods[p]?.subject || '-'}</td>
                              <td className={`font-black text-[16px] print:text-[15px] ${sep ? 'text-amber-700' : 'text-red-700'}`}>{room}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ));
          })())}
        </div>
      )}
    </div>
  );
};
