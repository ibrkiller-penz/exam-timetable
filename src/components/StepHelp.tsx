import React from 'react';
import { HelpCircle, X } from 'lucide-react';

/**
 * 단계마다 붙는 물음표 도움말.
 *
 * 화면만 보고는 이 단계가 무엇을 하는지, 자동 배치가 무슨 기준으로 도는지
 * 알 수 없습니다. 담당자가 바뀌어도 프로그램만 보고 이어받을 수 있도록,
 * 각 단계의 하는 일과 규칙을 여기에 적어 둡니다.
 */
export const StepHelp: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1 text-slate-400 hover:text-[#005691] hover:bg-blue-50 rounded-lg transition shrink-0"
        title="이 단계가 무엇을 하는지 봅니다"
        aria-label={`${title} 설명`}
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6 no-print"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-[#005691] text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-black text-[17px]">
                <HelpCircle className="w-5 h-5" />
                {title}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-auto text-[14.5px] text-slate-700 leading-relaxed space-y-5 [&_strong]:text-slate-900 [&_h3]:font-black [&_h3]:text-[#005691] [&_h3]:text-[16px] [&_ul]:space-y-1.5 [&_li]:ml-4 [&_li]:list-disc">
              {children}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
              <button
                onClick={() => setOpen(false)}
                className="px-5 py-2 bg-[#005691] hover:bg-[#00426e] text-white rounded-lg font-bold text-[14px] transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
