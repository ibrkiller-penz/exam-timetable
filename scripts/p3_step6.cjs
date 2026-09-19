const fs = require('fs');
const content = `import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { SlotKey, slotKey, DayIdx, PeriodIdx } from '../domain/types';
import { DAYS, PERIODS } from '../domain/constants';
import { MSG } from '../domain/messages';
import { selTakersBySubject, selDuplicateSubjects, selRemainSubjects, selCanSubjects, selDayLoad } from '../store/selectors';
import { slotStatus, studentsWithLoad } from '../domain/timetable';
import { ArrowLeftRight, X, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export const Step6Timetable: React.FC = () => {
  const {
    timetable,
    days,
    times,
    evalSubjects,
    students,
    stages,
    ui,
    setSelectedTimetableSlot,
    setTimetableSlot,
    swapTimetableSubjects,
    confirmStage3,
    cancelStage3,
  } = useAppStore();

  const selectedSlot = ui.selectedTimetableSlot;
  const takers = useAppStore(selTakersBySubject);
  const duplicates = useAppStore(selDuplicateSubjects);
  const remain = useAppStore(selRemainSubjects);
  const canSubjects = useAppStore(state => selCanSubjects(state, selectedSlot));

  const [swapSelected, setSwapSelected] = useState<string[]>([]);
  const [loadModal, setLoadModal] = useState<{ day: DayIdx; count: number; title: string; list: string[] } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);

  const handleAddSubjectToSlot = (slot: SlotKey, subject: string) => {
    if (stages.stage3) return;
    const current = timetable[slot]?.subjects ?? [];
    if (current.includes(subject)) return;
    setTimetableSlot(slot, [...current, subject]);
  };

  const handleRemoveSubjectFromSlot = (slot: SlotKey, subject: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (stages.stage3) return;
    const current = timetable[slot]?.subjects ?? [];
    setTimetableSlot(slot, current.filter(s => s !== subject));
  };

  const handleChipClick = (subject: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      if (swapSelected.includes(subject)) {
        setSwapSelected(swapSelected.filter(s => s !== subject));
      } else {
        if (swapSelected.length >= 2) {
          setSwapSelected([swapSelected[1], subject]);
        } else {
          setSwapSelected([...swapSelected, subject]);
        }
      }
    }
  };

  const handleSwap = () => {
    if (swapSelected.length !== 2) {
      setAlertModal({ isOpen: true, message: MSG.S6_SWAP_SELECT, isError: true });
      return;
    }
    swapTimetableSubjects(swapSelected[0], swapSelected[1]);
    setSwapSelected([]);
  };

  const handleLoadClick = (day: DayIdx, countIdx: number, val: number) => {
    if (val === 0) return;
    const list = studentsWithLoad(day, countIdx, timetable, students);
    setLoadModal({
      day,
      count: val,
      title: MSG.S6_MODAL_TITLE(day, countIdx, val),
      list,
    });
  };

  const handleConfirm = () => {
    try {
      confirmStage3();
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message, isError: true });
    }
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: stages.stage4 ? MSG.S6_CANCEL_BAECHI : MSG.S1_CANCEL_CONFIRM,
      onConfirm: () => {
        cancelStage3();
        setConfirmModal(null);
      },
    });
  };

  const guideMsg = stages.stage3
    ? MSG.S6_DONE
    : duplicates.length > 0
    ? MSG.S6_DUP
    : remain.length === 0
    ? MSG.S6_ALL
    : MSG.S6_REMAIN(remain.join(', '));

  return (
    <div className="flex flex-col h-full bg-white overflow-auto">
      <StageHeader
        stageNumber={6}
        stageTitle="고사시간표 작성 (5×5 격자)"
        isConfirmed={stages.stage3}
        confirmLabel="시간표 확정"
        cancelLabel="시간표 확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        guideMessage={guideMsg}
        isError={duplicates.length > 0}
        actions={
          <div className="flex items-center gap-2">
            {swapSelected.length > 0 && (
              <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 font-semibold">
                선택 과목 ({swapSelected.length}/2): {swapSelected.join(', ')}
              </span>
            )}
            <button
              onClick={handleSwap}
              disabled={stages.stage3 || swapSelected.length !== 2}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1 disabled:opacity-40 transition"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" /> 맞교환
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6 max-w-[1600px] w-full">
        <div className="border border-gray-300 rounded-xl overflow-hidden shadow-sm bg-white">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-800 border-b border-gray-300 divide-x divide-gray-300">
                <th className="py-3 px-3 w-20 text-center font-bold">교시</th>
                {DAYS.map(d => {
                  const dayDate = days[d - 1]?.date;
                  const dateStr = dayDate ? dayjs(dayDate).locale('ko').format('YYYY.M.D.(dd)') : 'X';
                  return (
                    <th key={d} className="py-3 px-3 text-center font-bold">
                      {d}일차 - {dateStr}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {PERIODS.map(p => {
                const hasTime = times.some(t => t.period === p && t.time && t.time.trim() !== '');
                return (
                  <tr key={p} className="divide-x divide-gray-300">
                    <td className="py-3 px-2 text-center bg-gray-50 font-bold text-gray-800">
                      {hasTime ? \`\${p}교시\` : 'X'}
                    </td>
                    {DAYS.map(d => {
                      const k = slotKey(d, p);
                      const slot = timetable[k] ?? { subjects: [] };
                      const isSelected = selectedSlot === k;
                      const status = slotStatus(d, p, timetable, days, times, takers);

                      return (
                        <td
                          key={d}
                          onClick={() => setSelectedTimetableSlot(k)}
                          className={\`py-2 px-2.5 align-top min-w-[200px] cursor-pointer transition relative \${
                            isSelected ? 'bg-blue-50/60 ring-2 ring-blue-500 ring-inset z-10' : 'hover:bg-gray-50/50'
                          } \${stages.stage3 ? 'bg-gray-50/70 cursor-default' : ''}\`}
                        >
                          <div className="flex flex-wrap gap-1 mb-2">
                            {slot.subjects.map(s => {
                              const isSwap = swapSelected.includes(s);
                              const banCnt = evalSubjects.find(e => e.subject === s)?.banCount ?? 0;
                              return (
                                <span
                                  key={s}
                                  onClick={e => handleChipClick(s, e)}
                                  className={\`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold shadow-xs border transition \${
                                    isSwap
                                      ? 'bg-amber-100 text-amber-900 border-amber-400 ring-2 ring-amber-400'
                                      : 'bg-blue-100 text-blue-900 border-blue-200 hover:bg-blue-200'
                                  }\`}
                                >
                                  <span>{s}</span>
                                  <span className="text-[10px] text-blue-600 bg-white/80 px-1 rounded font-bold">
                                    {banCnt}반
                                  </span>
                                  {!stages.stage3 && (
                                    <button
                                      onClick={e => handleRemoveSubjectFromSlot(k, s, e)}
                                      className="text-gray-400 hover:text-red-600 p-0.5"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </span>
                              );
                            })}

                            {!stages.stage3 && slot.subjects.length < 4 && (
                              <div className="relative group inline-block">
                                <button className="px-2 py-0.5 border border-dashed border-gray-300 hover:border-blue-500 text-gray-500 hover:text-blue-600 rounded text-xs flex items-center gap-1 bg-white">
                                  <Plus className="w-3 h-3" /> 과목 추가
                                </button>
                                <div className="hidden group-hover:block absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-30 p-2 w-48 max-h-48 overflow-auto">
                                  {evalSubjects.map(s => (
                                    <button
                                      key={s.subject}
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleAddSubjectToSlot(k, s.subject);
                                      }}
                                      disabled={slot.subjects.includes(s.subject)}
                                      className="w-full text-left px-2 py-1.5 hover:bg-blue-50 rounded text-xs text-gray-800 disabled:text-gray-300"
                                    >
                                      {s.subject} ({s.banCount}반)
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-1 pt-1 border-t border-gray-100 flex items-center justify-between text-[11px]">
                            {status.kind === 'ok' ? (
                              <span className="text-gray-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 정상
                              </span>
                            ) : status.kind === 'error' ? (
                              <span className="text-rose-600 font-bold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {status.message}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-medium">
              <tr className="divide-x divide-gray-300">
                <td className="py-2.5 px-2 text-center font-bold text-gray-800">응시자수</td>
                {DAYS.map(d => {
                  const load = useAppStore(state => selDayLoad(state, d));
                  return (
                    <td key={d} className="p-2 text-[11px]">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        <span
                          onClick={() => handleLoadClick(d, 0, load.counts[0])}
                          className="cursor-pointer hover:underline text-gray-600"
                        >
                          미응시: <strong>{load.counts[0]}</strong>
                        </span>
                        <span
                          onClick={() => handleLoadClick(d, 3, load.counts[3])}
                          className="cursor-pointer hover:underline text-gray-600"
                        >
                          3과목: <strong>{load.counts[3]}</strong>
                        </span>
                        <span
                          onClick={() => handleLoadClick(d, 1, load.counts[1])}
                          className="cursor-pointer hover:underline text-gray-600"
                        >
                          1과목: <strong>{load.counts[1]}</strong>
                        </span>
                        <span
                          onClick={() => handleLoadClick(d, 4, load.counts[4])}
                          className="cursor-pointer hover:underline text-gray-600"
                        >
                          4과목: <strong>{load.counts[4]}</strong>
                        </span>
                        <span
                          onClick={() => handleLoadClick(d, 2, load.counts[2])}
                          className="cursor-pointer hover:underline text-gray-600"
                        >
                          2과목: <strong>{load.counts[2]}</strong>
                        </span>
                        <span
                          onClick={() => handleLoadClick(d, 5, load.counts[5])}
                          className="cursor-pointer hover:underline text-gray-600"
                        >
                          5과목: <strong>{load.counts[5]}</strong>
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4">
            <h4 className="text-xs font-bold text-blue-900 mb-2.5">
              <span>{selectedSlot ? \`\${selectedSlot.replace('_', '일차 ')}교시 편성 가능 과목 ☞\` : '편성 가능 과목 ☞'}</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {canSubjects.length === 0 ? (
                <span className="text-xs text-gray-400">
                  {selectedSlot ? '편성 가능한 남은 과목이 없습니다.' : '시간표 격자에서 슬롯을 선택하세요.'}
                </span>
              ) : (
                canSubjects.map(s => (
                  <button
                    key={s}
                    disabled={stages.stage3}
                    onClick={() => selectedSlot && handleAddSubjectToSlot(selectedSlot, s)}
                    className="px-3 py-1.5 bg-white hover:bg-blue-600 hover:text-white text-blue-900 border border-blue-300 rounded-lg text-xs font-semibold shadow-xs transition"
                  >
                    + {s}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <h4 className="text-xs font-bold text-gray-800 mb-2.5">
              {MSG.S6_REMAIN_HEADER}
            </h4>
            <div className="flex flex-wrap gap-2">
              {remain.length === 0 ? (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> {MSG.S6_ALL_DONE_TEXT}
                </span>
              ) : (
                remain.map(s => (
                  <span
                    key={s}
                    className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-xs font-semibold"
                  >
                    {s}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {loadModal && (
        <AlertModal
          isOpen={true}
          title={loadModal.title}
          message={loadModal.list.join('\\n')}
          onClose={() => setLoadModal(null)}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {alertModal && (
        <AlertModal
          isOpen={alertModal.isOpen}
          message={alertModal.message}
          isError={alertModal.isError}
          onClose={() => setAlertModal(null)}
        />
      )}
    </div>
  );
};
`;
fs.writeFileSync('src/pages/Step6Timetable.tsx', content, 'utf8');
console.log('Step6 written');
