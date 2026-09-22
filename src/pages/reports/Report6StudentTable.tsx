import React, { useState, useMemo } from 'react';
import { displayName } from '../../domain/privacy';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { PrintPageSize } from './PrintPageSize';
import { selPlacementSlots } from '../../store/selectors';
import { buildStudentTableReport } from '../../domain/reports/studentTable';
import { printAsImage } from './printAsImage';
import { ReportActions } from './ReportActions';
import { ReportHeader, HeaderDivider } from './ReportHeader';
import { AlertTriangle, Pencil, X } from 'lucide-react';

/** 수험표 아래에 찍히는 기본 안내. 학교마다 고쳐 쓰므로 설정에 담습니다. */
export const DEFAULT_TICKET_NOTICE =
  '미응시자는 원반 또는 별도로 지정된 대기실에서 자습합니다.\n고사실과 좌석번호를 반드시 확인하고 지정된 자리에 앉으세요.';

export const Report6StudentTable: React.FC = () => {
  const { students,  days, times, rooms, stages, settings, meta, updateSettings } = useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();
  const placementSlots = useAppStore(selPlacementSlots);

  const [selectedBan, setSelectedBan] = useState<string>('');
  const [selectedNum, setSelectedNum] = useState<number>(1);
  const [printScope, setPrintScope] = useState<'student' | 'class' | 'all'>('class');
  const [layoutMode, setLayoutMode] = useState<'grid4' | 'single'>('grid4');

  // 유의사항 입력 창.
  const [noticeOpen, setNoticeOpen] = useState(false);
  /**
   * '전체'를 누른 동안만 모든 학생을 그려 놓습니다.
   * 고른 범위(개별·반별)는 그대로 두고, 뽑고 나면 보던 화면으로 돌아옵니다.
   */
  const [forceAll, setForceAll] = useState(false);

  const uniqueBans = Array.from(new Set(students.map(s => s.ban))).filter(Boolean);
  const curBan = selectedBan || uniqueBans[0] || '01반';
  
  const banStudents = useMemo(() => {
    return students.filter(s => s.ban === curBan).sort((a, b) => a.num - b.num);
  }, [students, curBan]);

  const effScope = forceAll ? 'all' : printScope;

  const studentsToRender = useMemo(() => {
    if (effScope === 'student') {
      const s = banStudents.find(s => s.num === selectedNum) ?? banStudents[0];
      return s ? [s] : [];
    }
    if (effScope === 'class') {
      return banStudents;
    }
    return students.filter(s => s.subjects && s.subjects.length > 0).sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });
  }, [effScope, banStudents, selectedNum, students]);

  const reports = useMemo(() => {
    // 좌석 격자 기본값은 좌석배치도와 같은 것을 씁니다. 그래야 좌석번호가 서류마다 같습니다.
    const seatDefaults = {
      cols: settings.seatColumns,
      rows: settings.seatsPerColumn,
      direction: settings.seatLayoutDirection ?? 'col' as const,
    };
    return studentsToRender.map(s => buildStudentTableReport(s, attendance, days, times, rooms, placementSlots, settings.showSeatOnStudentTable, seatDefaults));
  }, [studentsToRender, attendance, days, times, rooms, placementSlots, settings.showSeatOnStudentTable]);

  const chunkedReports = useMemo(() => {
    const size = layoutMode === 'grid4' ? 4 : 1;
    const result = [];
    for (let i = 0; i < reports.length; i += size) {
      result.push(reports.slice(i, i + size));
    }
    return result;
  }, [reports, layoutMode]);

  /**
   * 전체 인쇄.
   *
   * 예전에는 화면의 HTML 을 통째로 iframe 에 옮겨 담아 인쇄했습니다. 그런데
   * 브라우저가 인쇄용으로 다시 그리면서 표가 잘리거나 한 줄이 다음 장으로
   * 넘어갔습니다. 지금은 화면에 보이는 장을 그대로 그림으로 떠서 A4 에 얹습니다.
   */
  const printAllStudents = () => {
    setForceAll(true);
    // 모든 학생이 화면에 그려진 뒤에 떠야 합니다.
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          await printAsImage({ selector: '.ticket-print-page', landscape: false });
        } finally {
          setForceAll(false);
        }
      });
    });
  };

  /** 파일 이름에 쓸, 지금 무엇을 뽑는지. */
  const scopeName =
    effScope === 'student'
      ? `${curBan} ${banStudents.find(s => s.num === selectedNum)?.num ?? ''}번`
      : effScope === 'class'
        ? curBan
        : '전체';


  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-auto p-4 md:p-6 print:overflow-visible print:h-auto print:p-0 print:m-0 print:bg-white print:block">
      <PrintPageSize />
      {/* PDF 생성 중 진행 모달 */}

      <ReportHeader
        num="10-6"
        title="개별 수험표 출력"
        actions={
          <ReportActions
            disabled={!stages.stage5 || reports.length === 0}
            pdfFilename={`수험표 ${scopeName}.pdf`}
            pdfAllFilename={printScope === 'all' ? undefined : `${meta.title || '고사'} 수험표 전체.pdf`}
            prepareAll={printScope === 'all' ? undefined : () => { setForceAll(true); return () => setForceAll(false); }}
            onPrint={() => printAsImage({ selector: '.ticket-print-page', landscape: false })}
            onPrintAll={printScope === 'all' ? undefined : printAllStudents}
          />
        }
      >
        <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {([['student', '개별 선택'], ['class', '반별 출력'], ['all', '전체 출력']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setPrintScope(id); if (id === 'student') setLayoutMode('single'); }}
              className={`px-3 py-1.5 text-[13.5px] font-bold transition ${
                printScope === id ? 'bg-[#005691] text-white' : 'bg-white text-slate-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </span>

        <select
          value={curBan}
          onChange={e => { setSelectedBan(e.target.value); setSelectedNum(1); }}
          disabled={printScope === 'all'}
          className="report-select"
        >
          {uniqueBans.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        {printScope === 'student' && (
          <select
            value={selectedNum}
            onChange={e => setSelectedNum(Number(e.target.value))}
            className="report-select"
          >
            {banStudents.map(s => (
              <option key={s.num} value={s.num}>
                {s.num}번 {displayName(s.name)}
              </option>
            ))}
          </select>
        )}

        <HeaderDivider />

        <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {([['grid4', 'A4 4분할'], ['single', '1명 크게']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setLayoutMode(id)}
              className={`px-3 py-1.5 text-[13.5px] font-bold transition ${
                layoutMode === id ? 'bg-[#005691] text-white' : 'bg-white text-slate-600 hover:bg-gray-50'
              }`}
              title={id === 'grid4' ? 'A4 한 장에 4명씩' : 'A4 한 장에 1명씩 크게'}
            >
              {label}
            </button>
          ))}
        </span>

        <HeaderDivider />

        {/* 수험표 아래에 찍히는 안내 문구. 머리줄에 작은 칸으로 두었더니
            글씨가 너무 작아 무엇을 쓰는지 보이지 않았습니다. 창을 열어 크게 씁니다. */}
        <button
          onClick={() => setNoticeOpen(true)}
          className="report-select flex items-center gap-1.5"
          title="수험표 아래에 찍히는 유의사항을 고칩니다."
        >
          <Pencil className="w-3.5 h-3.5" /> 하단 유의사항
        </button>
      </ReportHeader>

      {/* 유의사항 입력 창 */}
      {noticeOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6 no-print" onClick={() => setNoticeOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#005691] text-white px-5 py-3 flex items-center justify-between">
              <span className="font-black text-[16px]">수험표 하단 유의사항</span>
              <button onClick={() => setNoticeOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition" aria-label="닫기">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-[14px] text-slate-600 mb-3">
                모든 수험표 아래에 그대로 찍힙니다. 줄을 바꾸면 종이에서도 줄이 바뀝니다.
              </p>
              <textarea
                autoFocus
                value={settings.studentTicketNotice ?? DEFAULT_TICKET_NOTICE}
                onChange={e => updateSettings({ studentTicketNotice: e.target.value })}
                rows={6}
                className="w-full px-4 py-3 text-[16px] leading-relaxed border border-slate-300 rounded-xl focus:outline-none focus:border-[#005691] resize-y"
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
              <button
                onClick={() => updateSettings({ studentTicketNotice: DEFAULT_TICKET_NOTICE })}
                className="px-4 py-2 text-[14px] font-bold text-slate-600 hover:text-slate-900 transition"
              >
                기본 문구로 되돌리기
              </button>
              <button
                onClick={() => setNoticeOpen(false)}
                className="px-5 py-2 bg-[#005691] hover:bg-[#00426e] text-white rounded-lg font-bold text-[14px] transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 인쇄 시 짤림 방지 및 다중 페이지 인쇄 지원 스타일 */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 7mm !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .ticket-print-page {
            width: 100% !important;
            height: 284mm !important;
            max-height: 284mm !important;
            min-height: 284mm !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            box-sizing: border-box !important;
          }
          .ticket-print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .ticket-grid-4 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px 10px !important;
            width: 100% !important;
            height: 100% !important;
            box-sizing: border-box !important;
          }
          .ticket-card-4 {
            height: 100% !important;
            max-height: 136mm !important;
            padding: 8px 10px !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            border-width: 1.5px !important;
          }
          .ticket-single-wrap {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
        }
      `}</style>

      {!stages.stage5 ? (
        <ReportGate what="개별 수험표" />
      ) : reports.length === 0 ? (
        <div className="p-12 text-center text-[#8C867A] border border-slate-200 rounded-xl bg-white">
          선택된 대상이 없거나 선택과목이 없는 학생입니다.
        </div>
      ) : (
        <div id="student-tickets-container" className="flex flex-col gap-10 pb-10 print:block print:p-0 print:m-0 print:gap-0">
          {chunkedReports.map((chunk, chunkIdx) => {
            const isSingle = layoutMode === 'single';
            return (
              <div key={chunkIdx} className="w-[210mm] mx-auto print:w-full">
                {/* 화면상 명확한 페이지 구분 배지 */}
                <div className="no-print flex items-center justify-between px-3 py-1.5 mb-2 bg-white/80 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#005691]"></span>
                    제 {chunkIdx + 1} 페이지 / 총 {chunkedReports.length} 페이지
                  </span>
                  <span className="text-xs font-bold text-[#8C867A]">
                    {chunk[0]?.hakbun} {displayName(chunk[0]?.student.name ?? '')} ~ {chunk[chunk.length - 1]?.hakbun} {displayName(chunk[chunk.length - 1]?.student.name ?? '')} ({chunk.length}명)
                  </span>
                </div>

                <div
                  className={`ticket-print-page print-page page-portrait bg-white border border-slate-300 rounded-xl shadow-sm w-full min-h-[297mm] flex flex-col print:border-none print:shadow-none print:p-0 print:m-0 print:rounded-none ${
                    isSingle
                      ? 'justify-center items-center p-8'
                      : 'justify-between p-5'
                  }`}
                >
                <div className={isSingle ? "ticket-single-wrap w-full flex items-center justify-center my-auto" : "ticket-grid-4 grid grid-cols-2 grid-rows-2 gap-x-4 gap-y-3 flex-1 w-full h-full"}>
                  {chunk.map(report => {
                    const totalRows = report.activeDays.length * report.activePeriods.length;
                    const isDense = !isSingle && totalRows >= 12;

                    return (
                      <div
                        key={report.hakbun}
                        className={`border-2 border-slate-800 rounded-xl flex flex-col justify-between bg-white relative overflow-hidden ${
                          isSingle
                            ? 'w-[155mm] max-w-full p-8 shadow-sm my-auto'
                            : isDense
                            ? 'ticket-card-4 p-3'
                            : 'ticket-card-4 p-4'
                        }`}
                      >
                        <div className={`absolute top-0 left-0 right-0 bg-[var(--c-primary,#005691)] ${isSingle ? 'h-2' : 'h-1.5'}`}></div>
                        
                        <div>
                          <div className={`text-center break-keep leading-tight ${
                            isSingle ? 'mb-4 mt-2' : isDense ? 'mb-1 mt-0.5' : 'mb-1.5 mt-0.5'
                          }`}>
                            <h1 className={`font-black text-[var(--c-primary,#005691)] tracking-tight inline-block ${
                              isSingle
                                ? 'text-[32px] md:text-[36px]'
                                : isDense
                                ? 'text-[19px] md:text-[21px]'
                                : 'text-[22px] md:text-[25px]'
                            }`}>
                              {meta.title}
                            </h1>
                            <span className={`font-black text-slate-800 ml-2 inline-block ${
                              isSingle ? 'text-[22px]' : isDense ? 'text-[13px]' : 'text-[15px]'
                            }`}>
                              수험표
                            </span>
                          </div>

                          <div className={`flex justify-between items-end border-b border-slate-300 ${
                            isSingle
                              ? 'mb-4 pb-3 border-b-2 border-slate-400'
                              : isDense
                              ? 'mb-1 pb-1'
                              : 'mb-1.5 pb-1.5'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`text-[#8C867A] font-bold ${isSingle ? 'text-[13px]' : 'text-[10.5px]'}`}>학번</span>
                              <strong className={`text-red-800 tracking-wide font-black ${
                                isSingle ? 'text-[22px]' : isDense ? 'text-[15px]' : 'text-[16px]'
                              }`}>{report.hakbun}</strong>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[#8C867A] font-bold ${isSingle ? 'text-[13px]' : 'text-[10.5px]'}`}>성명</span>
                              <strong className={`text-slate-900 tracking-widest font-black ${
                                isSingle ? 'text-[24px]' : isDense ? 'text-[16px]' : 'text-[17px]'
                              }`}>{displayName(report.student.name)}</strong>
                            </div>
                          </div>

                          {report.unplacedSubjects.length > 0 && (
                            <div className={`bg-rose-50 rounded border border-rose-200 text-rose-600 font-bold flex items-center justify-center gap-1.5 ${
                              isSingle ? 'mb-3 p-2 text-[12px]' : 'mb-1 p-1 text-[9px]'
                            }`}>
                              <AlertTriangle className={isSingle ? "w-4 h-4" : "w-3 h-3"} /> 오류: {report.unplacedSubjects.join(', ')} 미배치
                            </div>
                          )}

                          <div className="overflow-hidden">
                            <table className="w-full text-center border-collapse border-2 border-slate-800 table-fixed">
                              <thead>
                                <tr className="bg-slate-100 border-b-2 border-slate-800 divide-x-2 divide-slate-800">
                                  <th className={`w-[15%] font-black ${
                                    isSingle ? 'py-2.5 px-2 text-[13px]' : isDense ? 'py-[1px] px-0.5 text-[9px]' : 'py-[1.5px] px-1 text-[9.5px]'
                                  }`}>일자</th>
                                  <th className={`w-[10%] font-black ${
                                    isSingle ? 'py-2.5 px-2 text-[13px]' : isDense ? 'py-[1px] px-0.5 text-[9px]' : 'py-[1.5px] px-1 text-[9.5px]'
                                  }`}>교시</th>
                                  <th className={`w-[32%] font-black ${
                                    isSingle ? 'py-2.5 px-2 text-[13px]' : isDense ? 'py-[1px] px-0.5 text-[9px]' : 'py-[1.5px] px-1 text-[9.5px]'
                                  }`}>과목</th>
                                  <th className={`w-[15%] font-black ${
                                    isSingle ? 'py-2.5 px-2 text-[13px]' : isDense ? 'py-[1px] px-0.5 text-[9px]' : 'py-[1.5px] px-1 text-[9.5px]'
                                  }`}>고사실</th>
                                  <th className={`w-[10%] font-black ${
                                    isSingle ? 'py-2.5 px-2 text-[13px]' : isDense ? 'py-[1px] px-0.5 text-[9px]' : 'py-[1.5px] px-1 text-[9.5px]'
                                  }`}>좌석</th>
                                  <th className={`w-[18%] font-black ${
                                    isSingle ? 'py-2.5 px-2 text-[13px]' : isDense ? 'py-[1px] px-0.5 text-[9px]' : 'py-[1.5px] px-1 text-[9.5px]'
                                  }`}>비고</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-300 border-b-2 border-slate-800">
                                {report.activeDays.map((d, dIdx) => (
                                  <React.Fragment key={d.day}>
                                    {report.activePeriods.map((p, pIdx) => {
                                      const cell = report.grid[p][d.day];
                                      const isWait = cell?.subject === '자습(대기)' || cell?.subject?.startsWith('대기');
                                      return (
                                        <tr key={`${d.day}-${p}`} className="divide-x divide-slate-300">
                                          {pIdx === 0 && (
                                            <td
                                              rowSpan={report.activePeriods.length}
                                              className={`bg-slate-50 border-r-2 border-slate-800 font-black text-slate-800 align-middle ${
                                                isSingle ? 'py-2' : isDense ? 'py-[0.5px]' : 'py-[1px]'
                                              }`}
                                            >
                                              <div className={isSingle ? "text-[14px]" : isDense ? "text-[9.5px] leading-tight" : "text-[10.5px]"}>{d.day}일차</div>
                                              <div className={`text-[#8C867A] ${isSingle ? "text-[10px] mt-0.5" : isDense ? "text-[7.5px]" : "text-[8px]"}`}>{d.dateText}</div>
                                            </td>
                                          )}
                                          <td className={`font-bold bg-slate-50 ${
                                            isSingle ? 'py-2 text-[13px]' : isDense ? 'py-[0.5px] text-[9.5px]' : 'py-[1px] text-[10px]'
                                          }`}>{p}</td>
                                          <td className={`font-black truncate px-0.5 ${
                                            isSingle ? 'py-2 text-[13.5px]' : isDense ? 'py-[0.5px] text-[9.5px]' : 'py-[1px] text-[10.5px]'
                                          } ${isWait ? 'text-amber-700' : 'text-slate-900'}`}>
                                            {cell?.subject || '-'}
                                          </td>
                                          <td className={`font-bold truncate px-0.5 ${
                                            isSingle ? 'py-2 text-[13px]' : isDense ? 'py-[0.5px] text-[9px]' : 'py-[1px] text-[9.5px]'
                                          } ${isWait ? 'text-amber-800' : 'text-red-800'}`}>
                                            {cell?.examRoom || '-'}
                                          </td>
                                          <td className={`font-black text-blue-900 ${
                                            isSingle ? 'py-2 text-[13.5px]' : isDense ? 'py-[0.5px] text-[9.5px]' : 'py-[1px] text-[10.5px]'
                                          }`}>
                                            {cell?.seat || '-'}
                                          </td>
                                          <td className={`font-medium text-[#8C867A] px-0.5 truncate ${
                                            isSingle ? 'py-2 text-[12px]' : isDense ? 'py-[0.5px] text-[8.5px]' : 'py-[1px] text-[9px]'
                                          }`}>
                                            
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className={`flex flex-col text-[#8C867A] font-medium ${
                          isSingle
                            ? 'mt-5 gap-1 text-[11px] leading-[1.3]'
                            : isDense
                            ? 'mt-1 gap-0 text-[7.5px] leading-tight'
                            : 'mt-1.5 gap-0.5 text-[8px] leading-tight'
                        }`}>
                          {(settings.studentTicketNotice ?? DEFAULT_TICKET_NOTICE)
                            .split('\n')
                            .map((line, i) => (
                              <div key={i} className="flex items-start gap-1">
                                <span className="font-bold text-slate-700">※</span>
                                <span>{line}</span>
                              </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
