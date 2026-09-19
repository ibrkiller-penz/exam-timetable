import React, { useState, useMemo } from 'react';
import { displayName } from '../../domain/privacy';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { PrintPageSize } from './PrintPageSize';
import { selPlacementSlots } from '../../store/selectors';
import { buildStudentTableReport } from '../../domain/reports/studentTable';
import { Printer, AlertTriangle, LayoutGrid, Square, Users, User, Building, FileDown, Loader2 } from 'lucide-react';

export const Report6StudentTable: React.FC = () => {
  const { students,  days, times, rooms, stages, settings, meta, updateSettings } = useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();
  const placementSlots = useAppStore(selPlacementSlots);

  const [selectedBan, setSelectedBan] = useState<string>('');
  const [selectedNum, setSelectedNum] = useState<number>(1);
  const [printScope, setPrintScope] = useState<'student' | 'class' | 'all'>('class');
  const [layoutMode, setLayoutMode] = useState<'grid4' | 'single'>('grid4');

  // PDF 생성 진행 상태
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });

  const uniqueBans = Array.from(new Set(students.map(s => s.ban))).filter(Boolean);
  const curBan = selectedBan || uniqueBans[0] || '01반';
  
  const banStudents = useMemo(() => {
    return students.filter(s => s.ban === curBan).sort((a, b) => a.num - b.num);
  }, [students, curBan]);

  const studentsToRender = useMemo(() => {
    if (printScope === 'student') {
      const s = banStudents.find(s => s.num === selectedNum) ?? banStudents[0];
      return s ? [s] : [];
    }
    if (printScope === 'class') {
      return banStudents;
    }
    return students.filter(s => s.subjects && s.subjects.length > 0).sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });
  }, [printScope, banStudents, selectedNum, students]);

  const reports = useMemo(() => {
    return studentsToRender.map(s => buildStudentTableReport(s, attendance, days, times, rooms, placementSlots, settings.showSeatOnStudentTable));
  }, [studentsToRender, attendance, days, times, rooms, placementSlots, settings.showSeatOnStudentTable]);

  const chunkedReports = useMemo(() => {
    const size = layoutMode === 'grid4' ? 4 : 1;
    const result = [];
    for (let i = 0; i < reports.length; i += size) {
      result.push(reports.slice(i, i + size));
    }
    return result;
  }, [reports, layoutMode]);

  // 숨김 iframe을 통한 완벽한 다중 페이지 인쇄
  const handlePrintAllPages = () => {
    const printContent = document.getElementById('student-tickets-container');
    if (!printContent) {
      window.print();
      return;
    }

    let iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML)
      .join('\n');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${meta.title || '수험표'} - 인쇄</title>
          ${styles}
          <style>
            @page {
              size: A4 portrait;
              margin: 6mm 7mm !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              overflow: visible !important;
              height: auto !important;
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
            .no-print { display: none !important; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 400);
  };

  // PDF 파일로 즉시 다운로드/저장
  const handleExportPdf = async () => {
    const pages = document.querySelectorAll<HTMLElement>('.ticket-print-page');
    if (!pages || pages.length === 0) {
      alert('인쇄할 수험표 데이터가 없습니다.');
      return;
    }

    setIsGeneratingPdf(true);
    setPdfProgress({ current: 1, total: pages.length });

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      for (let i = 0; i < pages.length; i++) {
        setPdfProgress({ current: i + 1, total: pages.length });
        const pageEl = pages[i];
        
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }
        // 비율을 지킨 채 A4 안에 넣고 가운데 놓습니다. 늘리면 글자가 눌립니다.
        const ratio = canvas.width / canvas.height;
        let w = 210, h = 210 / ratio;
        if (h > 297) { h = 297; w = 297 * ratio; }
        pdf.addImage(imgData, 'JPEG', (210 - w) / 2, (297 - h) / 2, w, h, undefined, 'FAST');
      }

      const scopeName = printScope === 'student' ? `${banStudents.find(s => s.num === selectedNum)?.name ?? '학생'}` : printScope === 'class' ? `${curBan}` : '전체';
      const filename = `수험표_${scopeName}_${meta.title || '시험시간표'}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('PDF 생성 실패:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-auto p-4 md:p-6 print:overflow-visible print:h-auto print:p-0 print:m-0 print:bg-white print:block">
      <PrintPageSize />
      {/* PDF 생성 중 진행 모달 */}
      {isGeneratingPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full mx-4 border border-slate-100">
            <Loader2 className="w-10 h-10 text-[var(--c-primary,#005691)] animate-spin" />
            <div className="text-center">
              <h3 className="text-base font-black text-slate-900 mb-1">PDF 파일 생성 중...</h3>
              <p className="text-sm font-bold text-slate-600">
                페이지 처리 중: <span className="text-[var(--c-primary,#005691)] font-black">{pdfProgress.current}</span> / {pdfProgress.total} 페이지
              </p>
              <div className="w-48 h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full bg-[var(--c-primary,#005691)] transition-all duration-200"
                  style={{ width: `${(pdfProgress.current / pdfProgress.total) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-[#8C867A]">잠시만 기다려주세요. 완료 시 자동 저장됩니다.</span>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 mb-6 no-print bg-white p-4 rounded-xl shadow-xs border border-slate-200">
        <div className="flex flex-col gap-3 w-full">
          <h2 className="text-xl font-black text-[#005691] flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm">6</span>
            학생별 시험시간표 (수험표 출력)
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => {
                  setPrintScope('student');
                  setLayoutMode('single');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition ${printScope === 'student' ? 'bg-white text-[var(--c-primary,#005691)] shadow-sm' : 'text-[#8C867A] hover:text-slate-700'}`}
              >
                <User className="w-3.5 h-3.5" /> 개별 선택
              </button>
              <button
                onClick={() => setPrintScope('class')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition ${printScope === 'class' ? 'bg-white text-[var(--c-primary,#005691)] shadow-sm' : 'text-[#8C867A] hover:text-slate-700'}`}
              >
                <Building className="w-3.5 h-3.5" /> 반별 출력
              </button>
              <button
                onClick={() => setPrintScope('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition ${printScope === 'all' ? 'bg-white text-[var(--c-primary,#005691)] shadow-sm' : 'text-[#8C867A] hover:text-slate-700'}`}
              >
                <Users className="w-3.5 h-3.5" /> 전체 출력
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={curBan}
                onChange={e => {
                  setSelectedBan(e.target.value);
                  setSelectedNum(1);
                }}
                disabled={printScope === 'all'}
                className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {uniqueBans.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              
              {printScope === 'student' && (
                <select
                  value={selectedNum}
                  onChange={e => setSelectedNum(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                >
                  {banStudents.map(s => (
                    <option key={s.num} value={s.num}>
                      {s.num}번 {displayName(s.name)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            <div className="h-6 w-px bg-slate-200 mx-1"></div>
            
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setLayoutMode('grid4')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition ${layoutMode === 'grid4' ? 'bg-white text-[var(--c-primary,#005691)] shadow-sm' : 'text-[#8C867A] hover:text-slate-700'}`}
                title="A4 1장에 4명씩 출력 (수험표 형태)"
              >
                <LayoutGrid className="w-3.5 h-3.5" /> A4 4분할
              </button>
              <button
                onClick={() => setLayoutMode('single')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition ${layoutMode === 'single' ? 'bg-white text-[var(--c-primary,#005691)] shadow-sm' : 'text-[#8C867A] hover:text-slate-700'}`}
                title="A4 1장에 1명씩 크게 출력"
              >
                <Square className="w-3.5 h-3.5" /> 1명 크게
              </button>
            </div>
            
            <div className="h-6 w-px bg-slate-200 mx-1"></div>
            
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 flex-1 min-w-[250px]">
              <span className="text-xs font-bold text-[#8C867A] px-2 whitespace-nowrap">하단 유의사항</span>
              <textarea
                placeholder="여러 줄 입력 가능"
                value={settings.studentTicketNotice ?? '미응시자는 원반 또는 별도로 지정된 대기실에서 자습합니다.\n고사실과 좌석번호를 반드시 확인하고 지정된 자리에 앉으세요.'}
                onChange={e => updateSettings({ studentTicketNotice: e.target.value })}
                rows={2}
                className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* 인쇄 및 PDF 저장 버튼 영역 */}
        <div className="flex items-center gap-2.5 w-full xl:w-auto shrink-0">
          <button
            onClick={handleExportPdf}
            disabled={!stages.stage5 || reports.length === 0 || isGeneratingPdf}
            className="px-4 py-2.5 flex-1 xl:flex-none bg-[#007a3c] hover:bg-[#005f2f] text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-md transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
            title="인쇄 대화상자 없이 바로 PDF 파일로 저장합니다"
          >
            <FileDown className="w-4 h-4" /> PDF 바로 저장 ({reports.length}명)
          </button>
          <button
            onClick={handlePrintAllPages}
            disabled={!stages.stage5 || reports.length === 0 || isGeneratingPdf}
            className="px-4 py-2.5 flex-1 xl:flex-none bg-[#005691] hover:bg-[#004270] text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-md transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" /> 인쇄 ({reports.length}명)
          </button>
        </div>
      </div>

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
                          {(settings.studentTicketNotice ?? '미응시자는 원반 또는 별도로 지정된 대기실에서 자습합니다.\n고사실과 좌석번호를 반드시 확인하고 지정된 자리에 앉으세요.')
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
