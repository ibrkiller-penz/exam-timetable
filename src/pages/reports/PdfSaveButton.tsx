import React from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { usePdfSave } from './usePdfSave';

/**
 * PDF 저장 버튼. 늘 '전체'를 한 파일로 저장합니다.
 *
 * 한 장씩 저장하면 파일이 수십 개로 흩어져 학교에서 쓰기 어렵습니다.
 * prepare가 있으면 모든 장을 잠깐 그려 놓고 저장한 뒤 되돌립니다.
 */
export const PdfSaveButton: React.FC<{
  filename: string;
  disabled?: boolean;
  prepare?: () => () => void;
}> = ({ filename, disabled, prepare }) => {
  const { saving, progress, savePdf } = usePdfSave();

  return (
    <>
      <button
        onClick={() => savePdf(filename, prepare)}
        disabled={disabled || saving}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
        title="모든 장을 PDF 파일 하나로 저장합니다."
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        PDF 저장
      </button>

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
