import React, { useState } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { ReportSheetHeader } from './ReportSheetHeader';
import { PrintPageSize } from './PrintPageSize';
import { printAsImage } from './printAsImage';
import { FitCell } from './FitText';
import { ReportActions } from './ReportActions';
import { ReportHeader, HeaderDivider, HeaderLabel } from './ReportHeader';
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

  /** 엑셀 내보내기. 지금 고른 반·일차를 한 시트로 씁니다. */
  const exportExcel = () => {
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
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <PrintPageSize />
      <ReportHeader
        num="11-5"
        title="학급 시험시간표"
        actions={
          <ReportActions
            disabled={!stages.stage5}
            onExcel={exportExcel}
            pdfFilename={`${report.ban} 시험시간표 ${report.day}일차.pdf`}
            pdfAllFilename={`${meta?.title || '고사'} 학급 시험시간표 전체.pdf`}
            prepareAll={() => { setPrintingAll(true); return () => setPrintingAll(false); }}
            onPrint={() => printAsImage()}
            onPrintAll={printAll}
          />
        }
      >
        <select
          value={curBan}
          onChange={e => setSelectedBan(e.target.value)}
          className="report-select"
        >
          {uniqueBans.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select
          value={selectedDay}
          onChange={e => setSelectedDay(Number(e.target.value) as DayIdx)}
          className="report-select"
        >
          {[1, 2, 3, 4, 5].map(d => (
            <option key={d} value={d}>{d}일차</option>
          ))}
        </select>
        <HeaderDivider />
        <HeaderLabel>소속 고사실</HeaderLabel>
        <select
          className="report-select"
          value={actualRoomName}
          onChange={e => setRoomOverrides({ ...roomOverrides, [curBan]: e.target.value })}
        >
          <option value="">-- 없음 --</option>
          {rooms.filter(r => r.roomName).map(r => (
            <option key={r.id} value={r.roomName}>{r.roomName}</option>
          ))}
          {report.roomName && !rooms.some(r => r.roomName === report.roomName) && (
            <option value={report.roomName}>{report.roomName}</option>
          )}
        </select>
      </ReportHeader>

      {!report || !stages.stage5 ? (
        <ReportGate what="학급 시험시간표" />
      ) : (
        <div className="print-pages flex flex-col gap-8">
          {reportsToRender.map(({ report, dateFormatted, actualRoomName }) => (() => {
            /*
             * 한 장은 언제나 35줄입니다.
             *
             * 학급마다 인원이 다르다고 표 크기가 달라지면, 같은 고사에서 나온
             * 서류로 보이지 않고 반끼리 견주기도 어렵습니다. 24명이면 25~35번
             * 줄을 빈 줄로 둡니다. 감독 선생님이 결시 학생을 적어 넣기도 합니다.
             *
             * 줄 높이는 못 박습니다(ROW_H). 남는 높이를 줄마다 나눠 가지면
             * 빈 줄은 글자가 없어 높이가 0이 되고, 글자 있는 줄만 커집니다.
             */
            const PER_PAGE = 35;
            const ROW_H = 22;
            const cnt = Math.max(1, Math.ceil(report.students.length / PER_PAGE));
            const sheets = Array.from({ length: cnt }, (_, i) => report.students.slice(i * PER_PAGE, (i + 1) * PER_PAGE));

            return sheets.map((pageStudents, pageIdx) => (
              <div
                key={`${report.ban}-${report.day}-${pageIdx}`}
                className="print-page page-portrait bg-white border border-gray-300 p-6 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none"
              >
                {/* 소속 고사실을 바꾸면 제목도 따라갑니다.
                    학급과 고사실이 같은 보통의 경우에는 군더더기라 붙이지 않습니다. */}
                <ReportSheetHeader
                  title={
                    actualRoomName && actualRoomName !== report.ban
                      ? `${report.ban} 시험시간표 (고사실 ${actualRoomName})`
                      : `${report.ban} 시험시간표`
                  }
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

                <table className="sheet-table sheet-rows-5 sheet-dense w-full table-fixed text-center">
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
                    <tr className="bg-gray-100">
                      <th rowSpan={2} className="py-2 px-1 font-black text-[15px]">번호</th>
                      <th rowSpan={2} className="py-2 px-1 font-black text-[15px]">성명</th>
                      {report.activePeriods.map(p => (
                        <th key={p} colSpan={2} className="py-1.5 px-1 font-black text-[16px]">
                          {p}교시
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      {report.activePeriods.map(p => (
                        <React.Fragment key={p}>
                          <th className="py-1 px-1 font-bold text-[12.5px] text-slate-500">과목명</th>
                          <th className="py-1 px-1 font-bold text-[12.5px] text-slate-500">고사실</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="">
                    {pageStudents.map(st => (
                      <tr key={st.num} style={{ height: ROW_H }}>
                        <td className="font-bold text-slate-600">{st.num}</td>
                        <td className="font-black text-gray-900 whitespace-nowrap">{displayName(st.name)}</td>
                        {report.activePeriods.map(p => {
                          const room = st.periods[p]?.room || '-';
                          const sep = room.includes('(별)');
                          return (
                            <React.Fragment key={p}>
                              <td className="font-bold text-slate-800 px-1"><FitCell base={15.5}>{st.periods[p]?.subject || '-'}</FitCell></td>
                              <td className={`font-black ${sep ? 'text-amber-700' : 'text-red-700'}`}>{room}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                    {/* 모자라는 줄은 빈 줄로 채웁니다. 표 크기가 반마다 달라지지 않게. */}
                    {Array.from({ length: Math.max(0, PER_PAGE - pageStudents.length) }, (_, k) => (
                      <tr key={`blank-${k}`} style={{ height: ROW_H }}>
                        <td className="text-slate-300">{pageIdx * PER_PAGE + pageStudents.length + k + 1}</td>
                        <td />
                        {report.activePeriods.map(p => (
                          <React.Fragment key={p}>
                            <td />
                            <td />
                          </React.Fragment>
                        ))}
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
