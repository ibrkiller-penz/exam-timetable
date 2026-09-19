const fs = require('fs');

// Step6Timetable.tsx
fs.writeFileSync('src/pages/Step6Timetable.tsx', `import React, { useState } from 'react';
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
        {/* 5x5 Timetable Grid */}
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

                          {/* Status */}
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
            {/* Day Load */}
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

        {/* Can subjects panel & Remain subjects */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4">
            <h4 className="text-xs font-bold text-blue-900 mb-2.5 flex items-center gap-1.5">
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

      {/* Load Modal */}
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
`, 'utf8');

// Step7Placement.tsx
fs.writeFileSync('src/pages/Step7Placement.tsx', `import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { MSG } from '../domain/messages';
import { selPlacementSlots, selSubjectBanEntries } from '../store/selectors';
import { slotSummary, cellDerived, panelItems } from '../domain/placement';
import { autoPlaceSlot, autoPlaceAll } from '../domain/autoPlace';
import { Sparkles, Trash2, ArrowLeft, ArrowRight, UserCheck } from 'lucide-react';

export const Step7Placement: React.FC = () => {
  const {
    placement,
    rooms,
    students,
    stages,
    ui,
    setPlacementCell,
    clearPlacementSlot,
    clearAllPlacement,
    setPlacementGrid,
    setSelectedPlacementCell,
    confirmStage4,
    cancelStage4,
  } = useAppStore();

  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  const selectedCell = ui.selectedPlacementCell;

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);
  const [roomInfoModal, setRoomInfoModal] = useState<{ title: string; list: string[] } | null>(null);

  const handleCellClick = (slot: number, roomId: string) => {
    setSelectedPlacementCell({ slot, roomId });
  };

  const handleCellDoubleClick = (slot: number, roomId: string) => {
    if (stages.stage4) {
      // Show Room Info popup
      const room = rooms.find(r => r.id === roomId);
      const cellVal = placement[slot]?.[roomId] ?? '';
      setRoomInfoModal({
        title: \`【\${room?.roomName}】 \${cellVal}\`,
        list: [\`고사실: \${room?.roomName}\`, \`배치 항목: \${cellVal}\`],
      });
    }
  };

  const handleAutoPlaceSlot = (slot: number) => {
    if (stages.stage4) return;
    const ps = placementSlots.find(s => s.index === slot);
    if (!ps) return;

    const extraRooms = rooms.filter(r => (r.maxClassSize === null || r.maxClassSize === 0) && r.capacity > 0);
    if (ps.banCountTotal <= extraRooms.length) {
      setConfirmModal({
        isOpen: true,
        message: MSG.S7_AUTO_EXTRA(ps.title, ps.subjects.join(','), ps.banCountTotal, extraRooms.length),
        onConfirm: () => {
          const next = autoPlaceSlot(slot, rooms[0]?.id ?? '', placement, placementSlots, rooms, entries, students, true);
          setPlacementGrid(next);
          setConfirmModal(null);
        },
      });
    } else {
      const next = autoPlaceSlot(slot, rooms[0]?.id ?? '', placement, placementSlots, rooms, entries, students, false);
      setPlacementGrid(next);
    }
  };

  const handleAutoPlaceAll = () => {
    if (stages.stage4) return;
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_AUTO_ALL,
      onConfirm: () => {
        const next = autoPlaceAll(placement, placementSlots, rooms, entries, students);
        setPlacementGrid(next);
        setConfirmModal(null);
      },
    });
  };

  const handleDeleteCurrentCell = () => {
    if (!selectedCell || stages.stage4) return;
    setPlacementCell(selectedCell.slot, selectedCell.roomId, '');
  };

  const handleDeleteSlot = () => {
    if (!selectedCell || stages.stage4) return;
    const ps = placementSlots.find(s => s.index === selectedCell.slot);
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_DEL_SLOT2(ps?.title ?? ''),
      onConfirm: () => {
        clearPlacementSlot(selectedCell.slot);
        setConfirmModal(null);
      },
    });
  };

  const handleDeleteAll = () => {
    if (stages.stage4) return;
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_DEL_ALL,
      onConfirm: () => {
        clearAllPlacement();
        setConfirmModal(null);
      },
    });
  };

  const handleConfirm = () => {
    try {
      const notices = confirmStage4();
      if (notices.length > 0) {
        setAlertModal({ isOpen: true, message: notices.join('\\n') });
      }
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message, isError: true });
    }
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: stages.stage5 ? MSG.S7_CANCEL_SEAT : MSG.S7_CANCEL_SIMPLE,
      onConfirm: () => {
        cancelStage4();
        setConfirmModal(null);
      },
    });
  };

  const curSlot = selectedCell ? placementSlots.find(s => s.index === selectedCell.slot) : null;
  const curRoom = selectedCell ? rooms.find(r => r.id === selectedCell.roomId) : null;
  const pItems = selectedCell ? panelItems(selectedCell.slot, selectedCell.roomId, placement, placementSlots, rooms, entries, students) : [];

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={7}
        stageTitle="학생 및 고사실 배치"
        isConfirmed={stages.stage4}
        confirmLabel="배치 확정"
        cancelLabel="배치 확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoPlaceAll}
              disabled={stages.stage4}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-40"
            >
              <Sparkles className="w-4 h-4" /> 자동 배치 (전체)
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={stages.stage4}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" /> 전체 삭제
            </button>
          </div>
        }
      />

      <div className="p-4 flex-1 flex gap-4 overflow-hidden">
        {/* Placement Grid */}
        <div className="flex-1 flex flex-col border border-gray-300 rounded-xl overflow-auto bg-white shadow-inner">
          <table className="w-full text-xs text-left border-collapse min-w-[900px]">
            <thead className="bg-gray-100 text-gray-800 sticky top-0 z-20 border-b border-gray-300 shadow-xs">
              <tr className="divide-x divide-gray-300">
                <th colSpan={5} className="py-2 px-3 text-center bg-gray-200 font-bold">
                  슬롯 및 요약 현황
                </th>
                {rooms.map(r => (
                  <th key={r.id} className="py-1 px-2 text-center min-w-[110px]">
                    <div className="font-bold text-gray-900">{r.roomName || '(미배정)'}</div>
                    <div className="text-[10px] text-gray-500 font-normal">
                      {r.banName || '별도실'} ({r.capacity}석)
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-300">
              {placementSlots.map(ps => {
                const sum = slotSummary(ps.index, placement, placementSlots, entries);
                const hasError = sum.errorKey !== 'OK';

                return (
                  <React.Fragment key={ps.index}>
                    {/* Row 1: Subject / Takers */}
                    <tr className="divide-x divide-gray-200 bg-white">
                      <td rowSpan={3} className="py-2 px-2.5 font-bold text-center bg-gray-50 w-24">
                        <div className="text-gray-900 font-extrabold">{ps.title}</div>
                        <div className="text-[10px] text-blue-700 mt-1">{ps.subjects.join(', ')}</div>
                        {!stages.stage4 && (
                          <button
                            onClick={() => handleAutoPlaceSlot(ps.index)}
                            className="mt-2 text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold hover:bg-blue-100"
                          >
                            자동배치
                          </button>
                        )}
                      </td>
                      <td className="py-1 px-1.5 text-center bg-gray-50 text-gray-600 font-medium w-12">계</td>
                      <td className="py-1 px-1.5 text-center font-bold text-blue-700 w-12">{sum.total.ban}</td>
                      <td className="py-1 px-1.5 text-center font-semibold w-12">{sum.total.takers}</td>
                      <td className="py-1 px-1.5 text-center font-semibold text-amber-700 w-12">{sum.total.nonTakers}</td>

                      {rooms.map(r => {
                        const cellVal = placement[ps.index]?.[r.id] ?? '';
                        const isSelected = selectedCell?.slot === ps.index && selectedCell?.roomId === r.id;
                        const isWait = cellVal.startsWith('대기 -');
                        const isUsable = r.roomName !== '' && r.roomName !== '0';

                        return (
                          <td
                            key={r.id}
                            rowSpan={3}
                            onClick={() => isUsable && handleCellClick(ps.index, r.id)}
                            onDoubleClick={() => handleCellDoubleClick(ps.index, r.id)}
                            className={\`py-1.5 px-2 align-middle text-center cursor-pointer transition divide-x divide-gray-200 \${
                              !isUsable ? 'bg-gray-100/80 cursor-not-allowed' :
                              isSelected ? 'bg-blue-100 ring-2 ring-blue-600 ring-inset font-bold z-10' :
                              isWait ? 'bg-amber-50/70 hover:bg-amber-100/60' :
                              cellVal ? 'bg-blue-50/70 hover:bg-blue-100/60' :
                              'hover:bg-gray-50'
                            }\`}
                          >
                            {cellVal ? (
                              <div className="space-y-0.5">
                                <div className={\`text-xs font-bold \${isWait ? 'text-amber-900' : 'text-blue-900'}\`}>
                                  {cellVal}
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  {cellDerived(cellVal, entries).stuCount}명
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Row 2: Placed */}
                    <tr className="divide-x divide-gray-200 bg-white">
                      <td className="py-1 px-1.5 text-center bg-gray-50 text-gray-600 font-medium">배치</td>
                      <td className="py-1 px-1.5 text-center font-bold">{sum.placed.ban}</td>
                      <td className="py-1 px-1.5 text-center">{sum.placed.takers}</td>
                      <td className="py-1 px-1.5 text-center text-amber-700">{sum.placed.nonTakers}</td>
                    </tr>

                    {/* Row 3: Remaining */}
                    <tr className={\`divide-x divide-gray-200 border-b-2 border-gray-300 \${hasError ? 'bg-rose-50/50' : 'bg-gray-50/30'}\`}>
                      <td className="py-1 px-1.5 text-center bg-gray-50 text-gray-600 font-medium">미배치</td>
                      <td className={\`py-1 px-1.5 text-center font-bold \${sum.remaining.ban !== 0 ? 'text-rose-600' : 'text-gray-400'}\`}>{sum.remaining.ban}</td>
                      <td className={\`py-1 px-1.5 text-center font-bold \${sum.remaining.takers !== 0 ? 'text-rose-600' : 'text-gray-400'}\`}>{sum.remaining.takers}</td>
                      <td className={\`py-1 px-1.5 text-center font-bold \${sum.remaining.nonTakers !== 0 ? 'text-rose-600' : 'text-gray-400'}\`}>{sum.remaining.nonTakers}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right Panel */}
        <div className="w-80 flex flex-col border border-gray-300 rounded-xl bg-white shadow-sm overflow-hidden shrink-0">
          <div className="bg-gray-100 p-3 border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">배치 패널</h3>
            {curSlot && curRoom && (
              <div className="text-xs text-blue-700 font-semibold mt-1">
                {curSlot.title} : {curRoom.roomName} ({curRoom.banName || '별도실'})
              </div>
            )}
          </div>

          <div className="p-3 flex-1 flex flex-col overflow-hidden">
            {selectedCell ? (
              <>
                <div className="text-xs text-gray-500 mb-2">항목을 클릭하여 현재 셀에 배치:</div>
                <div className="flex-1 overflow-auto border border-gray-200 rounded-lg p-1.5 space-y-1">
                  {pItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400">
                      배치 가능한 과목/대기 항목이 없습니다.
                    </div>
                  ) : (
                    pItems.map((it, idx) => (
                      <button
                        key={idx}
                        disabled={stages.stage4}
                        onClick={() => setPlacementCell(selectedCell.slot, selectedCell.roomId, it.key)}
                        className={\`w-full text-left p-2 rounded-md text-xs border transition flex items-center justify-between \${
                          it.type === 'wait'
                            ? 'bg-amber-50/80 hover:bg-amber-100 border-amber-200 text-amber-900'
                            : 'bg-blue-50/80 hover:bg-blue-100 border-blue-200 text-blue-900 font-semibold'
                        }\`}
                      >
                        <span>{it.key}</span>
                        <span className="text-[11px] text-gray-500">{it.count || it.room}</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteCurrentCell}
                      disabled={stages.stage4}
                      className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded"
                    >
                      현재 셀 삭제
                    </button>
                    <button
                      onClick={handleDeleteSlot}
                      disabled={stages.stage4}
                      className="flex-1 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded"
                    >
                      교시 전체 삭제
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-400 p-6 text-center">
                배치 격자에서 셀을 선택하면 배치 가능한 항목 목록이 여기에 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {roomInfoModal && (
        <AlertModal
          isOpen={true}
          title={roomInfoModal.title}
          message={roomInfoModal.list.join('\\n')}
          onClose={() => setRoomInfoModal(null)}
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
`, 'utf8');

// Step8Attendance.tsx
fs.writeFileSync('src/pages/Step8Attendance.tsx', `import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { MSG } from '../domain/messages';
import { exportAttendanceToExcel } from '../utils/excelExport';
import { Shuffle, ArrowDown10, Download, Search, AlertCircle } from 'lucide-react';

export const Step8Attendance: React.FC = () => {
  const {
    attendance,
    stages,
    updateAttendanceSeat,
    setAttendanceBySeq,
    setAttendanceRandom,
    confirmStage5,
    cancelStage5,
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [filterDay, setFilterDay] = useState('');

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);

  const handleSeatSeq = () => {
    if (stages.stage5) {
      setAlertModal({ isOpen: true, message: MSG.S8_LOCKED, isError: true });
      return;
    }
    setConfirmModal({
      isOpen: true,
      message: MSG.S8_SEAT_SEQ,
      onConfirm: () => {
        setAttendanceBySeq();
        setConfirmModal(null);
      },
    });
  };

  const handleSeatRandom = () => {
    if (stages.stage5) {
      setAlertModal({ isOpen: true, message: MSG.S8_LOCKED, isError: true });
      return;
    }
    setConfirmModal({
      isOpen: true,
      message: MSG.S8_SEAT_RAND,
      onConfirm: () => {
        setAttendanceRandom();
        setConfirmModal(null);
      },
    });
  };

  const handleConfirm = () => {
    try {
      confirmStage5();
      setAlertModal({ isOpen: true, message: MSG.S8_DONE });
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message, isError: true });
    }
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: MSG.S8_CANCEL,
      onConfirm: () => {
        cancelStage5();
        setConfirmModal(null);
      },
    });
  };

  const uniqueRooms = useMemo(() => Array.from(new Set(attendance.map(r => r.examRoom))), [attendance]);
  const uniqueDays = useMemo(() => Array.from(new Set(attendance.map(r => r.day))), [attendance]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter(r => {
      if (filterRoom && r.examRoom !== filterRoom) return false;
      if (filterDay && r.day !== filterDay) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        return r.name.toLowerCase().includes(t) || r.ban.toLowerCase().includes(t) || r.subject.toLowerCase().includes(t);
      }
      return true;
    });
  }, [attendance, filterRoom, filterDay, searchTerm]);

  const unassignedSeats = attendance.filter(r => r.seat === null || r.seat <= 0).length;

  const guideMsg = stages.stage5
    ? MSG.S8_GUIDE_DONE
    : unassignedSeats > 0
    ? MSG.S8_GUIDE_ENTER_SEAT
    : MSG.S8_GUIDE_READY;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={8}
        stageTitle="응시현황 및 좌석번호 부여"
        isConfirmed={stages.stage5}
        confirmLabel="응시현황 확정"
        cancelLabel="응시현황 확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        guideMessage={guideMsg}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleSeatSeq}
              disabled={stages.stage5 || attendance.length === 0}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <ArrowDown10 className="w-4 h-4" /> 좌석 학번순
            </button>
            <button
              onClick={handleSeatRandom}
              disabled={stages.stage5 || attendance.length === 0}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <Shuffle className="w-4 h-4" /> 좌석 랜덤 (대기실 제외)
            </button>
            <button
              onClick={() => exportAttendanceToExcel(attendance)}
              disabled={attendance.length === 0}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <Download className="w-4 h-4" /> 엑셀 내보내기
            </button>
          </div>
        }
      />

      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <select
              value={filterDay}
              onChange={e => setFilterDay(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:outline-none"
            >
              <option value="">모든 일차</option>
              {uniqueDays.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={filterRoom}
              onChange={e => setFilterRoom(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:outline-none"
            >
              <option value="">모든 고사실</option>
              {uniqueRooms.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <span className="text-xs text-gray-500 font-medium">
              총 {filteredAttendance.length.toLocaleString()}건
            </span>
          </div>

          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="성명, 반, 과목 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 border border-gray-200 rounded-xl overflow-auto bg-white shadow-inner">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-gray-100 text-gray-700 sticky top-0 font-semibold border-b border-gray-200 z-10 shadow-xs">
              <tr className="divide-x divide-gray-200">
                <th className="py-2.5 px-3">일차</th>
                <th className="py-2.5 px-3">교시</th>
                <th className="py-2.5 px-3">고사실</th>
                <th className="py-2.5 px-3">과목명</th>
                <th className="py-2.5 px-3">학년</th>
                <th className="py-2.5 px-3">반</th>
                <th className="py-2.5 px-3 text-center">번호</th>
                <th className="py-2.5 px-3">성명</th>
                <th className="py-2.5 px-3">분반(강의실)</th>
                <th className="py-2.5 px-3 text-center">학번순</th>
                <th className="py-2.5 px-3 text-center w-24">좌석번호</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
                    배치를 확정하면 응시현황 및 좌석번호가 생성됩니다.
                  </td>
                </tr>
              ) : (
                filteredAttendance.map(r => {
                  const isWait = r.subject === '미응시';
                  return (
                    <tr key={r.key1} className="divide-x divide-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{r.day}</td>
                      <td className="py-2 px-3">{r.period}</td>
                      <td className="py-2 px-3 font-bold text-gray-900">{r.examRoom}</td>
                      <td className={\`py-2 px-3 font-semibold \${isWait ? 'text-amber-700' : 'text-blue-900'}\`}>
                        {r.subject}
                      </td>
                      <td className="py-2 px-3">{r.grade}</td>
                      <td className="py-2 px-3 font-semibold">{r.ban}</td>
                      <td className="py-2 px-3 text-center">{r.num}</td>
                      <td className="py-2 px-3 font-bold text-gray-900">{r.name}</td>
                      <td className="py-2 px-3 text-gray-500">{r.classRoom || '-'}</td>
                      <td className="py-2 px-3 text-center text-gray-400">{r.seq}</td>
                      <td className="py-1 px-2 text-center">
                        <input
                          type="number"
                          disabled={stages.stage5}
                          value={r.seat ?? ''}
                          onChange={e => updateAttendanceSeat(r.key1, Number(e.target.value) || null)}
                          className="w-16 px-1.5 py-0.5 border border-gray-300 rounded text-center font-bold text-blue-800 disabled:bg-gray-100"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
`, 'utf8');

console.log('Steps 6-8 written.');
