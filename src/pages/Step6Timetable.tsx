import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { CloudModal } from '../components/CloudModal';
import { saveCloudImmediately, loadLatestStateFromCloud } from '../domain/firebase';
import { SlotKey, slotKey, DayIdx, PeriodIdx } from '../domain/types';
import { DAYS, PERIODS, getSubjectColor } from '../domain/constants';
import { MSG } from '../domain/messages';
import { selTakersBySubject, selDuplicateSubjects, selRemainSubjects, selCanSubjects, selDayLoad } from '../store/selectors';
import { slotStatus, canSameTime } from '../domain/timetable';
import { ArrowLeftRight, X, Plus, AlertCircle, CheckCircle2, Sparkles, RotateCcw, Users, GripVertical, Cloud, Download } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export const Step6Timetable: React.FC = () => {
  const { settings, updateSettings, 
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
    moveSubjectToSlot,
    swapTimetableDays,
    swapTimetableSlots,
    clearTimetable,
    applyIdealRecommendation,
    confirmStage3,
    cancelStage3,
  } = useAppStore();

  const selectedSlot = ui.selectedTimetableSlot;
  const takers = useAppStore(selTakersBySubject);
  const duplicates = useAppStore(selDuplicateSubjects);
  const remain = useAppStore(selRemainSubjects);
  const canSubjects = useAppStore(state => selCanSubjects(state, selectedSlot));

  const [swapSelected, setSwapSelected] = useState<string[]>([]);
  const [loadStudentModal, setLoadStudentModal] = useState<{
    day: DayIdx;
    countIdx: number;
    count: number;
    title: string;
    students: { ban: string; num: number; name: string; subjects: string[] }[];
  } | null>(null);
  const [subjectStudentModal, setSubjectStudentModal] = useState<{
    subject: string;
    stuCount: number;
    students: { ban: string; num: number; name: string }[];
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<SlotKey | null>(null);
  const [dragOverDay, setDragOverDay] = useState<DayIdx | null>(null);
  // Selected subject for click-to-highlight-and-move
  const [selectedSubject, setSelectedSubject] = useState<{ subject: string; fromSlot: SlotKey } | null>(null);

  const handleCloudSaveStep6 = async () => {
    try {
      const state = useAppStore.getState();
      const title = `[시간표 작성] ${state.meta.title || '시간표'}_${new Date().toLocaleString('ko-KR')}`;
      await saveCloudImmediately(state, title);
      setAlertModal({
        isOpen: true,
        message: '☁️ 작성 중인 고사시간표가 서버에 성공적으로 저장되었습니다!\n(언제든지 서버 불러오기 또는 스냅샷에서 이어서 작업할 수 있습니다)',
      });
    } catch (err: any) {
      setAlertModal({
        isOpen: true,
        message: '서버 저장 중 오류가 발생했습니다: ' + err.message,
        isError: true,
      });
    }
  };

  const activeDays = useMemo(() => {
    const configured = DAYS.filter(d => {
      const dayObj = days[d - 1];
      return Boolean(dayObj && dayObj.date && dayObj.date.trim() !== '');
    });
    return configured.length > 0 ? (configured as DayIdx[]) : ([1, 2, 3, 4] as DayIdx[]);
  }, [days]);

  // Compute which slots can accept the selected subject (conflict-free)
  const validTargetSlots = useMemo<Set<SlotKey>>(() => {
    if (!selectedSubject) return new Set();
    const result = new Set<SlotKey>();
    for (const d of activeDays) {
      for (const p of PERIODS) {
        const k = slotKey(d, p);
        if (k === selectedSubject.fromSlot) continue; // skip current slot
        const slotSubs = timetable[k]?.subjects ?? [];
        // Subject is already placed somewhere else? Skip if it's already in this slot
        if (slotSubs.includes(selectedSubject.subject)) continue;
        // Check max 4 subjects per slot
        if (slotSubs.length >= 4) continue;
        // Check conflict-free with canSameTime
        if (slotSubs.length === 0 || canSameTime([...slotSubs, selectedSubject.subject], takers)) {
          result.add(k);
        }
      }
    }
    return result;
  }, [selectedSubject, timetable, activeDays, takers]);

  const handleSubjectDragStart = (e: React.DragEvent, subject: string, fromSlot: SlotKey) => {
    if (stages.stage3) return;
    e.stopPropagation(); // prevent slot drag from firing
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'subject', subject, fromSlot }));
    e.dataTransfer.effectAllowed = 'move';
    setSelectedSubject({ subject, fromSlot });
  };

  const handleSubjectDragEnd = () => {
    setSelectedSubject(null);
    setDragOverSlot(null);
  };

  const handleSubjectDropOnSubject = (e: React.DragEvent, targetSub: string, targetSlot: SlotKey) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);
    setSelectedSubject(null);
    if (stages.stage3) return;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'subject') {
        if (data.subject !== targetSub) {
          swapTimetableSubjects(data.subject, targetSub);
        }
      }
    } catch (err) {
      console.error('Subject drop error:', err);
    }
  };

  const handleSlotDragOver = (e: React.DragEvent, slotKeyVal: SlotKey) => {
    if (stages.stage3) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlot !== slotKeyVal) {
      setDragOverSlot(slotKeyVal);
    }
  };

  const handleSlotDrop = (e: React.DragEvent, targetSlot: SlotKey) => {
    e.preventDefault();
    setDragOverSlot(null);
    setSelectedSubject(null);
    if (stages.stage3) return;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'subject') {
        if (data.fromSlot !== targetSlot) {
          moveSubjectToSlot(data.subject, data.fromSlot, targetSlot);
        }
      } else if (data.type === 'slot') {
        if (data.fromSlot !== targetSlot) {
          swapTimetableSlots(data.fromSlot as SlotKey, targetSlot);
        }
      }
    } catch (err) {
      console.error('Slot drop error:', err);
    }
  };

  // Slot-level drag: drag from the cell background to swap entire slot contents
  const handleSlotBgDragStart = (e: React.DragEvent, slot: SlotKey) => {
    if (stages.stage3) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'slot', fromSlot: slot }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDayDragStart = (e: React.DragEvent, day: DayIdx) => {
    if (stages.stage3) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'day', day }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDayDrop = (e: React.DragEvent, targetDay: DayIdx) => {
    e.preventDefault();
    setDragOverDay(null);
    if (stages.stage3) return;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'day' && data.day !== targetDay) {
        swapTimetableDays(data.day, targetDay);
      }
    } catch (err) {
      console.error('Day drop error:', err);
    }
  };

  const handleAutoRecommend = () => {
    try {
      const res = applyIdealRecommendation();
      const unplacedMsg = res.unplacedSubjects.length > 0 ? `\n(미배치 과목: ${res.unplacedSubjects.join(', ')})` : '';
      const p2Msg = res.period2SelfStudyDays.length === activeDays.length
        ? `• 2교시: 전일 100% 자습 (응시생 0명)`
        : res.period2SelfStudyDays.length > 0
        ? `• 2교시: ${res.period2SelfStudyDays.length}일 자습, 나머지 일차는 2·3교시 활용 최적 분산`
        : `• 2·3교시: 활성 교시 내 최적 분산 (과목 충돌 방지 및 학생 부담 분산)`;

      const slotEfficiencyMsg = res.emptySlotsCount > 0
        ? `• 시험 시간 압축: 총 ${res.totalActiveSlots}시간 중 ${res.usedSlotsCount}시간만 활용 (자습/빈시간: ${res.emptySlotsCount}시간 확보)`
        : `• 시험 시간 압축: 총 ${res.usedSlotsCount}시간 내 동시시험 과목 완벽 조합 편성`;

      const lastSlotMsg = res.lastSlotTakers > 0
        ? `• 마지막 시간(${activeDays[activeDays.length - 1]}일차 마지막 교시): ${res.lastSlotTakers}명 동시 응시 (최대화 완료)`
        : '';

      setAlertModal({
        isOpen: true,
        message: `✨ 이상적인 시험시간표가 자동 추천되었습니다!\n\n` +
          `${slotEfficiencyMsg}\n` +
          `${p2Msg}\n` +
          `• 3교시: 전교생 필수/다수인원 과목 우선 집중 배치\n` +
          `• 1·2교시: 학생 겹침 없는 선택과목 완벽 동시편성 (교시당 최대 4과목)\n` +
          `• 학생 1인당 하루 시험: 최대 ${res.maxDailyExamsForAnyStudent}과목 (연속 과밀 시험 방지)\n` +
          `• 충돌(Conflict): 0건 (학생별 중복 0건)\n` +
          `${lastSlotMsg}${unplacedMsg}`,
      });
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message, isError: true });
    }
  };

  const handleClear = () => {
    setConfirmModal({
      isOpen: true,
      message: '시간표 배치를 모두 초기화하시겠습니까?',
      onConfirm: () => {
        clearTimetable();
        setConfirmModal(null);
      },
    });
  };

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

  const handleChipClick = (subject: string, fromSlot: SlotKey, e: React.MouseEvent) => {
    e.stopPropagation();
    if (stages.stage3) return;
    if (e.shiftKey) {
      // Shift+click: swap selection mode
      if (swapSelected.includes(subject)) {
        setSwapSelected(swapSelected.filter(s => s !== subject));
      } else {
        if (swapSelected.length >= 2) {
          setSwapSelected([swapSelected[1], subject]);
        } else {
          setSwapSelected([...swapSelected, subject]);
        }
      }
      return;
    }
    // Normal click: toggle subject selection for highlight-and-move
    if (selectedSubject?.subject === subject && selectedSubject?.fromSlot === fromSlot) {
      setSelectedSubject(null);
    } else {
      setSelectedSubject({ subject, fromSlot });
    }
  };

  const handleSlotClick = (k: SlotKey) => {
    if (stages.stage3) return;
    // If a subject is selected and this slot is a valid target, move the subject here
    if (selectedSubject && validTargetSlots.has(k)) {
      moveSubjectToSlot(selectedSubject.subject, selectedSubject.fromSlot, k);
      setSelectedSubject(null);
      return;
    }
    // Otherwise, deselect subject and set normal slot selection
    setSelectedSubject(null);
    setSelectedTimetableSlot(k);
  };

  const handleSwap = () => {
    if (swapSelected.length !== 2) {
      setAlertModal({ isOpen: true, message: MSG.S6_SWAP_SELECT, isError: true });
      return;
    }
    swapTimetableSubjects(swapSelected[0], swapSelected[1]);
    setSwapSelected([]);
  };

  const handleSubjectDoubleClick = (subject: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const subStudents = students
      .filter(st => st.subjects.includes(subject))
      .map(st => ({ ban: st.ban, num: st.num, name: st.name }))
      .sort((a, b) => {
        if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko', { numeric: true });
        return a.num - b.num;
      });
    setSubjectStudentModal({
      subject,
      stuCount: subStudents.length,
      students: subStudents,
    });
  };

  const handleLoadClick = (day: DayIdx, countIdx: number, val: number) => {
    if (val === 0) return;
    const daySubs = new Set<string>();
    for (let p = 1; p <= 5; p++) {
      const subs = timetable[slotKey(day, p as PeriodIdx)]?.subjects ?? [];
      for (const s of subs) daySubs.add(s);
    }
    const matchedStudents: { ban: string; num: number; name: string; subjects: string[] }[] = [];
    for (const st of students) {
      const stSubsInDay = st.subjects.filter(s => daySubs.has(s));
      if (stSubsInDay.length === countIdx) {
        matchedStudents.push({
          ban: st.ban,
          num: st.num,
          name: st.name,
          subjects: stSubsInDay,
        });
      }
    }
    matchedStudents.sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko', { numeric: true });
      return a.num - b.num;
    });

    const title = countIdx === 0
      ? `${day}일차 미응시 학생 명단 (${val}명)`
      : `${day}일차 ${countIdx}과목 응시 학생 명단 (${val}명)`;

    setLoadStudentModal({
      day,
      countIdx,
      count: val,
      title,
      students: matchedStudents,
    });
  };

  const handleConfirm = () => {
    try {
      confirmStage3();
      saveCloudImmediately(useAppStore.getState()).catch(console.error);
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
        isConfirmed={!!(stages.step6 ?? stages.stage3)}
        confirmLabel="시간표 확정"
        cancelLabel="시간표 확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        guideMessage={guideMsg}
        isError={duplicates.length > 0}
        actions={
          <div className="flex items-center gap-2.5">
            {!stages.stage3 && (
              <>
                <button
                  onClick={handleAutoRecommend}
                  className="px-5 py-2.5 bg-[#005691] hover:bg-[#004270] text-white rounded-xl text-[17px] font-bold flex items-center gap-2 shadow-md transition transform active:scale-95 ring-2 ring-red-500/50"
                >
                  <Sparkles className="w-4 h-4" /> 이상적 시간표 자동 추천
                </button>
                <button
                  onClick={handleClear}
                  className="px-3.5 py-2.5 bg-white hover:bg-white text-gray-800 border border-gray-200 rounded-xl text-[17px] font-bold flex items-center gap-1.5 shadow-2xs transition"
                  title="시간표 전체 초기화"
                >
                  <RotateCcw className="w-4 h-4" /> 초기화
                </button>
              </>
            )}
            {swapSelected.length > 0 && (
              <span className="text-[17px] text-amber-950 bg-[#e6f1f8] px-3 py-2 rounded-xl border border-gray-200 font-black shadow-2xs">
                맞교환 선택 ({swapSelected.length}/2): {swapSelected.join(', ')}
              </span>
            )}
            <button
              onClick={handleSwap}
              disabled={stages.stage3 || swapSelected.length !== 2}
              className="px-4 py-2.5 bg-[#e6f1f8] hover:bg-[#fee2e2] text-[#005691] border border-gray-200 rounded-xl text-[17px] font-black flex items-center gap-1.5 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed transition shadow-2xs"
              title="과목을 Shift+클릭하여 2개 선택 후 맞교환하거나, 마우스로 직접 드래그하여 맞교환할 수 있습니다"
            >
              <ArrowLeftRight className="w-4 h-4 text-[#005691]" /> 맞교환
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6 max-w-[1650px] w-full">
        {/* Main Timetable Card Table - Enlarged Typography */}
        <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <table className="w-full text-[17px] border-collapse">
            <thead>
              <tr className="bg-white text-gray-900 border-b border-gray-200 divide-x divide-gray-200">
                <th className="py-3.5 px-3.5 w-24 text-center font-black bg-gray-50 text-[16.5px]">교시</th>
                {activeDays.map(d => {
                  const dayDate = days[d - 1]?.date;
                  const dateStr = dayDate ? dayjs(dayDate).locale('ko').format('YYYY.M.D.(dd)') : 'X';
                  const isDayOver = dragOverDay === d;
                  return (
                    <th
                      key={d}
                      draggable={!stages.stage3}
                      onDragStart={e => handleDayDragStart(e, d)}
                      onDragOver={e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverDay !== d) setDragOverDay(d);
                      }}
                      onDragLeave={() => setDragOverDay(null)}
                      onDrop={e => handleDayDrop(e, d)}
                      className={`py-3.5 px-3.5 text-center font-black transition select-none ${
                        !stages.stage3 ? 'cursor-grab active:cursor-grabbing hover:bg-gray-50' : ''
                      } ${isDayOver ? 'bg-[#e6f1f8] text-amber-950 ring-2 ring-red-500 ring-inset' : ''}`}
                      title={!stages.stage3 ? '드래그하여 다른 일차와 전체 교시 맞교환' : ''}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {!stages.stage3 && <GripVertical className="w-4 h-4 text-[#0f172a] shrink-0" />}
                        <span className="text-gray-900 font-black text-[16.5px]">{d}일차 - {dateStr}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-normal">
              {PERIODS.map(p => {
                const hasTime = times.some(t => t.period === p && t.time && t.time.trim() !== '');
                return (
                  <tr key={p} className="divide-x divide-gray-200">
                    <td className="py-4 px-2 text-center bg-white font-normal text-gray-900 text-[16.5px]">
                      {hasTime ? `${p}교시` : 'X'}
                    </td>
                    {activeDays.map(d => {
                      const k = slotKey(d, p);
                      const slot = timetable[k] ?? { subjects: [] };
                      const isSelected = selectedSlot === k;
                      const isSlotOver = dragOverSlot === k;
                      const status = slotStatus(d, p, timetable, days, times, takers);

                      // Calculate unique student takers for this specific slot
                      const slotTakersSet = new Set<string>();
                      for (const sub of slot.subjects) {
                        const subTakers = takers.get(sub);
                        if (subTakers) {
                          for (const st of subTakers) slotTakersSet.add(st);
                        }
                      }
                      const slotTakersCount = slotTakersSet.size;
                      const isValidTarget = validTargetSlots.has(k);
                      const isSourceSlot = selectedSubject?.fromSlot === k;

                      return (
                        <td
                          key={d}
                          draggable={!stages.stage3}
                          onDragStart={e => handleSlotBgDragStart(e, k)}
                          onClick={() => handleSlotClick(k)}
                          onDragOver={e => handleSlotDragOver(e, k)}
                          onDragLeave={() => setDragOverSlot(null)}
                          onDrop={e => handleSlotDrop(e, k)}
                          className={`py-3 px-3.5 align-top min-w-[220px] transition-all relative ${
                            isSlotOver
                              ? 'bg-[#fee2e2]/90 ring-2 ring-emerald-500 ring-inset z-20'
                              : isValidTarget
                              ? 'bg-[#e6f1f8] ring-2 ring-red-500 ring-inset z-10 cursor-pointer'
                              : isSourceSlot
                              ? 'bg-[#e6f1f8]/70 ring-2 ring-red-500 ring-inset z-10'
                              : isSelected
                              ? 'bg-[#e6f1f8]/60 ring-2 ring-emerald-600 ring-inset z-10'
                              : 'hover:bg-white'
                          } ${stages.stage3 ? 'bg-white cursor-default' : !isValidTarget ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          title={
                            isValidTarget
                              ? `클릭하여 "${selectedSubject?.subject}" 이동`
                              : !stages.stage3
                              ? '빈 영역을 드래그하여 다른 교시와 맞교환'
                              : ''
                          }
                        >
                          {isValidTarget && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-red-500/30 text-4xl font-black">⬇</span>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2 mb-3 min-h-[34px] relative z-10">
                            {slot.subjects.map(s => {
                              const isSwap = swapSelected.includes(s);
                              const isChipSelected = selectedSubject?.subject === s && selectedSubject?.fromSlot === k;
                              const banCnt = evalSubjects.find(e => e.subject === s)?.banCount ?? 0;
                              const stuCnt = evalSubjects.find(e => e.subject === s)?.stuCount ?? takers.get(s)?.size ?? 0;
                              const c = getSubjectColor(s);
                              return (
                                <span
                                  key={s}
                                  draggable={!stages.stage3}
                                  onDragStart={e => handleSubjectDragStart(e, s, k)}
                                  onDragEnd={handleSubjectDragEnd}
                                  onDragOver={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'move';
                                  }}
                                  onDrop={e => handleSubjectDropOnSubject(e, s, k)}
                                  onClick={e => handleChipClick(s, k, e)}
                                  onDoubleClick={e => handleSubjectDoubleClick(s, e)}
                                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[16px] font-black shadow-xs border transition select-none ${
                                    !stages.stage3 ? 'cursor-grab active:cursor-grabbing' : ''
                                  } ${
                                    isChipSelected
                                      ? 'bg-[#fee2e2] text-[#005691] border-indigo-500 ring-2 ring-emerald-500 shadow-md scale-105'
                                      : isSwap
                                      ? 'bg-[#e6f1f8] text-amber-950 border-indigo-600 ring-2 ring-red-500'
                                      : `${c.bg} ${c.text} ${c.border} ${c.hoverBg} hover:shadow-sm`
                                  }`}
                                  title={!stages.stage3 ? '더블클릭: 응시 학생 명단 / 클릭: 이동 가능 위치 표시 / 드래그: 맞교환·이동' : '더블클릭: 응시 학생 명단'}
                                >
                                  <span>{s}({stuCnt}명)</span>
                                  <span className="text-[15px] text-[#0f172a] bg-white px-2 py-0.5 rounded-md font-black border border-gray-200/80 shadow-2xs">
                                    {banCnt}반
                                  </span>
                                  {!stages.stage3 && (
                                    <button
                                      onClick={e => handleRemoveSubjectFromSlot(k, s, e)}
                                      className="text-[#0f172a] hover:text-red-500 p-0.5 transition"
                                      title="과목 삭제"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </span>
                              );
                            })}

                            {!stages.stage3 && slot.subjects.length < 4 && (
                              <div className="relative group inline-block">
                                <button className="px-2.5 py-1.5 border border-dashed border-gray-200 hover:border-indigo-500 text-[#0f172a] hover:text-[#005691] rounded-xl text-[15px] flex items-center gap-1.5 bg-white font-bold transition shadow-2xs">
                                  <Plus className="w-3.5 h-3.5" /> 과목 추가
                                </button>
                                <div className="hidden group-hover:block absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-30 p-2.5 w-60 max-h-60 overflow-auto">
                                  {evalSubjects.map(s => (
                                    <button
                                      key={s.subject}
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleAddSubjectToSlot(k, s.subject);
                                      }}
                                      disabled={slot.subjects.includes(s.subject)}
                                      className="w-full text-left px-3 py-2 hover:bg-[#e6f1f8] rounded-xl text-[15px] text-[#0f172a] disabled:text-gray-800 font-bold transition flex items-center justify-between"
                                    >
                                      <span>{s.subject}</span>
                                      <span className="text-[15px] text-[#005691] bg-[#e6f1f8] px-2 py-0.5 rounded-md font-black border border-gray-200">
                                        {s.banCount}반
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-1 pt-2 border-t border-gray-200 flex items-center justify-between text-[15px]">
                            {status.kind === 'ok' ? (
                              <span className="text-[#0f172a] flex items-center gap-1 font-normal">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> 정상
                              </span>
                            ) : status.kind === 'error' ? (
                              <span className="text-red-500 font-black flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> {status.message}
                              </span>
                            ) : (
                              <span className="text-gray-800">-</span>
                            )}

                            {slot.subjects.length > 0 && (
                              <span
                                className="font-black text-[#0f172a] bg-white border border-gray-200 px-2.5 py-0.5 rounded-lg text-[15px] flex items-center gap-1.5 shadow-2xs"
                                title={`이 교시 총 시험 응시 학생 수: ${slotTakersCount}명`}
                              >
                                <Users className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                <span>{slotTakersCount}명</span>
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-white border-t-2 border-gray-200 font-normal">
              <tr className="divide-x divide-gray-200">
                <td className="py-3 px-2 text-center font-normal text-gray-900 bg-white text-[17px]">응시자수</td>
                {activeDays.map(d => {
                  const load = useAppStore(state => selDayLoad(state, d));
                  return (
                    <td key={d} className="p-2.5 text-[15px]">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadClick(d, 0, load.counts[0])}
                          className="text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-gray-800 transition flex items-center justify-between group cursor-pointer"
                          title={`${d}일차 미응시 학생 명단 조회 (${load.counts[0]}명)`}
                        >
                          <span className="text-[#0f172a] font-bold">미응시:</span>
                          <strong className="text-gray-900 group-hover:text-[#005691] underline decoration-dotted font-black text-[17px]">{load.counts[0]}명</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadClick(d, 3, load.counts[3])}
                          className={`text-left px-2 py-1.5 rounded-lg transition flex items-center justify-between group cursor-pointer ${
                            load.counts[3] > 0 ? 'bg-[#e6f1f8]/80 hover:bg-[#fee2e2] text-amber-950 font-black border border-gray-200' : 'hover:bg-gray-50 text-gray-800 font-bold'
                          }`}
                          title={`${d}일차 3과목 응시 학생 명단 조회 (${load.counts[3]}명)`}
                        >
                          <span className={load.counts[3] > 0 ? 'text-amber-900 font-black' : 'text-[#0f172a]'}>3과목:</span>
                          <strong className={`underline decoration-dotted font-black text-[17px] ${load.counts[3] > 0 ? 'text-amber-950' : 'text-gray-900 group-hover:text-[#005691]'}`}>{load.counts[3]}명</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadClick(d, 1, load.counts[1])}
                          className="text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-gray-800 transition flex items-center justify-between group cursor-pointer"
                          title={`${d}일차 1과목 응시 학생 명단 조회 (${load.counts[1]}명)`}
                        >
                          <span className="text-[#0f172a] font-bold">1과목:</span>
                          <strong className="text-gray-900 group-hover:text-[#005691] underline decoration-dotted font-black text-[17px]">{load.counts[1]}명</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadClick(d, 4, load.counts[4])}
                          className={`text-left px-2 py-1.5 rounded-lg transition flex items-center justify-between group cursor-pointer ${
                            load.counts[4] > 0 ? 'bg-[#e6f1f8]/80 hover:bg-[#fee2e2] text-rose-950 font-black border border-gray-200' : 'hover:bg-gray-50 text-gray-800 font-bold'
                          }`}
                          title={`${d}일차 4과목 응시 학생 명단 조회 (${load.counts[4]}명)`}
                        >
                          <span className={load.counts[4] > 0 ? 'text-rose-900 font-black' : 'text-[#0f172a]'}>4과목:</span>
                          <strong className={`underline decoration-dotted font-black text-[17px] ${load.counts[4] > 0 ? 'text-rose-950' : 'text-gray-900 group-hover:text-[#005691]'}`}>{load.counts[4]}명</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadClick(d, 2, load.counts[2])}
                          className="text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-gray-800 transition flex items-center justify-between group cursor-pointer"
                          title={`${d}일차 2과목 응시 학생 명단 조회 (${load.counts[2]}명)`}
                        >
                          <span className="text-[#0f172a] font-bold">2과목:</span>
                          <strong className="text-gray-900 group-hover:text-[#005691] underline decoration-dotted font-black text-[17px]">{load.counts[2]}명</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadClick(d, 5, load.counts[5])}
                          className="text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-gray-800 transition flex items-center justify-between group cursor-pointer"
                          title={`${d}일차 5과목 응시 학생 명단 조회 (${load.counts[5]}명)`}
                        >
                          <span className="text-[#0f172a] font-bold">5과목:</span>
                          <strong className="text-gray-900 group-hover:text-[#005691] underline decoration-dotted font-black text-[17px]">{load.counts[5]}명</strong>
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Bottom Helper Panels - Enlarged Typography */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#e6f1f8]/50 border border-gray-200 rounded-2xl p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5">
              <h4 className="text-[17px] font-black text-[#005691] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#005691]" />
                <span>{selectedSlot ? `${selectedSlot.replace('_', '일차 ')}교시 편성 가능 과목 ☞` : '편성 가능 과목 ☞'}</span>
              </h4>
              {selectedSlot && !stages.stage3 && canSubjects.length > 1 && (
                <button
                  onClick={() => {
                    const current = timetable[selectedSlot]?.subjects ?? [];
                    const added = Array.from(new Set([...current, ...canSubjects])).slice(0, 4);
                    setTimetableSlot(selectedSlot, added);
                  }}
                  className="px-3.5 py-2 bg-[#005691] hover:bg-[#005691] text-white rounded-xl text-[15px] font-black shadow-xs transition flex items-center gap-1.5"
                >
                  ⚡ 일괄 추가 (+{canSubjects.length}과목)
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {canSubjects.length === 0 ? (
                <span className="text-[17px] text-[#0f172a] italic">
                  {selectedSlot ? '편성 가능한 남은 과목이 없습니다.' : '시간표 격자에서 슬롯을 선택하세요.'}
                </span>
              ) : (
                canSubjects.map(s => {
                  const c = getSubjectColor(s);
                  return (
                    <button
                      key={s}
                      disabled={stages.stage3}
                      onClick={() => selectedSlot && handleAddSubjectToSlot(selectedSlot, s)}
                      className={`px-3.5 py-2 ${c.bg} ${c.text} ${c.border} border rounded-xl text-[17px] font-black shadow-2xs hover:scale-105 transition active:scale-95`}
                    >
                      + {s}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xs">
            <h4 className="text-[17px] font-black text-[#0f172a] mb-3.5 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <span>{MSG.S6_REMAIN_HEADER}</span>
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {remain.length === 0 ? (
                <span className="text-[17px] font-black text-[#005691] flex items-center gap-2 bg-[#e6f1f8] px-4 py-2 rounded-xl border border-gray-200">
                  <CheckCircle2 className="w-5 h-5 text-[#00A651]" /> {MSG.S6_ALL_DONE_TEXT}
                </span>
              ) : (
                remain.map(s => {
                  const c = getSubjectColor(s);
                  return (
                    <span
                      key={s}
                      className={`px-3.5 py-2 ${c.bg} ${c.text} ${c.border} border rounded-xl text-[17px] font-black shadow-2xs`}
                    >
                      {s}
                    </span>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subject Student List Modal (Double Click) */}
      {subjectStudentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSubjectStudentModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col border border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="p-4.5 border-b border-gray-200 flex items-center justify-between bg-white rounded-t-2xl">
              <h3 className="text-base font-black text-[#005691] flex items-center gap-2.5">
                <Users className="w-5 h-5 text-red-500" />
                <span>【{subjectStudentModal.subject}】 응시 학생 명단</span>
              </h3>
              <button
                onClick={() => setSubjectStudentModal(null)}
                className="text-[#0f172a] hover:text-gray-800 text-xl font-bold p-1 rounded-lg hover:bg-gray-50 transition"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4.5">
              {subjectStudentModal.students.length === 0 ? (
                <div className="text-center text-[17px] text-[#0f172a] py-8">해당 과목 응시 학생이 없습니다.</div>
              ) : (
                <table className="w-full text-[17px] border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200 text-gray-800">
                      <th className="py-2.5 px-2 text-center w-12 font-black">#</th>
                      <th className="py-2.5 px-3 text-center font-black">반</th>
                      <th className="py-2.5 px-3 text-center font-black">번호</th>
                      <th className="py-2.5 px-3 text-left font-black">이름</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectStudentModal.students.map((st, idx) => (
                      <tr key={`${st.ban}-${st.num}`} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-white'}`}>
                        <td className="py-2 px-2 text-center text-[#0f172a] font-normal">{idx + 1}</td>
                        <td className="py-2 px-3 text-center font-normal text-[#005691]">{st.ban}반</td>
                        <td className="py-2 px-3 text-center font-normal text-gray-800">{st.num}번</td>
                        <td className="py-2 px-3 font-normal text-gray-900">{st.name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-white rounded-b-2xl">
              <span className="text-[17px] text-gray-800 font-black">총 {subjectStudentModal.students.length}명</span>
              <button
                onClick={() => setSubjectStudentModal(null)}
                className="px-5 py-2 bg-gray-50 hover:bg-slate-300 text-[#0f172a] rounded-xl text-[17px] font-black transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exam Load Student List Modal (Tfoot Click) */}
      {loadStudentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setLoadStudentModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[620px] max-h-[85vh] flex flex-col border border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="p-4.5 border-b border-gray-200 flex items-center justify-between bg-white rounded-t-2xl">
              <h3 className="text-base font-black text-[#005691] flex items-center gap-2.5">
                <Users className="w-5 h-5 text-red-500" />
                <span>{loadStudentModal.title}</span>
              </h3>
              <button
                onClick={() => setLoadStudentModal(null)}
                className="text-[#0f172a] hover:text-gray-800 text-xl font-bold p-1 rounded-lg hover:bg-gray-50 transition"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4.5">
              {loadStudentModal.students.length === 0 ? (
                <div className="text-center text-[17px] text-[#0f172a] py-8">해당 조건의 학생이 없습니다.</div>
              ) : (
                <table className="w-full text-[17px] border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200 text-gray-800">
                      <th className="py-2.5 px-2 text-center w-12 font-black">#</th>
                      <th className="py-2.5 px-3 text-center font-black">반</th>
                      <th className="py-2.5 px-3 text-center font-black">번호</th>
                      <th className="py-2.5 px-3 text-left font-black">이름</th>
                      <th className="py-2.5 px-3 text-left font-black">해당 일차 응시 과목</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadStudentModal.students.map((st, idx) => (
                      <tr key={`${st.ban}-${st.num}`} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-white'}`}>
                        <td className="py-2 px-2 text-center text-[#0f172a] font-normal">{idx + 1}</td>
                        <td className="py-2 px-3 text-center font-normal text-[#005691]">{st.ban}반</td>
                        <td className="py-2 px-3 text-center font-normal text-gray-800">{st.num}번</td>
                        <td className="py-2 px-3 font-normal text-gray-900">{st.name || '-'}</td>
                        <td className="py-2 px-3 text-[#0f172a]">
                          {st.subjects.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {st.subjects.map(sub => (
                                <span key={sub} className="px-2.5 py-1 bg-[#e6f1f8] text-[#005691] border border-gray-200 rounded-lg text-[15px] font-bold">
                                  {sub}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#0f172a] italic font-normal">미응시 (자습)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-white rounded-b-2xl">
              <span className="text-[17px] text-gray-800 font-black">총 {loadStudentModal.students.length}명</span>
              <button
                onClick={() => setLoadStudentModal(null)}
                className="px-5 py-2 bg-gray-50 hover:bg-slate-300 text-[#0f172a] rounded-xl text-[17px] font-black transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
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

      <CloudModal isOpen={showCloudModal} onClose={() => setShowCloudModal(false)} />
    </div>
  );
};
