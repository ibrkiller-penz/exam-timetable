import React from 'react';
import { Download, FileDown, Printer, Loader2 } from 'lucide-react';
import { usePdfSave } from './usePdfSave';

/**
 * 인쇄물 화면 오른쪽 위의 버튼 묶음.
 *
 * 종이마다 버튼 생김새도 크기도 순서도 달라, 어느 화면에서 무엇을 누르는지
 * 매번 다시 찾아야 했습니다. 순서와 모양을 여기서 한 번만 정합니다.
 *
 *   [엑셀]  [PDF 저장] [PDF 전체]  [인쇄] [전체 인쇄]
 *
 * '전체'는 그 화면에 여러 장이 있을 때만 나옵니다. 한 장짜리 인쇄물에
 * 전체 버튼을 두면 같은 것을 두 번 누르게 됩니다.
 */

const BTN =
  'px-3 py-2 rounded-lg text-[14px] font-bold flex items-center gap-1.5 shadow-sm transition ' +
  'disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed';

export const ReportActions: React.FC<{
  /** 아직 만들 수 없는 상태(단계 미확정 등)이면 모두 잠급니다. */
  disabled?: boolean;

  /** 엑셀 내보내기. 없으면 버튼을 그리지 않습니다. */
  onExcel?: () => void;

  /** 지금 보고 있는 것만 PDF 로. */
  pdfFilename?: string;
  /**
   * 모든 장을 한 파일로. 이 화면이 날짜·고사실 등으로 나뉘어 있을 때만 줍니다.
   * prepare 는 모든 장을 잠깐 화면에 그려 놓고, 끝나면 되돌리는 함수입니다.
   */
  pdfAllFilename?: string;
  prepareAll?: () => () => void;

  /** 지금 보고 있는 것만 인쇄. */
  onPrint?: () => void;
  /** 모든 장 인쇄. */
  onPrintAll?: () => void;
}> = ({ disabled, onExcel, pdfFilename, pdfAllFilename, prepareAll, onPrint, onPrintAll }) => {
  const { saving, progress, savePdf } = usePdfSave();
  const off = disabled || saving;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {onExcel && (
          <button
            onClick={onExcel}
            disabled={off}
            className={`${BTN} bg-emerald-600 hover:bg-emerald-700 text-white`}
            title="엑셀 파일로 내려받습니다."
          >
            <Download className="w-4 h-4" /> 엑셀
          </button>
        )}

        {pdfFilename && (
          <button
            onClick={() => savePdf(pdfFilename)}
            disabled={off}
            className={`${BTN} bg-slate-700 hover:bg-slate-800 text-white`}
            title="지금 보고 있는 것만 PDF 로 저장합니다."
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            PDF 저장
          </button>
        )}

        {pdfAllFilename && (
          <button
            onClick={() => savePdf(pdfAllFilename, prepareAll)}
            disabled={off}
            className={`${BTN} bg-white text-slate-700 border border-slate-400 hover:bg-slate-50`}
            title="모든 장을 PDF 파일 하나로 저장합니다."
          >
            <FileDown className="w-4 h-4" /> 전체 저장
          </button>
        )}

        {onPrint && (
          <button
            onClick={onPrint}
            disabled={off}
            className={`${BTN} bg-[#005691] hover:bg-[#00426e] text-white`}
            title="지금 보고 있는 것만 인쇄합니다."
          >
            <Printer className="w-4 h-4" /> 인쇄
          </button>
        )}

        {onPrintAll && (
          <button
            onClick={onPrintAll}
            disabled={off}
            className={`${BTN} bg-white text-[#005691] border border-[#005691] hover:bg-blue-50`}
            title="모든 장을 한 번에 인쇄합니다."
          >
            <Printer className="w-4 h-4" /> 전체 인쇄
          </button>
        )}
      </div>

      {saving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 no-print">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
            <Loader2 className="w-9 h-9 text-[#005691] animate-spin" />
            <p className="font-black text-slate-800">PDF 만드는 중…</p>
            <p className="text-[14px] font-bold text-slate-500">
              {progress.current} / {progress.total} 장
            </p>
          </div>
        </div>
      )}
    </>
  );
};
