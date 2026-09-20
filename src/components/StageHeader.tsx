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
  /** 제목 옆 물음표. 이 단계가 무엇을 하는지 설명합니다. */
  help?: React.ReactNode;
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
  help,
}) => {
  const activeGrade = useAppStore(s => s.activeGrade) || '2';

  return (
    <div className="bg-white border-b border-gray-200/90 px-7 py-4.5 shadow-2xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Stage Title & Status
            제목 쪽은 줄어들지 않게 합니다(shrink-0). 오른쪽 버튼이 많은 단계(8. 학생 배치)에서
            제목이 한 글자씩 세로로 접히고, 버튼은 넘칠 때 다음 줄로 내려가는 편이 읽기 낫습니다. */}
        <div className="flex items-center gap-4 shrink-0">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#005691] text-white font-black text-base shadow-sm ring-1 ring-red-500/50 shrink-0">
            {stageNumber}
          </span>
          <div>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-0.5 rounded-lg text-white font-black text-xs whitespace-nowrap ${
                activeGrade === '3' ? 'bg-[#9b1c1c]' : 'bg-[#005691]'
              }`}>
                {activeGrade}학년
              </span>
              <h2 className="text-xl font-black text-[#005691] tracking-tight whitespace-nowrap">{stageTitle}</h2>
              {help}
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
        <div className="flex items-center gap-3 flex-wrap justify-end min-w-0">
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
