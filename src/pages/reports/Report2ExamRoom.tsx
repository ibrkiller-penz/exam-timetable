import React, { useState } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
import { ReportGate } from './ReportGate';
import { usePrintAll } from './usePrintAll';
import { buildExamRoomReport } from '../../domain/reports/examRoom';
import { DayLabel, PeriodLabel } from '../../domain/types';
import { Printer, Download} from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';

export const Report2ExamRoom: React.FC = () => {
  const { attendance, stages, days, rooms } = useAppStore();

  const [selectedDay, setSelectedDay] = useState<DayLabel>('1일차');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodLabel>('1교시');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const { printingAll, printAll } = usePrintAll();

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
          onClick={printAll}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#00426e] hover:bg-[#003356] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
          title="이 교시의 모든 고사실을 한 번에 인쇄합니다."
        >
          <Printer className="w-4 h-4" /> 전체 출력
        </button>
        <button
          onClick={() => window.print()}
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

            return sheets.map((pageStudents, pageIdx) => (
              <div
                key={`${rn}-${pageIdx}`}
                className="print-page page-portrait bg-white border border-gray-300 p-8 print:p-3 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none"
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <h1 className="text-center font-black text-[34px] print:text-[26px] leading-none text-[#005691] tracking-tight">
                    {rep.isWaitRoom ? '대기실 인원현황표' : '고사실 응시현황표'}
                  </h1>
                  {cnt > 1 && (
                    <span className="text-[15px] font-black text-slate-700 bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-0.5">
                      #{pageIdx + 1} / {cnt}
                    </span>
                  )}
                </div>

                <div className="w-full border-2 border-gray-800 grid text-center text-[13.5px] print:text-[12px] mb-3" style={{ gridTemplateColumns: '1.5fr 0.9fr 1fr 1.7fr 1fr' }}>
                  <div className="py-1.5 bg-gray-100 font-black border-r border-gray-800">시행일</div>
                  <div className="py-1.5 bg-gray-100 font-black border-r border-gray-800">교시</div>
                  <div className="py-1.5 bg-gray-100 font-black border-r border-gray-800">고사실</div>
                  <div className="py-1.5 bg-gray-100 font-black border-r border-gray-800">과목(단위)</div>
                  <div className="py-1.5 bg-gray-100 font-black">응시인원</div>

                  <div className="py-1.5 border-t border-r border-gray-800">{dayDate || '-'}</div>
                  <div className="py-1.5 border-t border-r border-gray-800">{rep.period}</div>
                  <div className="py-1.5 border-t border-r border-gray-800 font-black text-[17px] print:text-[15px]">{rep.examRoom}</div>
                  <div className="py-1.5 border-t border-r border-gray-800 font-semibold">{rep.subject}</div>
                  <div className="py-1.5 border-t border-gray-800 font-black text-[17px] print:text-[15px] text-[#005691]">{rep.totalStudents}명</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map(colIdx => (
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
                        {Array.from({ length: PER_COL }).map((_, i) => {
                          const st = pageStudents[colIdx * PER_COL + i];
                          const blankSeq = pageIdx * PER_PAGE + colIdx * PER_COL + i + 1;
                          return (
                            <tr key={i} className="divide-x divide-gray-800 h-8 print:h-7">
                              <td className="text-slate-500">{st ? st.seq : blankSeq}</td>
                              <td className="font-bold text-slate-700 whitespace-nowrap">{st?.hakbun || ''}</td>
                              <td className="font-black text-[16px] print:text-[14px] text-slate-900 whitespace-nowrap">
                                {st?.name ? displayName(st.name) : ''}
                              </td>
                              <td className="font-black text-[17px] print:text-[15px] text-red-700">{st?.seat || ''}</td>
                              <td className="text-[11px] print:text-[10px] font-bold text-slate-700 whitespace-nowrap">{st?.note || ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ))}
                </div>
              </div>
            ));
          })}
        </div>
      )}
    </div>
  );
};
