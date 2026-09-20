import React from 'react';
import { CheckCircle2, Circle, Lock } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

/**
 * 인쇄물이 비어 있을 때, 왜 비었는지 화면이 직접 말하게 합니다.
 *
 * 11번 인쇄물은 10. 응시현황까지 확정되어야 만들어집니다.
 * 예전에는 "응시현황이 없거나…"라고만 해서, 무엇을 더 해야 하는지
 * 알 수 없었습니다. 어느 단계가 남았는지 짚어 줍니다.
 */
export const ReportGate: React.FC<{
  /** 이 인쇄물이 무엇인지 (예: '고사실 명단'). */
  what: string;
  /** 단계는 모두 끝났는데 고른 조건에 해당하는 자료가 없을 때 보여 줄 말. */
  emptyHint?: string;
  /**
   * 어디까지 끝나야 하는지.
   * 인쇄물은 '10. 응시현황'까지 확정되어야 하지만,
   * 9. 별도 고사실 지정은 '8. 학생 배치'만 끝나면 할 수 있습니다.
   */
  until?: 'placement' | 'attendance';
}> = ({ what, emptyHint, until = 'attendance' }) => {
  const stages = useAppStore(s => s.stages);

  const allSteps = [
    { done: !!stages.step7, label: '7. 고사장 배치 확정', hint: '고사실과 정원을 정하고 확정합니다.' },
    { done: !!stages.stage4, label: '8. 학생 배치 확정', hint: '학생을 앉히고 확정하면 응시현황이 만들어집니다.' },
    { done: !!stages.stage5, label: '10. 응시현황 확정', hint: '좌석번호까지 부여하고 확정하면 인쇄물이 나옵니다.' },
  ];
  const steps = until === 'placement' ? allSteps.slice(0, 2) : allSteps;

  const next = steps.find(s => !s.done);

  return (
    <div className="p-10 border border-slate-200 rounded-2xl bg-white max-w-xl mx-auto text-center">
      <div className="w-12 h-12 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-slate-400" />
      </div>

      <p className="font-black text-[17px] text-slate-800">
        {next ? `아직 ${what}을(를) 만들 수 없습니다.` : `고른 조건에 해당하는 ${what}이(가) 없습니다.`}
      </p>
      <p className="text-[14px] text-slate-500 mt-1.5">
        {next ? `${next.label}까지 마치면 여기에 나옵니다.` : (emptyHint ?? '날짜·교시·고사실을 바꿔 보세요.')}
      </p>

      {next && (
        <ul className="mt-6 text-left inline-flex flex-col gap-2.5">
          {steps.map(s => (
            <li key={s.label} className="flex items-start gap-2.5">
              {s.done
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                : <Circle className={`w-5 h-5 shrink-0 mt-0.5 ${s === next ? 'text-[#005691]' : 'text-slate-300'}`} />}
              <div>
                <div className={`font-bold text-[14.5px] ${s.done ? 'text-slate-400 line-through' : s === next ? 'text-[#005691]' : 'text-slate-500'}`}>
                  {s.label}
                </div>
                {s === next && <div className="text-[13px] text-slate-500 mt-0.5">{s.hint}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
