import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots, selSubjectBanEntries } from '../../store/selectors';
import { buildLabels } from '../../domain/reports/labels';
import { exportLabelsToExcel } from '../../utils/excelExport';
import { onlySubject } from '../../domain/util/text';
import { Printer, Download, CheckCircle2, FileDown, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * 봉투 라벨의 과목명 글자 크기.
 *
 * 봉투는 멀리서 집어 들기 때문에 과목명이 클수록 좋습니다.
 * 다만 '심화 영어 독해Ⅰ'처럼 긴 이름은 그대로 키우면 칸을 넘칩니다.
 * 한글은 영문·숫자보다 두 배쯤 넓으므로, 글자 수가 아니라 차지하는 폭으로 셉니다.
 */
const subjectFontSize = (name: string): number => {
  const width = [...(name ?? '')].reduce(
    (w, ch) => w + (/[\x00-\x7F]/.test(ch) ? 0.55 : 1),
    0
  );
  if (width <= 3) return 66;
  if (width <= 4) return 58;
  if (width <= 5) return 50;
  if (width <= 6) return 44;
  if (width <= 7) return 39;
  if (width <= 9) return 33;
  if (width <= 11) return 28;
  if (width <= 14) return 23;
  return 19;
};

export const Report7Labels: React.FC = () => {
  const { rooms, days, times, placement, evalSubjects, subjectCodes, setSubjectCode, stages, meta, settings, slotBanLabels, slotBanLabelStyle } = useAppStore();
  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  // 로컬 과목코드 상태 (입력 버벅임 방지 및 즉각적인 반응성)
  const [localCodes, setLocalCodes] = useState<Record<string, string>>({});
  const [saveToast, setSaveToast] = useState(false);

  // PDF 생성 진행 상태
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });

  // 화면에서 정한 분반 표기를 인쇄물에도 그대로 씁니다.
  const banCfg = { defaultStyle: settings.banLabelStyle, slotStyle: slotBanLabelStyle, manual: slotBanLabels };

  const labels = useMemo(() => {
    return buildLabels(placementSlots, placement, rooms, days, times, entries, banCfg);
  }, [placementSlots, placement, rooms, days, times, entries, settings.banLabelStyle, slotBanLabelStyle, slotBanLabels]);

  // A4 가로 1장에 4개(2x2)씩 분할
  const chunkedLabels = useMemo(() => {
    const res = [];
    for (let i = 0; i < labels.length; i += 4) {
      res.push(labels.slice(i, i + 4));
    }
    return res;
  }, [labels]);

  // 과목코드 가져오기 헬퍼 (시수 유무 관계없이 매칭)
  const getSubjectCode = (subj: string): string => {
    const clean = onlySubject(subj);
    return localCodes[subj] || localCodes[clean] || subjectCodes[subj] || subjectCodes[clean] || '';
  };

  // 과목코드 입력 핸들러
  const handleCodeChange = (subj: string, val: string) => {
    const clean = onlySubject(subj);
    setLocalCodes(prev => ({ ...prev, [subj]: val, [clean]: val }));
    setSubjectCode(subj, val);
    if (clean !== subj) {
      setSubjectCode(clean, val);
    }
  };

  // 과목코드 일괄 저장 버튼
  const handleSaveAllCodes = () => {
    evalSubjects.forEach(s => {
      const val = getSubjectCode(s.subject);
      const clean = onlySubject(s.subject);
      setSubjectCode(s.subject, val);
      if (clean !== s.subject) {
        setSubjectCode(clean, val);
      }
    });
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  // 격리된 iframe을 통해 전 페이지 완벽 인쇄 (브라우저 SPA 스크롤 제약 우회)
  const handlePrintAllPages = () => {
    const printContent = document.getElementById('envelope-labels-container');
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
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>문제지 봉투 라벨 인쇄</title>
          <link rel="stylesheet" href="/assets/index.css">
          <style>
            @page {
              size: A4 landscape;
              margin: 7mm 8mm !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box;
            }
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              overflow: visible !important;
              height: auto !important;
              font-family: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
            }
            .envelope-print-page {
              width: 100% !important;
              height: 195mm !important;
              max-height: 195mm !important;
              min-height: 195mm !important;
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
            .envelope-print-page:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            .envelope-grid-4 {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
              gap: 8px 10px !important;
              width: 100% !important;
              height: 100% !important;
              box-sizing: border-box !important;
            }
            .envelope-card {
              height: 100% !important;
              max-height: 93mm !important;
              padding: 8px 12px !important;
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              border: 2px solid #0f172a !important;
              border-radius: 8px !important;
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
    const pages = document.querySelectorAll<HTMLElement>('.envelope-print-page');
    if (!pages || pages.length === 0) {
      alert('인쇄할 봉투 라벨 데이터가 없습니다.');
      return;
    }

    setIsGeneratingPdf(true);
    setPdfProgress({ current: 1, total: pages.length });

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
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
          pdf.addPage('a4', 'landscape');
        }
        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
      }

      const filename = `문제지_봉투라벨_${meta.title || '시험시간표'}.pdf`;
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
      {/* 가로 2x2 인쇄 스타일 */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 7mm 8mm !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .envelope-print-page {
            width: 100% !important;
            height: 195mm !important;
            max-height: 195mm !important;
            min-height: 195mm !important;
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
          .envelope-print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .envelope-grid-4 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px 10px !important;
            width: 100% !important;
            height: 100% !important;
            box-sizing: border-box !important;
          }
          .envelope-card {
            height: 100% !important;
            max-height: 93mm !important;
            padding: 8px 12px !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            border: 2px solid #0f172a !important;
            border-radius: 8px !important;
          }
        }
      `}</style>

      {/* PDF 생성 중 진행 모달 */}
      {isGeneratingPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full mx-4 border border-slate-100">
            <Loader2 className="w-10 h-10 text-[var(--c-primary,#005691)] animate-spin" />
            <div className="text-center">
              <h3 className="text-base font-black text-slate-900 mb-1">라벨 PDF 파일 생성 중...</h3>
              <p className="text-sm font-bold text-slate-600">
                페이지 처리 중: <span className="text-[var(--c-primary,#005691)] font-black">{pdfProgress.current}</span> / {pdfProgress.total} 페이지
              </p>
              <div className="w-48 h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full bg-[var(--c-primary,#005691)] transition-all duration-200"
                  style={{ width: `${(pdfProgress.current / (pdfProgress.total || 1)) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-[#8C867A]">잠시만 기다려주세요. 완료 시 자동 저장됩니다.</span>
          </div>
        </div>
      )}

      {/* 헤더 컨트롤 바 */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 no-print bg-white p-4 rounded-xl shadow-xs border border-slate-200">
        <h2 className="text-xl font-black text-[#005691] flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm">7</span>
          문제지 봉투 라벨 (A4 가로 2×2 출력)
        </h2>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => exportLabelsToExcel(labels)}
            disabled={labels.length === 0}
            className="px-3.5 py-2 bg-[#e5f6ec] hover:bg-emerald-100 text-emerald-800 border border-[#00A651]/30 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> 엑셀 내보내기
          </button>
          <button
            onClick={handleExportPdf}
            disabled={!stages.stage5 || labels.length === 0 || isGeneratingPdf}
            className="px-4 py-2 bg-[#007a3c] hover:bg-[#005f2f] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
            title="인쇄 대화상자 없이 바로 PDF 파일로 저장합니다"
          >
            <FileDown className="w-4 h-4" /> PDF 바로 저장 ({labels.length}개)
          </button>
          <button
            onClick={handlePrintAllPages}
            disabled={!stages.stage5 || labels.length === 0}
            className="px-4 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" /> 라벨 인쇄 (2×2 가로 4칸)
          </button>
        </div>
      </div>

      {!stages.stage5 ? (
        <div className="p-12 text-center text-[#8C867A] border border-slate-200 rounded-xl bg-white flex flex-col items-center justify-center">
          <p className="font-bold">8단계 응시현황이 확정되면 문제지 봉투 라벨이 생성됩니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 과목코드 입력 영역 */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs no-print">
            <div className="flex items-center justify-between gap-3 mb-3 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-800">과목코드 입력 (선택사항)</h3>
                <span className="text-xs text-[#8C867A]">입력 즉시 라벨에 반영됩니다.</span>
              </div>
              <button
                onClick={handleSaveAllCodes}
                className="px-3 py-1.5 bg-[#005691] hover:bg-[#004270] text-white text-xs font-black rounded-lg flex items-center gap-1.5 shadow-sm transition"
              >
                {saveToast ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> : '💾'} {saveToast ? '저장 완료!' : '과목코드 저장'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {evalSubjects.map(s => {
                const curVal = getSubjectCode(s.subject);
                return (
                  <div key={s.subject} className="flex flex-col gap-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-700 truncate" title={s.subject}>
                      {s.subject}
                    </span>
                    <input
                      type="text"
                      placeholder="코드 입력"
                      value={curVal}
                      onChange={e => handleCodeChange(s.subject, e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-indigo-500 font-mono font-bold uppercase"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 라벨 미리보기 및 인쇄 영역 (A4 가로 297mm x 210mm, 2x2 그리드) */}
          <div id="envelope-labels-container" className="flex flex-col gap-8 pb-10 print:block print:p-0 print:m-0 print:gap-0">
            {chunkedLabels.map((chunk, chunkIdx) => (
              <div key={chunkIdx} className="w-[297mm] mx-auto print:w-full">
                {/* 화면상 명확한 페이지 구분 배지 */}
                <div className="no-print flex items-center justify-between px-3 py-1.5 mb-2 bg-white/80 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#005691]"></span>
                    제 {chunkIdx + 1} 페이지 / 총 {chunkedLabels.length} 페이지
                  </span>
                  <span className="text-xs font-bold text-[#8C867A]">
                    연번 #{chunk[0]?.seq} ~ #{chunk[chunk.length - 1]?.seq} ({chunk.length}개 라벨)
                  </span>
                </div>

                <div
                  className="envelope-print-page print-page page-landscape bg-white border border-slate-300 rounded-xl shadow-sm w-full min-h-[210mm] p-5 flex flex-col justify-between mb-8 print:mb-0 print:border-none print:shadow-none print:p-0 print:m-0 print:w-full"
                >
                  <div className="envelope-grid-4 grid grid-cols-2 grid-rows-2 gap-4 flex-1 w-full h-full">
                  {chunk.map(l => {
                    const code = getSubjectCode(l.subject);
                    const cleanSubj = onlySubject(l.subject);

                    return (
                      <div
                        key={l.seq}
                        className="envelope-card border-2 border-slate-900 rounded-xl p-3.5 flex flex-col justify-between bg-white relative shadow-2xs"
                      >
                        {/* 상단 고사명 타이틀 */}
                        {meta?.title && (
                          <div className="text-center font-black text-slate-800 text-[17px] md:text-[19px] border-b-2 border-slate-900 pb-1 mb-1 tracking-tight truncate">
                            {meta.title}
                          </div>
                        )}

                        {/* 상단 헤더: 일시 & 연번 */}
                        <div className="flex justify-between items-center border-b border-slate-300 pb-1 mb-1">
                          <span className="text-xs font-black text-slate-700">
                            일시: {l.date} ({l.day} {l.period}) {l.time}
                          </span>
                          <span className="text-xs font-black bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300">
                            연번 #{l.seq}
                          </span>
                        </div>

                        {/* 중앙 메인: 과목명을 칸에 가득 채웁니다.
                            멀리서도 읽혀야 봉투를 빨리 고를 수 있습니다. */}
                        <div className="flex-1 my-1 py-2 px-2 text-center border-y-2 border-slate-900 bg-slate-50/50 rounded flex flex-col items-center justify-center gap-1 overflow-hidden">
                          <span
                            className="font-black text-slate-900 tracking-tight leading-none break-keep"
                            style={{ fontSize: `${subjectFontSize(cleanSubj)}px` }}
                          >
                            {cleanSubj}
                          </span>
                          {code && (
                            <span className="text-base font-black px-2 py-0.5 bg-blue-50 text-[#005691] border border-blue-200 rounded font-mono">
                              【 {code} 】
                            </span>
                          )}
                        </div>

                        {/* 하단 정보 3칸: 고사실 / 응시분반 / 응시인원 */}
                        <div className="grid grid-cols-3 gap-2 text-center mt-1">
                          <div className="bg-slate-50 py-1 px-2 rounded border border-slate-200">
                            <span className="text-[10.5px] font-bold text-[#8C867A] block">고사실</span>
                            <strong className="text-base font-black text-blue-900 block truncate">{l.examRoom}</strong>
                          </div>
                          <div className="bg-slate-50 py-1 px-2 rounded border border-slate-200">
                            <span className="text-[10.5px] font-bold text-[#8C867A] block">응시분반</span>
                            <strong className="text-sm font-bold text-slate-800 block truncate">{l.classRoom || '전체'}</strong>
                          </div>
                          <div className="bg-[#e6f1f8] py-1 px-2 rounded border border-[#b3d4e8]">
                            <span className="text-[10.5px] font-black text-[#005691] block">응시인원</span>
                            <strong className="text-base font-black text-[#005691] block truncate">{l.stuCount}명</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
