import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/appStore';

interface StageHeaderProps {
  stageNumber: number;
  stageTitle: string;
  isConfirmed: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  guideMessage?: string;
  isError?: boolean;
  actions?: React.ReactNode;
}

export const StageHeader: React.FC<StageHeaderProps> = ({
  stageNumber,
  stageTitle,
  isConfirmed,
  confirmLabel = '확정',
  cancelLabel = '확정 취소',
  onConfirm,
  onCancel,
  guideMessage,
  isError = false,
  actions,
}) => {
  const activeGrade = useAppStore(s => s.activeGrade) || '2';

  return (
    <div className="bg-white border-b border-gray-200/90 px-7 py-4.5 shadow-2xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Stage Title & Status */}
        <div className="flex items-center gap-4">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#005691] text-white font-black text-base shadow-sm ring-1 ring-red-500/50 shrink-0">
            {stageNumber}
          </span>
          <div>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-0.5 rounded-lg text-white font-black text-xs ${
                activeGrade === '3' ? 'bg-[#9b1c1c]' : 'bg-[#005691]'
              }`}>
                {activeGrade}학년
              </span>
              <h2 className="text-xl font-black text-[#005691] tracking-tight">{stageTitle}</h2>
              <span
                className={`text-[15px] px-3.5 py-1 rounded-full font-black flex items-center gap-1.5 shadow-2xs ${
                  isConfirmed
                    ? 'bg-[#e6f1f8] text-[#005691] border border-gray-200'
                    : 'bg-[#e6f1f8] text-[#0f172a] border border-gray-200'
                }`}
              >
                {isConfirmed ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#00A651]" /> 확정 완료
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> 미확정
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions & Confirm Button */}
        <div className="flex items-center gap-3 flex-wrap">
          {actions}
          {onConfirm && !isConfirmed && (
            <button
              onClick={onConfirm}
              className="px-5 py-2.5 bg-[#005691] hover:bg-[#005691] text-white text-[17px] font-black rounded-xl shadow-md transition transform active:scale-95"
            >
              {confirmLabel}
            </button>
          )}
          {onCancel && isConfirmed && (
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-[#e6f1f8] hover:bg-[#e6f1f8] text-[#0f172a] border border-gray-200 text-[17px] font-black rounded-xl shadow-xs transition transform active:scale-95"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>

      {/* Guide Message Banner */}
      {guideMessage && (
        <div
          className={`mt-4 px-5 py-3 rounded-xl text-[17px] flex items-center gap-2.5 font-bold shadow-2xs ${
            isError
              ? 'bg-[#e6f1f8] text-[#0f172a] border border-gray-200'
              : isConfirmed
              ? 'bg-[#e6f1f8] text-[#005691] border border-gray-200'
              : 'bg-white text-[#0f172a] border border-gray-200'
          }`}
        >
          <span>{guideMessage}</span>
        </div>
      )}
    </div>
  );
};
