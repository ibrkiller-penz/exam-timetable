import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { CloudModal } from '../components/CloudModal';
import { TimetablePreviewModal } from '../components/TimetablePreviewModal';
import { saveCloudImmediately } from '../domain/firebase';
import { MSG } from '../domain/messages';
import { separateRoomFor, SeparateExaminer, isWaitCell, isForbiddenCell, parseWaitCount, Student, ExamRoom, PlacementGrid, PlacementSlot, isExtraRoom, roomsForSlot, capacityForSlot, banLetter, BanLabelStyle, CapacityBasis } from '../domain/types';
import { selPlacementSlots, selSubjectBanEntries } from '../store/selectors';
import { formatBanCell, banStyleForSlot } from '../domain/banLabel';
import { displayName } from '../domain/privacy';
import { slotSummary, cellDerived, panelItems } from '../domain/placement';
import { autoPlaceSlot, autoPlaceAll, resetAndAutoPlaceSlot, getStudentListForSlotRoom, calculateStudentMovement, initSlotStudentPlacements, distributeWaitToRooms, addExamRoomFromWait, shrinkExamRoomToWait } from '../domain/autoPlace';
import { verifySlotIntegrity, assertSlotIntegrity } from '../domain/integrity';
import { SUBJECT_COLOR_PALETTES } from '../domain/constants';
import { Sparkles, Trash2, Users, CheckCircle2, Lock, Unlock, Layers, AlertTriangle, RotateCcw, RotateCw, Plus, Clock, UserX, X, RefreshCw, ArrowRightLeft, UserCheck, Minus, BookOpen, Ban, ArrowRight, HelpCircle } from 'lucide-react';

interface HistorySnapshot {
  placement: PlacementGrid;
  studentPlacements: Record<number, Record<string, string>>;
  lockedCells: Record<number, Record<string, boolean>>;
  rooms: ExamRoom[];
  actionName: string;
}

interface Step7PlacementProps {
  stepMode?: 7 | 8;
}

export const Step7Placement: React.FC<Step7PlacementProps> = ({ stepMode = 8 }) => {
  const { settings, updateSettings, 
    placement,
    studentPlacements,
    lockedCells = {},
    slotRoomCapacity = {},
    slotBanLabels = {},
    slotBanLabelStyle = {},
    slotCapacityBasis = {},
    rooms,
    days,
    students,
    neis,
    
    stages,
    ui,
    setPlacementCell,
    swapPlacementCells,
    setLockedCell,
    setAllLockedCells,
    setSeparateExaminer,
    separateExaminers = {},
    clearPlacementSlot,
    clearAllPlacement,
    setPlacementGrid,
    transferStudentsAndUpdatePlacement,
    setSlotStudentPlacements,
    setAllStudentPlacements,
    setSelectedPlacementCell,
    confirmStage4,
    cancelStage4,
    confirmStep7Rooms,
    cancelStep7Rooms,
    deleteRoom,
    setRooms,
    updateRoom,
    setSlotRoomCapacity,
    setSlotBanLabel,
    setSlotBanLabelStyle,
    setSlotCapacityBasis,
  } = useAppStore();

  /**
   * 분반 번호를 학급 반과 헷갈리지 않게 A반·B반으로 보여줍니다.
   * 저장 형식은 그대로 `과목-1반` 이며 화면 표기만 바꿉니다.
   */
  /**
   * 과목-분반 이름은 한 줄로 보여 줍니다.
   * 칸을 넘치면 줄을 바꾸는 대신 글자를 줄여 표의 높이를 일정하게 유지합니다.
   */
  const cellLabelFontSize = (label: string, compact: boolean): number => {
    const len = label.length;
    const steps = compact ? [15, 13.5, 12, 10.5] : [18, 16, 14, 12.5];
    if (len <= 9) return steps[0];
    if (len <= 12) return steps[1];
    if (len <= 15) return steps[2];
    return steps[3];
  };

  /** 화면과 인쇄물이 같은 규칙을 쓰도록 분반 표기 설정을 한 곳에서 만듭니다. */
  const banLabelConfig = React.useMemo(
    () => ({ defaultStyle: settings.banLabelStyle, slotStyle: slotBanLabelStyle, manual: slotBanLabels }),
    [settings.banLabelStyle, slotBanLabelStyle, slotBanLabels]
  );

  const banStyleOf = (slotIndex: number) => banStyleForSlot(slotIndex, banLabelConfig);

  const banLabel = (val: string, slotIndex?: number, roomId?: string): string =>
    formatBanCell(val, slotIndex, roomId, banLabelConfig, entries.get(val)?.room);

  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  /**
   * 해당 교시의 정원 예외를 반영한 고사실 목록.
   * 배치 로직은 모두 room.capacity를 읽으므로, 교시 단위 호출은 이 함수를 거쳐야
   * "이 교시만 정원 N명" 설정이 실제 배치에 반영됩니다.
   */
  /**
   * 과목마다 파스텔 색을 하나씩 배정합니다.
   * 표에 나온 순서대로 팔레트를 돌려 써서, 이웃한 칸의 다른 과목이 같은 색이 되지 않게 합니다.
   * (과목이 팔레트 수보다 많으면 멀리 떨어진 과목끼리만 색이 겹칩니다.)
   */
  const subjectColorIndex = React.useMemo(() => {
    const map = new Map<string, number>();
    let next = 0;
    for (const ps of placementSlots) {
      for (const sub of ps.subjects) {
        if (!map.has(sub)) map.set(sub, next++);
      }
    }
    return map;
  }, [placementSlots]);

  const colorForSubject = (subject: string) =>
    SUBJECT_COLOR_PALETTES[(subjectColorIndex.get(subject) ?? 0) % SUBJECT_COLOR_PALETTES.length];

  const roomsAt = React.useCallback(
    (slotIndex: number) =>
      roomsForSlot(
        rooms,
        slotIndex,
        slotRoomCapacity,
        placementSlots.find(s => s.index === slotIndex),
        placement[slotIndex],
        slotCapacityBasis[slotIndex]
      ),
    [rooms, slotRoomCapacity, placementSlots, placement, slotCapacityBasis]
  );

  /**
   * 이 단계가 확정되어 잠겼는지.
   * 7. 고사장 배치와 8. 학생 배치는 서로 다른 단계라 확정도 따로 관리합니다.
   * (예전에는 같은 플래그를 써서 7번을 확정하면 8번의 자동배치까지 잠겼습니다.)
   */
  const isStageLocked = stepMode === 7 ? !!stages.step7 : !!stages.stage4;

  const selectedCell = ui.selectedPlacementCell;
  const movementStats = calculateStudentMovement(placement, placementSlots, rooms, students);

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);
  const [cloudModalOpen, setCloudModalOpen] = useState<boolean>(false);
  const [algorithmHelpOpen, setAlgorithmHelpOpen] = useState<boolean>(false);
  /** 분반 이름을 지정할 교시. null이면 닫힘. */
  const [banLabelModal, setBanLabelModal] = useState<number | null>(null);
  const [timetablePreviewOpen, setTimetablePreviewOpen] = useState(false);
  const [studentListModal, setStudentListModal] = useState<{
    slotIndex: number;
    roomId: string;
    title: string;
    students: { ban: string; num: number; name: string; subjects: string[] }[];
  } | null>(null);

  const [waitPlacementModal, setWaitPlacementModal] = useState<{
    isOpen: boolean;
    slotIndex: number;
    subjects: string[];
    selectedSubject: string;
    targetRoomId?: string;
    waitStudentsCount: number;
    candidateRooms: ExamRoom[];
    mode: 'all_regular' | 'custom_rooms' | 'manual_empty' | 'extra_rooms';
    selectedRoomIds: string[];
    examDistributionMode: 'even' | 'fill_unplaced' | 'manual_empty';
  } | null>(null);

  const [selectedStudentKeys, setSelectedStudentKeys] = useState<string[]>([]);
  const [batchTargetRoomId, setBatchTargetRoomId] = useState<string>('');
  const [rowTargetRoomIds, setRowTargetRoomIds] = useState<Record<string, string>>({});
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [isCompactFit, setIsCompactFit] = useState<boolean>(true);

  // Undo / Redo History States (No keyboard shortcuts; toolbar icon buttons only)
  const [past, setPast] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);

  // Push current state to undo history with descriptive action name
  const pushHistory = (actionName = '배치 수정') => {
    const currentSnapshot: HistorySnapshot = {
      placement: JSON.parse(JSON.stringify(placement)),
      studentPlacements: JSON.parse(JSON.stringify(studentPlacements || {})),
      lockedCells: JSON.parse(JSON.stringify(lockedCells || {})),
      rooms: JSON.parse(JSON.stringify(rooms)),
      actionName,
    };
    setPast(prev => [...prev, currentSnapshot].slice(-30));
    setFuture([]);
  };

  const handleUndo = () => {
    if (past.length === 0 || isStageLocked) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    const currentSnapshot: HistorySnapshot = {
      placement: JSON.parse(JSON.stringify(placement)),
      studentPlacements: JSON.parse(JSON.stringify(studentPlacements || {})),
      lockedCells: JSON.parse(JSON.stringify(lockedCells || {})),
      rooms: JSON.parse(JSON.stringify(rooms)),
      actionName: previous.actionName,
    };

    setFuture(prev => [currentSnapshot, ...prev].slice(0, 30));
    setPast(newPast);

    setPlacementGrid(previous.placement);
    setAllStudentPlacements(previous.studentPlacements);
    setRooms(previous.rooms);
    Object.entries(previous.lockedCells).forEach(([slotStr, roomMap]) => {
      const s = Number(slotStr);
      Object.entries(roomMap).forEach(([rId, locked]) => {
        setLockedCell(s, rId, locked);
      });
    });
  };

  const handleRedo = () => {
    if (future.length === 0 || isStageLocked) return;
    const nextSnapshot = future[0];
    const newFuture = future.slice(1);

    const currentSnapshot: HistorySnapshot = {
      placement: JSON.parse(JSON.stringify(placement)),
      studentPlacements: JSON.parse(JSON.stringify(studentPlacements || {})),
      lockedCells: JSON.parse(JSON.stringify(lockedCells || {})),
      rooms: JSON.parse(JSON.stringify(rooms)),
      actionName: nextSnapshot.actionName,
    };

    setPast(prev => [...prev, currentSnapshot].slice(-30));
    setFuture(newFuture);

    setPlacementGrid(nextSnapshot.placement);
    setAllStudentPlacements(nextSnapshot.studentPlacements);
    setRooms(nextSnapshot.rooms);
    Object.entries(nextSnapshot.lockedCells).forEach(([slotStr, roomMap]) => {
      const s = Number(slotStr);
      Object.entries(roomMap).forEach(([rId, locked]) => {
        setLockedCell(s, rId, locked);
      });
    });
  };

  // Toggle forbidden cell ("배치금지") on a room in a slot
  /**
   * 한 고사실을 쓰지 않기로(또는 다시 쓰기로) 바꾼 뒤, 그 교시의 대기 인원을 남은 실에 다시 나눕니다.
   *
   * 시험실 옆 교실을 비우고 싶을 때처럼 대기실 하나를 빼면, 그 방에 있던 학생이 미배치로
   * 남지 않도록 곧바로 재배치합니다. 남은 실로 수용되면 실을 늘리지 않고,
   * 모자랄 때만 모자란 만큼 별도실을 씁니다(distributeWaitToRooms가 일반실부터 채웁니다).
   *
   * 시험을 치르는 칸을 막는 경우는 과목 배치까지 다시 짜야 하므로 여기서 다루지 않고 null을 돌려줍니다.
   */
  const redistributeWaitForSlot = (
    slotIndex: number,
    changedRoomId: string,
    willForbid: boolean
  ): { slotRow: Record<string, string>; slotPlacements: Record<string, string>; message: string } | null => {
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return null;

    const slotRow = { ...(placement[slotIndex] || {}) };
    const changedVal = slotRow[changedRoomId] || '';

    // 시험이 배치된 칸을 막는 것은 과목 재배치가 필요한 별개의 작업입니다.
    if (willForbid && changedVal && !isWaitCell(changedVal) && !isForbiddenCell(changedVal)) return null;

    const slotPlacements = { ...(studentPlacements?.[slotIndex] || initSlotStudentPlacements(
      slotIndex, slotRow, placementSlots, roomsAt(slotIndex), entries, students, neis
    )) };

    // 시험을 보는 학생은 그대로 두고, 대기(또는 아직 자리 없는) 학생만 다시 나눕니다.
    // 반드시 칸을 바꾸기 '전'의 배치를 기준으로 추려야 합니다. 먼저 배치금지로 표시해 버리면
    // 그 방에 있던 학생이 대기로 잡히지 않아 조용히 미배치로 사라집니다.
    const waitStudents = students.filter(st => {
      const rId = slotPlacements[`${st.ban}-${st.num}`];
      if (rId && lockedCells[slotIndex]?.[rId]) return false;
      const val = rId ? slotRow[rId] : undefined;
      return !val || isWaitCell(val);
    }).sort((a, b) => (a.ban !== b.ban ? a.ban.localeCompare(b.ban, 'ko') : a.num - b.num));

    if (willForbid) {
      slotRow[changedRoomId] = '배치금지';
    } else {
      delete slotRow[changedRoomId];
    }

    const availableRooms = roomsAt(slotIndex).filter(r => {
      if (lockedCells[slotIndex]?.[r.id]) return false;
      const val = slotRow[r.id];
      if (isForbiddenCell(val)) return false;
      return !val || isWaitCell(val);
    });

    availableRooms.forEach(r => { delete slotRow[r.id]; });
    waitStudents.forEach(st => { delete slotPlacements[`${st.ban}-${st.num}`]; });

    const assignments = distributeWaitToRooms(waitStudents, availableRooms, students);
    assignments.forEach(a => {
      slotRow[a.room.id] = `대기 - ${a.count}명`;
      a.students.forEach(st => { slotPlacements[`${st.ban}-${st.num}`] = a.room.id; });
    });

    const placedCount = assignments.reduce((sum, a) => sum + a.count, 0);
    const unplaced = waitStudents.length - placedCount;
    const usedExtraRooms = assignments.filter(a => isExtraRoom(a.room)).length;
    const roomLabel = rooms.find(r => r.id === changedRoomId)?.roomName || changedRoomId;

    const lines = [
      willForbid
        ? `🚫 [${roomLabel}] 고사실을 이 교시에 쓰지 않도록 설정했습니다.`
        : `✅ [${roomLabel}] 고사실을 이 교시에 다시 쓸 수 있게 했습니다.`,
      '',
      `대기 ${waitStudents.length}명을 남은 ${assignments.length}개 실에 다시 나눴습니다.`,
    ];
    if (usedExtraRooms > 0) lines.push(`일반 교실만으로 모자라 별도실 ${usedExtraRooms}개를 함께 사용했습니다.`);
    else lines.push('남은 교실만으로 수용되어 실을 더 늘리지 않았습니다.');
    if (unplaced > 0) lines.push(`⚠️ 정원이 모자라 ${unplaced}명이 미배치로 남았습니다. 정원을 올리거나 실을 추가해 주세요.`);

    return { slotRow, slotPlacements, message: lines.join('\n') };
  };

  /**
   * 정원을 바꾼 뒤 그 교시의 배치 인원을 새 정원에 맞춰 다시 나눕니다.
   * 7. 고사장 배치는 '몇 명을 받을 방인가'를 정하는 단계이므로, 정원을 줄이면
   * 넘치는 인원이 다른 방으로 옮겨가야 합니다. 학생 개개인의 조정은 8. 학생 배치에서 합니다.
   */
  const rebalanceSlotAfterCapacityChange = (ps: PlacementSlot) => {
    if (isStageLocked) return;

    // 방금 바꾼 정원이 확실히 반영되도록 스토어에서 직접 읽습니다.
    // 컴포넌트가 다시 그려지기 전에 호출될 수 있어 클로저 값은 한 박자 늦을 수 있습니다.
    const live = useAppStore.getState();
    const livePlacement = live.placement || {};
    const nextRooms = roomsForSlot(rooms, ps.index, live.slotRoomCapacity, ps);
    const nextPlacements = initSlotStudentPlacements(
      ps.index,
      livePlacement[ps.index] ?? {},
      placementSlots,
      nextRooms,
      entries,
      students,
      neis,
      undefined,
      lockedCells[ps.index]
    );

    // 대기실 라벨(대기 - N명)도 새 인원으로 맞춥니다.
    const row = { ...(livePlacement[ps.index] ?? {}) };
    for (const r of rooms) {
      const val = row[r.id];
      if (!val || !isWaitCell(val)) continue;
      const count = students.filter(st => nextPlacements[`${st.ban}-${st.num}`] === r.id).length;
      if (count > 0) row[r.id] = `대기 - ${count}명`;
      else delete row[r.id];
    }

    pushHistory(`[${ps.title}] 정원 변경에 따른 재배치`);
    setPlacementGrid({ ...livePlacement, [ps.index]: row });
    setSlotStudentPlacements(ps.index, nextPlacements);
  };

  /**
   * 전원이 시험을 보는 교시를 '분반' 또는 '학반' 기준으로 다시 배치합니다.
   *  - 분반: NEIS 이동수업 분반(G1, J1 …)대로 모여 앉습니다. 정원은 고사실 좌석 수입니다.
   *  - 학반: 학급이 자기 교실에 그대로 앉습니다. 정원은 그 반의 학생 수입니다.
   */
  const handleSetSlotArrangement = (ps: PlacementSlot, mode: 'ban' | 'class') => {
    if (isStageLocked) return;
    const basis: CapacityBasis = mode === 'class' ? 'class' : 'room';

    pushHistory(`[${ps.title}] ${mode === 'class' ? '학반' : '분반'} 기준 배치`);
    setSlotCapacityBasis(ps.index, basis);

    const live = useAppStore.getState();
    const nextRooms = roomsForSlot(rooms, ps.index, live.slotRoomCapacity, ps, placement[ps.index], basis);

    if (mode === 'class') {
      // 학급이 자기 교실에 그대로 앉습니다.
      const row: Record<string, string> = {};
      const sp: Record<string, string> = {};
      const sameBan = (st: Student, r: ExamRoom) =>
        st.ban === r.banName || st.ban.replace('반', '') === r.banName.replace('반', '');

      for (const r of nextRooms) {
        if (isExtraRoom(r) || !r.banName) continue;
        if (placement[ps.index]?.[r.id] === '배치금지') { row[r.id] = '배치금지'; continue; }

        const mine = students.filter(st => sameBan(st, r));
        const takers = mine.filter(st => st.subjects.some(sub => ps.subjects.includes(sub)));
        if (takers.length === 0) continue;

        // 그 반이 가장 많이 보는 과목을 그 교실의 시험 과목으로 삼습니다.
        const tally = new Map<string, number>();
        takers.forEach(st => ps.subjects.forEach(sub => {
          if (st.subjects.includes(sub)) tally.set(sub, (tally.get(sub) ?? 0) + 1);
        }));
        const subject = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ps.subjects[0];

        row[r.id] = `${subject}-${r.banName}`;
        takers.forEach(st => { sp[`${st.ban}-${st.num}`] = r.id; });
      }

      setPlacementGrid({ ...placement, [ps.index]: row });
      setSlotStudentPlacements(ps.index, sp);
      setAlertModal({
        isOpen: true,
        message: `✅ [${ps.title}]를 학반 기준으로 다시 배치했습니다.

각 학급이 자기 교실에서 시험을 봅니다. 정원은 그 반의 학생 수를 씁니다.`,
      });
      return;
    }

    // 분반 기준 — NEIS 분반대로 다시 배치합니다.
    const res = resetAndAutoPlaceSlot(
      ps.index,
      nextRooms[0]?.id ?? '',
      placement,
      placementSlots,
      nextRooms,
      entries,
      students,
      neis,
      false,
      lockedCells[ps.index]
    );
    setPlacementGrid(res.placement);
    setSlotStudentPlacements(ps.index, res.slotStudentPlacements);
    setAlertModal({
      isOpen: true,
      message: `✅ [${ps.title}]를 분반 기준으로 다시 배치했습니다.

NEIS 분반대로 학생이 모여 앉고, 정원은 고사실 좌석 수를 씁니다.`,
    });
  };

  /**
   * 각 칸에 적힌 분반과 실제로 들어간 학생의 분반이 맞는지 편성현황과 대조합니다.
   * 자동으로 완벽히 맞추지 못하는 경우가 있어, 어디를 손봐야 하는지 알려 줍니다.
   */
  const handleCheckBanMembership = () => {
    if (!neis || neis.length === 0) {
      setAlertModal({ isOpen: true, message: '편성현황 원본이 없어 분반을 대조할 수 없습니다. 1. 학생편성현황에서 파일을 불러와 주세요.', isError: true });
      return;
    }

    const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();
    const sameBan = (a?: string, b?: string) => {
      if (!a || !b) return false;
      const A = norm(a);
      const B = norm(b);
      return A === B || A.endsWith(B) || B.endsWith(A);
    };

    const problems: string[] = [];
    let checked = 0;

    for (const ps of placementSlots) {
      const row = placement[ps.index] ?? {};
      const sp = studentPlacements?.[ps.index];
      if (!sp) continue;

      for (const r of rooms) {
        const cellVal = row[r.id];
        if (!cellVal || isWaitCell(cellVal) || isForbiddenCell(cellVal)) continue;

        const entry = entries.get(cellVal);
        if (!entry) continue;
        checked++;

        const here = students.filter(st => sp[`${st.ban}-${st.num}`] === r.id);
        const wrong = here.filter(st => {
          const myRow = neis.find(n => n.subject === entry.subject && n.ban === st.ban && n.num === st.num);
          if (!myRow) return false; // 편성현황에 없으면 판단하지 않습니다.
          return !sameBan(myRow.room, entry.room) && !sameBan(myRow.room2, entry.room);
        });

        if (wrong.length > 0) {
          problems.push(`${ps.title} ${r.roomName} [${banLabel(cellVal, ps.index, r.id).split('-').pop()}] — 다른 분반 학생 ${wrong.length}명 (예: ${wrong.slice(0, 3).map(st => `${st.ban} ${st.num}번 ${displayName(st.name)}`).join(', ')})`);
        }
      }
    }

    if (problems.length === 0) {
      setAlertModal({
        isOpen: true,
        message: `✅ 분반 점검 결과 이상 없습니다.

고사실 ${checked}곳 모두 편성현황의 분반과 학생이 일치합니다.`,
      });
      return;
    }

    setAlertModal({
      isOpen: true,
      message:
        `⚠️ 분반이 어긋난 고사실이 ${problems.length}곳 있습니다.\n` +
        `칸을 더블클릭해 학생을 옮기거나, '이 고사실 전체 이동'으로 자리를 바꿔 주세요.\n\n` +
        problems.slice(0, 12).join('\n') +
        (problems.length > 12 ? `\n… 외 ${problems.length - 12}곳` : ''),
      isError: true,
    });
  };

  const handleToggleForbiddenCell = (slot?: number, roomId?: string) => {
    if (isStageLocked) return;
    const targetSlot = slot ?? selectedCell?.slot;
    const targetRoomId = roomId ?? selectedCell?.roomId;
    if (targetSlot === undefined || !targetRoomId) return;

    const curVal = placement[targetSlot]?.[targetRoomId] || '';
    const room = rooms.find(r => r.id === targetRoomId);
    const roomLabel = room ? room.roomName : targetRoomId;
    const willForbid = curVal !== '배치금지';

    // 7. 고사장 배치에서는 쓰는 실이 바뀌면 대기 인원을 그 자리에서 다시 나눕니다.
    // 남은 실로 수용되면 그대로 두고, 모자랄 때만 별도실을 덧붙입니다.
    if (stepMode === 7) {
      const result = redistributeWaitForSlot(targetSlot, targetRoomId, willForbid);
      if (result) {
        pushHistory(`고사실 [${roomLabel}] 배치금지 ${willForbid ? '설정' : '해제'}`);
        setPlacementGrid({ ...placement, [targetSlot]: result.slotRow });
        setSlotStudentPlacements(targetSlot, result.slotPlacements);
        setAlertModal({ isOpen: true, message: result.message });
        return;
      }
    }

    if (curVal === '배치금지') {
      pushHistory(`고사실 [${roomLabel}] 배치금지 해제`);
      setPlacementCell(targetSlot, targetRoomId, '');
      setAlertModal({
        isOpen: true,
        message: `✅ [${roomLabel}] 고사실의 배치금지 설정이 해제되었습니다. 이제 이 고사실에 과목 및 학생을 배치할 수 있습니다.`,
      });
      return;
    }

    pushHistory(`고사실 [${roomLabel}] 배치금지 설정`);
    setPlacementCell(targetSlot, targetRoomId, '배치금지');
    setAlertModal({
      isOpen: true,
      message: `🚫 [${roomLabel}] 고사실이 해당 교시에 '배치금지'로 설정되었습니다.\n\n이 고사실에는 과목 및 학생이 전혀 배치되지 않으며, 기존 배정 인원은 미배치 상태로 안전하게 전환되었습니다.`,
    });
  };

  /**
   * 빈 고사실을 이 교시에만 대기실로 엽니다.
   * 인원은 0명으로 두고, 담당자가 8. 학생 배치에서 필요한 만큼만 옮깁니다.
   * (대기 인원을 자동으로 다시 나누면 한 명만 옮기려던 자리가 흔들립니다.)
   */
  const handleMakeWaitRoom = (slotIndex: number, roomId: string) => {
    if (isStageLocked) return;
    const room = rooms.find(r => r.id === roomId);
    const roomLabel = room ? room.roomName : roomId;
    pushHistory(`고사실 [${roomLabel}] 대기실 열기`);
    setPlacementCell(slotIndex, roomId, '대기 - 0명');
    setAlertModal({
      isOpen: true,
      message: `✅ [${roomLabel}]을(를) 이 교시의 대기실로 열었습니다.

지금은 비어 있습니다. 8. 학생 배치에서 칸을 더블클릭해 필요한 학생만 옮겨 주세요.`,
    });
  };

  // 고사장·대기실로 바꾸기 전에, 이 교시에 그 실을 몇 명까지 쓸지 먼저 물어봅니다.
  // 정원을 먼저 정해야 그 정원에 맞춰 인원이 나뉘기 때문입니다.
  const [capacityPrompt, setCapacityPrompt] = useState<{
    slotIndex: number;
    roomId: string;
    kind: 'exam' | 'wait';
    subject?: string;
    value: string;
  } | null>(null);

  // 정원을 저장한 다음 화면이 한 번 그려진 뒤에 변환합니다.
  const [pendingConversion, setPendingConversion] = useState<{
    slotIndex: number;
    roomId: string;
    kind: 'exam' | 'wait';
    subject?: string;
  } | null>(null);

  const openCapacityPrompt = (slotIndex: number, roomId: string, kind: 'exam' | 'wait', subject?: string) => {
    if (isStageLocked) return;
    const room = roomsAt(slotIndex).find(r => r.id === roomId);
    setCapacityPrompt({ slotIndex, roomId, kind, subject, value: String(room?.capacity && room.capacity > 0 ? room.capacity : 28) });
  };

  const confirmCapacityPrompt = () => {
    if (!capacityPrompt) return;
    const { slotIndex, roomId, kind, subject, value } = capacityPrompt;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      setAlertModal({ isOpen: true, message: '정원은 1명 이상으로 적어 주세요.', isError: true });
      return;
    }
    setSlotRoomCapacity(slotIndex, roomId, Math.round(n));
    setCapacityPrompt(null);
    setPendingConversion({ slotIndex, roomId, kind, subject });
  };

  // Modal to select subject when adding/shrinking room in a slot with multiple subjects
  const [subjectSelectModal, setSubjectSelectModal] = useState<{
    isOpen: boolean;
    slotIndex: number;
    action: 'add' | 'shrink';
    targetRoomId?: string;
    subjects: string[];
  } | null>(null);

  const executeAddExamRoom = (
    slotIndex: number,
    subject: string,
    targetRoomId: string | undefined,
    chosenWaitRoomIds: string[] | 'manual_empty' | undefined,
    examDistributionMode: 'even' | 'fill_unplaced' | 'manual_empty' = 'even'
  ) => {
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return;
    try {
      const res = addExamRoomFromWait(
        slotIndex,
        subject,
        targetRoomId,
        placement,
        placementSlots,
        roomsAt(slotIndex),
        entries,
        students,
        studentPlacements || {},
        lockedCells[slotIndex],
        chosenWaitRoomIds,
        examDistributionMode
      );

      pushHistory(`[${ps.title}] ${res.addedRoom.roomName} 고사장 변환`);
      setPlacementGrid(res.placement);
      setAllStudentPlacements(res.studentPlacements);
      setWaitPlacementModal(null);

      let modeDesc = '';
      if (examDistributionMode === 'even') {
        modeDesc = '• [균등 분배]: 해당 과목 전체 학생이 추가된 고사장 포함 모든 고사장에 균등하게 분배되었습니다.';
      } else if (examDistributionMode === 'fill_unplaced') {
        modeDesc = '• [기존 채우기/미배치]: 기존 고사장에 정원까지 채우고 초과 인원은 미배치 상태로 두었습니다.';
      } else {
        modeDesc = '• [수동 배치]: 새 고사장의 학생 인원은 0명으로 비워져 수동 배치가 가능합니다.';
      }

      setAlertModal({
        isOpen: true,
        message: `✅ [${res.addedRoom.roomName}] 대기실이 [${res.newSubjectKey}] 시험 고사장으로 변환되었습니다.\n\n${modeDesc}\n• 남은 대기 인원은 선택하신 설정에 따라 안전하게 배치되었습니다.`,
      });
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message || '고사장 변환에 실패했습니다.', isError: true });
    }
  };

  const handleExecuteWaitPlacement = () => {
    if (!waitPlacementModal) return;
    const { slotIndex, selectedSubject, targetRoomId, mode, candidateRooms, selectedRoomIds, examDistributionMode = 'even' } = waitPlacementModal;

    let chosenWaitRoomIds: string[] | 'manual_empty' | undefined;
    if (mode === 'manual_empty') {
      chosenWaitRoomIds = 'manual_empty';
    } else if (mode === 'all_regular') {
      chosenWaitRoomIds = pickWaitRoomIds(candidateRooms, waitPlacementModal.waitStudentsCount);
    } else if (mode === 'custom_rooms') {
      if (selectedRoomIds.length === 0) {
        setAlertModal({ isOpen: true, message: '대기 학생을 배치할 반을 1개 이상 선택해주세요.', isError: true });
        return;
      }
      chosenWaitRoomIds = selectedRoomIds;
    } else if (mode === 'extra_rooms') {
      chosenWaitRoomIds = undefined;
    }

    executeAddExamRoom(slotIndex, selectedSubject, targetRoomId, chosenWaitRoomIds, examDistributionMode);
  };

  // Add exam room from a wait room for a subject in a slot
  /**
   * 대기 인원을 받을 실을 고릅니다.
   * 일반 학급 교실로 먼저 채우고, 그것만으로 모자랄 때에 한해 모자란 만큼만 별도실을 덧붙입니다.
   */
  const pickWaitRoomIds = (candidateRooms: ExamRoom[], waitStudentCount: number): string[] => {
    const regularRooms = candidateRooms.filter(r => !isExtraRoom(r) && !r.roomName.startsWith('별도'));
    const regularCap = regularRooms.reduce((sum, r) => sum + (r.capacity && r.capacity > 0 ? r.capacity : 28), 0);
    const chosen = regularRooms.map(r => r.id);

    let overflow = waitStudentCount - regularCap;
    if (overflow > 0) {
      const extras = candidateRooms
        .filter(r => isExtraRoom(r) || r.roomName.startsWith('별도'))
        .sort((a, b) => a.roomName.localeCompare(b.roomName, 'ko', { numeric: true }));
      for (const er of extras) {
        if (overflow <= 0) break;
        chosen.push(er.id);
        overflow -= er.capacity && er.capacity > 0 ? er.capacity : 28;
      }
    }

    return chosen;
  };

  const handleAddExamRoomFromWait = (slotIndex: number, subject?: string, targetRoomId?: string) => {
    if (isStageLocked) return;
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return;

    const slotSubjects = ps.subjects;
    const initialSubject = (subject && slotSubjects.includes(subject))
      ? subject
      : (slotSubjects[0] || '');

    // Determine candidate wait rooms and wait students count
    const slotRow = placement[slotIndex] || {};
    const slotP = studentPlacements?.[slotIndex] || {};

    const assignedExamKeys = new Set<string>();
    for (const [stKey, rId] of Object.entries(slotP)) {
      if (rId === targetRoomId) continue;
      const cellVal = slotRow[rId];
      if (cellVal && !isWaitCell(cellVal)) {
        assignedExamKeys.add(stKey);
      }
    }

    const waitStudents = students.filter(st => {
      const k = `${st.ban}-${st.num}`;
      if (assignedExamKeys.has(k)) return false;
      const isExamTaker = st.subjects.some(sub => slotSubjects.includes(sub));
      return !isExamTaker;
    });

    const candidateWaitRooms = rooms.filter(r => {
      if (lockedCells[slotIndex]?.[r.id]) return false;
      if (r.id === targetRoomId) return false;
      const val = slotRow[r.id];
      if (isForbiddenCell(val)) return false;
      return !val || isWaitCell(val);
    });

    const defaultRegularRoomIds = candidateWaitRooms
      .filter(r => !isExtraRoom(r) && !r.roomName.startsWith('별도'))
      .map(r => r.id);

    // 7. 고사장 배치는 정해진 룰대로 바로 처리합니다.
    //  - 남은 실만으로 대기 인원이 수용되면 별도실을 늘리지 않습니다.
    //  - 수용이 안 될 때만 모자란 만큼 별도실을 붙이고 정원에 맞춰 균등 분배합니다.
    if (stepMode === 7) {
      // 교시에 과목이 둘 이상이면 어느 과목의 고사장을 늘릴지는 물어봐야 합니다.
      if (!subject && slotSubjects.length > 1) {
        setSubjectSelectModal({ isOpen: true, slotIndex, subjects: slotSubjects, action: 'add', targetRoomId });
        return;
      }
      executeAddExamRoom(
        slotIndex,
        initialSubject,
        targetRoomId,
        pickWaitRoomIds(candidateWaitRooms, waitStudents.length),
        'even'
      );
      return;
    }

    setWaitPlacementModal({
      isOpen: true,
      slotIndex,
      subjects: slotSubjects,
      selectedSubject: initialSubject,
      targetRoomId,
      waitStudentsCount: waitStudents.length,
      candidateRooms: candidateWaitRooms,
      mode: 'all_regular', // 기본: 각 반(일반 학급)에 균등 분산 배치 (별도실 미사용)
      selectedRoomIds: defaultRegularRoomIds.length > 0 ? defaultRegularRoomIds : candidateWaitRooms.map(r => r.id),
      examDistributionMode: 'even', // 기본: 고사장 1실 추가하여 균등 분배 (0명 비어있는 방 방지)
    });
  };

  // Shrink exam room for a subject in a slot (고사장을 대기실로 변환)
  const handleShrinkExamRoomToWait = (slotIndex: number, subject?: string, targetRoomId?: string) => {
    if (isStageLocked) return;
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return;

    if (!subject) {
      if (ps.subjects.length === 1) {
        subject = ps.subjects[0];
      } else {
        setSubjectSelectModal({
          isOpen: true,
          slotIndex,
          action: 'shrink',
          targetRoomId,
          subjects: ps.subjects,
        });
        return;
      }
    }

    const targetRoom = targetRoomId ? rooms.find(r => r.id === targetRoomId) : undefined;
    setConfirmModal({
      isOpen: true,
      message: `[${ps.title}] ${targetRoom ? `[${targetRoom.roomName}]` : ''} ${subject} 고사장을 대기실로 변환하시겠습니까?\n\n• 고사장에 배정된 학생들은 직전 고사장으로 합쳐집니다.\n• [${targetRoom?.roomName || '해당 고사실'}]은(는) 대기실로 전환되고 대기 인원이 재배치됩니다.\n• 직전 고사장 정원 초과 시 강제 배정(주황색)으로 표시됩니다.`,
      onConfirm: () => {
        try {
          const res = shrinkExamRoomToWait(
            slotIndex,
            subject,
            targetRoomId,
            placement,
            placementSlots,
            roomsAt(slotIndex),
            entries,
            students,
            studentPlacements || {},
            lockedCells[slotIndex]
          );

          pushHistory(`[${ps.title}] ${res.shrunkRoom.roomName} 대기실 변환`);
          setPlacementGrid(res.placement);
          setAllStudentPlacements(res.studentPlacements);
          setConfirmModal(null);
          setAlertModal({
            isOpen: true,
            message: `✅ [${res.shrunkRoom.roomName}] 고사장이 대기실로 변환되었습니다.\n\n• 학생들은 직전 고사장[${res.mergedToRoom?.roomName || ''}]으로 강제 배정되어 합쳐졌습니다. (정원 초과 시 주황색으로 표시)\n• 대기 인원은 대기실들로 자동 재배치되었습니다.`,
          });
        } catch (err: any) {
          setConfirmModal(null);
          setAlertModal({ isOpen: true, message: err.message || '대기실 변환에 실패했습니다.', isError: true });
        }
      },
    });
  };

  // 새 정원이 반영된 뒤에 변환합니다. 그래야 인원이 새 정원 기준으로 나뉘어집니다.
  useEffect(() => {
    if (!pendingConversion) return;
    const { slotIndex, roomId, kind, subject } = pendingConversion;
    setPendingConversion(null);
    if (kind === 'exam') {
      handleAddExamRoomFromWait(slotIndex, subject, roomId);
    } else if (placement[slotIndex]?.[roomId]) {
      handleShrinkExamRoomToWait(slotIndex, subject, roomId);
    } else {
      handleMakeWaitRoom(slotIndex, roomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConversion, slotRoomCapacity]);

  // Clear All Students in a Room
  const handleClearRoomStudents = (r: ExamRoom) => {
    if (isStageLocked) return;
    setConfirmModal({
      isOpen: true,
      message: `[${r.roomName}] 고사장에 배정된 모든 교시의 학생 및 대기를 비우시겠습니까?\n\n※ 비운 후에는 고사장을 완전히 삭제할 수 있습니다.`,
      onConfirm: () => {
        pushHistory(`고사장 [${r.roomName}] 학생 비우기`);
        const newPlacement = { ...placement };
        const newStudentPlacements = { ...studentPlacements };

        placementSlots.forEach(ps => {
          const slot = ps.index;
          if (newPlacement[slot]?.[r.id]) {
            const row = { ...newPlacement[slot] };
            delete row[r.id];
            newPlacement[slot] = row;
          }
          if (newStudentPlacements[slot]) {
            const slotP = { ...newStudentPlacements[slot] };
            Object.entries(slotP).forEach(([stKey, targetRoomId]) => {
              if (targetRoomId === r.id) {
                delete slotP[stKey];
              }
            });
            newStudentPlacements[slot] = slotP;
          }
        });

        setPlacementGrid(newPlacement);
        setAllStudentPlacements(newStudentPlacements);
        setConfirmModal(null);
        setAlertModal({
          isOpen: true,
          message: `✅ [${r.roomName}] 고사장의 모든 배정 학생을 비웠습니다.\n이제 헤더의 [삭제] 버튼으로 고사장을 삭제할 수 있습니다.`
        });
      }
    });
  };

  // Delete Room
  const handleDeleteRoom = (r: ExamRoom) => {
    if (isStageLocked) return;
    setConfirmModal({
      isOpen: true,
      message: `[${r.roomName}] 고사장을 완전히 삭제하시겠습니까?`,
      onConfirm: () => {
        pushHistory(`고사장 [${r.roomName}] 삭제`);
        deleteRoom(r.id);
        setConfirmModal(null);
        setAlertModal({ isOpen: true, message: `✅ [${r.roomName}] 고사장이 삭제되었습니다.` });
      }
    });
  };

  // Subsequent Wait (이후 대기) Handler
  const handleFillSubsequentWait = (startSlotIndex?: number) => {
    if (isStageLocked) return;
    const startSlot = startSlotIndex ?? (selectedCell ? selectedCell.slot : placementSlots[0]?.index ?? 1);
    const startPs = placementSlots.find(ps => ps.index === startSlot);

    setConfirmModal({
      isOpen: true,
      message: `${startPs ? `[${startPs.title}]부터 마지막 교시까지` : '모든 교시의'} 시험이 없는 빈 고사실들에 미응시 대기 인원을 고사실 정원 한도 내에서 일괄 배정하시겠습니까?`,
      onConfirm: () => {
        pushHistory('이후 대기 일괄 배정');
        const newPlacement = { ...placement };
        const newStudentPlacements = { ...studentPlacements };

        placementSlots.filter(ps => ps.index >= startSlot).forEach(ps => {
          const slot = ps.index;
          const slotRow = { ...(newPlacement[slot] || {}) };
          const slotPlacements = newStudentPlacements[slot]
            ? { ...newStudentPlacements[slot] }
            : initSlotStudentPlacements(slot, slotRow, placementSlots, roomsAt(slot), entries, students, neis);

          const waitStudents = students.filter(st => {
            const rId = slotPlacements[`${st.ban}-${st.num}`];
            if (lockedCells[slot]?.[rId]) return false;
            const val = slotRow[rId];
            return !val || isWaitCell(val);
          }).sort((a, b) => {
            if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
            return a.num - b.num;
          });

          if (waitStudents.length === 0) return;

          const emptyRooms = roomsAt(slot).filter(r => {
            if (lockedCells[slot]?.[r.id]) return false;
            const val = slotRow[r.id];
            if (isForbiddenCell(val)) return false;
            return !val || isWaitCell(val);
          });
          if (emptyRooms.length === 0) return;

          emptyRooms.forEach(r => {
            delete slotRow[r.id];
          });

          // 기존 대기 학생 매핑 정리
          waitStudents.forEach(st => {
            delete slotPlacements[`${st.ban}-${st.num}`];
          });

          const assignments = distributeWaitToRooms(waitStudents, emptyRooms, students);
          assignments.forEach(a => {
            slotRow[a.room.id] = `대기 - ${a.count}명`;
            a.students.forEach(st => {
              slotPlacements[`${st.ban}-${st.num}`] = a.room.id;
            });
          });

          newPlacement[slot] = slotRow;
          newStudentPlacements[slot] = slotPlacements;
        });

        setPlacementGrid(newPlacement);
        setAllStudentPlacements(newStudentPlacements);
        setConfirmModal(null);
        setAlertModal({
          isOpen: true,
          message: '✅ 이후 교시들의 빈 고사실에 대기 인원이 정원 한도 내에서 안전하게 배정되었습니다.'
        });
      }
    });
  };

  const [isSaving, setIsSaving] = useState(false);

  /**
   * 중간 저장 — 확정(단계 잠금)과는 별개로 지금 상태를 저장합니다.
   * 스냅샷 제목을 함께 남겨 나중에 클라우드 목록에서 이 시점으로 되돌릴 수 있습니다.
   */
  const handleSaveProgress = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const state = useAppStore.getState();
      const stamp = new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const stepName = stepMode === 7 ? '7. 고사장 배치' : '8. 학생 배치';
      await saveCloudImmediately(state, `[중간저장] ${stepName} — ${stamp}`);
      setAlertModal({
        isOpen: true,
        message: `💾 지금까지의 작업을 저장했습니다.

[중간저장] ${stepName} — ${stamp}

확정과는 별개이며, 상단 ☁️ 클라우드에서 이 시점으로 되돌릴 수 있습니다.`,
      });
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: `저장 실패: ${err?.message || err}`, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCloud = async () => {
    try {
      const state = useAppStore.getState();
      await saveCloudImmediately(state);
      setAlertModal({ isOpen: true, message: '☁️ Cloud Firestore에 학생 및 고사실 배치가 성공적으로 저장되었습니다.' });
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: `서버 저장 실패: ${err?.message || err}`, isError: true });
    }
  };

  const handleCellClick = (slot: number, roomId: string) => {
    setSelectedPlacementCell({ slot, roomId });
    setIsPanelOpen(true);
  };

  const handleCellDoubleClick = (slot: number, roomId: string) => {
    let slotPlacements = studentPlacements?.[slot];
    if (!slotPlacements || Object.keys(slotPlacements).length === 0) {
      slotPlacements = initSlotStudentPlacements(slot, placement[slot] ?? {}, placementSlots, roomsAt(slot), entries, students, neis);
      setSlotStudentPlacements(slot, slotPlacements);
    }

    const result = getStudentListForSlotRoom(
      slot,
      roomId,
      placement,
      placementSlots,
      roomsAt(slot),
      entries,
      students,
      slotPlacements
    );
    if (result.students.length > 0 || result.title) {
      const initialMap: Record<string, string> = {};
      result.students.forEach(st => {
        initialMap[`${st.ban}-${st.num}`] = roomId;
      });
      setRowTargetRoomIds(initialMap);
      setSelectedStudentKeys([]);
      setBatchTargetRoomId('');
      setStudentListModal({
        slotIndex: slot,
        roomId,
        ...result,
      });
    }
  };

  const handleOpenUnplacedModal = (slotIndex: number) => {
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return;

    const slotRow = placement[slotIndex] || {};
    let slotPlacements = studentPlacements?.[slotIndex];
    if (!slotPlacements || Object.keys(slotPlacements).length === 0) {
      slotPlacements = initSlotStudentPlacements(slotIndex, placement[slotIndex] ?? {}, placementSlots, roomsAt(slotIndex), entries, students, neis);
      setSlotStudentPlacements(slotIndex, slotPlacements);
    }

    const unplaced = students.filter(st => {
      const rId = slotPlacements?.[`${st.ban}-${st.num}`];
      return !rId || rId === 'unplaced' || !slotRow[rId] || slotRow[rId] === '배치금지';
    }).sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

    const initialMap: Record<string, string> = {};
    unplaced.forEach(st => {
      initialMap[`${st.ban}-${st.num}`] = 'unplaced';
    });
    setRowTargetRoomIds(initialMap);
    setSelectedStudentKeys([]);
    setBatchTargetRoomId('');
    setStudentListModal({
      slotIndex,
      roomId: 'unplaced',
      title: `[${ps.title}] 미배치 학생 명단 (${unplaced.length}명)`,
      students: unplaced,
    });
  };

  const handleSelectAllStudents = (checked: boolean) => {
    if (!studentListModal) return;
    if (checked) {
      setSelectedStudentKeys(studentListModal.students.map(st => `${st.ban}-${st.num}`));
    } else {
      setSelectedStudentKeys([]);
    }
  };

  const handleSelectStudentToggle = (stKey: string) => {
    setSelectedStudentKeys(prev =>
      prev.includes(stKey) ? prev.filter(k => k !== stKey) : [...prev, stKey]
    );
  };

  // Move selected students in modal to Wait (대기로 이동)
  const handleMoveSelectedToWait = () => {
    if (!studentListModal || selectedStudentKeys.length === 0) return;
    const slot = studentListModal.slotIndex;
    const slotRow = placement[slot] || {};

    // Find a wait room in this slot or an empty room
    let targetWaitRoom = rooms.find(r => {
      const val = slotRow[r.id];
      return val && isWaitCell(val);
    });

    if (!targetWaitRoom) {
      targetWaitRoom = rooms.find(r => !slotRow[r.id] || slotRow[r.id] === '');
    }

    if (!targetWaitRoom) {
      targetWaitRoom = rooms.find(isExtraRoom) || rooms[rooms.length - 1];
    }

    if (targetWaitRoom) {
      setBatchTargetRoomId(targetWaitRoom.id);
      setRowTargetRoomIds(prev => {
        const next = { ...prev };
        selectedStudentKeys.forEach(k => {
          next[k] = targetWaitRoom!.id;
        });
        return next;
      });
    }
  };

  const handleApplyBatchTransfer = () => {
    if (!studentListModal || !batchTargetRoomId || selectedStudentKeys.length === 0) return;
    const targetRoom = rooms.find(r => r.id === batchTargetRoomId);

    setRowTargetRoomIds(prev => {
      const next = { ...prev };
      selectedStudentKeys.forEach(k => {
        next[k] = batchTargetRoomId;
      });
      return next;
    });

    setAlertModal({
      isOpen: true,
      message: `${selectedStudentKeys.length}명의 학생 이동 대상이 ${targetRoom?.roomName || '선택한 고사실'}(으)로 지정되었습니다. 창을 닫거나 [이동 적용]을 누르면 배치 현황에 즉시 반영됩니다.`,
    });

    setSelectedStudentKeys([]);
  };

  const handleCommitTransfersAndClose = (showNotice = false) => {
    if (!studentListModal) return;

    const transfers: Record<string, string> = {};
    let moveCount = 0;

    for (const [stKey, targetId] of Object.entries(rowTargetRoomIds)) {
      if (targetId && targetId !== studentListModal.roomId) {
        transfers[stKey] = targetId;
        moveCount++;
      }
    }

    if (moveCount > 0) {
      const slot = studentListModal.slotIndex;
      const currentPlacements = studentPlacements?.[slot] || {};
      const slotRow = placement[slot] || {};

      // 1. Verify subject enrollment (학생이 수강하지 않는 과목 시험실로의 이동 원천 차단)
      for (const [stKey, targetId] of Object.entries(transfers)) {
        const targetCell = slotRow[targetId];
        if (targetCell && !isWaitCell(targetCell)) {
          const targetSubject = targetCell.split('-')[0];
          const st = students.find(s => `${s.ban}-${s.num}` === stKey);
          if (st && !st.subjects.includes(targetSubject)) {
            setAlertModal({
              isOpen: true,
              message: `⚠️ 수강생 불일치 오류: [${st.name ? displayName(st.name) : stKey}] 학생은 [${targetSubject}] 과목의 수강생이 아닙니다.\n\n해당 과목 고사장에 배치할 수 없습니다. (총원 및 수강자 무결성 보호)`,
              isError: true,
            });
            return;
          }
        }
      }

      // 2. Check destination room capacities (강제 배정 허용 및 주황색 표시 안내)
      const destinationCountDelta: Record<string, number> = {};
      for (const [stKey, targetId] of Object.entries(transfers)) {
        destinationCountDelta[targetId] = (destinationCountDelta[targetId] || 0) + 1;
      }

      let hasForcedRoom = false;
      const forcedRoomDetails: string[] = [];
      for (const [destRoomId, addedCount] of Object.entries(destinationCountDelta)) {
        const destRoom = rooms.find(r => r.id === destRoomId);
        if (destRoom) {
          const destCap = destRoom.capacity && destRoom.capacity > 0 ? destRoom.capacity : 28;
          let currentAssignedInDest = 0;
          for (const [stKey, rId] of Object.entries(currentPlacements)) {
            if (rId === destRoomId && !transfers[stKey]) {
              currentAssignedInDest++;
            }
          }
          if (currentAssignedInDest + addedCount > destCap) {
            hasForcedRoom = true;
            forcedRoomDetails.push(`${destRoom.roomName}(${currentAssignedInDest + addedCount}/${destCap}석)`);
          }
        }
      }

      // 3. Full slot integrity validation (총원 불변, 과목별 총원 초과 금지, 비수강생 배정 차단)
      // 강제 배정(room_capacity_exceeded)은 허용하고 치명적 무결성 오류만 차단
      const simulatedPlacements = { ...currentPlacements, ...transfers };
      const report = verifySlotIntegrity(slot, placement, placementSlots, roomsAt(slot), students, simulatedPlacements);
      const fatalViolations = report.violations.filter(v => v.type !== 'room_capacity_exceeded');
      if (fatalViolations.length > 0) {
        setAlertModal({
          isOpen: true,
          message: `⚠️ 인원 무결성 위반: ${fatalViolations[0].message}\n\n이동이 취소되었습니다.`,
          isError: true,
        });
        return;
      }

      pushHistory(hasForcedRoom ? `학생 ${moveCount}명 강제 배정` : `학생 ${moveCount}명 고사실/대기 이동`);
      transferStudentsAndUpdatePlacement(studentListModal.slotIndex, transfers);
      if (showNotice) {
        setAlertModal({
          isOpen: true,
          message: hasForcedRoom
            ? `✅ ${moveCount}명의 학생 이동이 강제 배정되었습니다.\n\n⚠️ 정원을 초과한 [${forcedRoomDetails.join(', ')}] 고사실은 화면에 주황색(강제 배정)으로 강조 표시됩니다.`
            : `✅ ${moveCount}명의 학생 이동이 성공적으로 적용되어 화면이 갱신되었습니다. (인원 무결성 검증 통과)`,
        });
      }
    }

    setStudentListModal(null);
    setSelectedStudentKeys([]);
    setBatchTargetRoomId('');
    setRowTargetRoomIds({});
  };

  // Reset and Auto-Place a Single Slot (이 교시 재배치)
  const handleResetAndAutoPlaceSlot = (slot: number) => {
    if (isStageLocked) return;
    const ps = placementSlots.find(s => s.index === slot);
    if (!ps) return;

    setConfirmModal({
      isOpen: true,
      message: `[${ps.title}] 교시의 학생 배치를 초기화하고 다시 자동 배치하시겠습니까?\n\n※ 다른 교시의 학생 배치는 전혀 변경되지 않고 안전하게 유지됩니다.`,
      onConfirm: () => {
        pushHistory(`[${ps.title}] 교시 재배치`);
        const firstUsableRoom = rooms.find(r => r.roomName !== '' && r.roomName !== '0');
        const firstRoomId = firstUsableRoom ? firstUsableRoom.id : rooms[0]?.id ?? '';

        const res = resetAndAutoPlaceSlot(
          slot,
          firstRoomId,
          placement,
          placementSlots,
          roomsAt(slot),
          entries,
          students,
          neis,
          false,
          lockedCells[slot]
        );

        setPlacementGrid(res.placement);
        setSlotStudentPlacements(slot, res.slotStudentPlacements);
        setConfirmModal(null);
        setAlertModal({
          isOpen: true,
          message: `✅ [${ps.title}] 교시의 학생 배치가 다른 교시에 영향 없이 성공적으로 재배치되었습니다.`,
        });
      },
    });
  };

  const handleAutoPlaceSlot = (slot: number) => {
    if (isStageLocked) return;
    const ps = placementSlots.find(s => s.index === slot);
    if (!ps) return;

    const extraRooms = rooms.filter(r => (r.maxClassSize === null || r.maxClassSize === 0) && r.capacity > 0);
    const runPlacement = (isExtra: boolean) => {
      pushHistory(`[${ps.title}] 자동배치`);
      const slotLocked = lockedCells[slot];
      const existingPlacements = studentPlacements?.[slot];
      const next = autoPlaceSlot(slot, rooms[0]?.id ?? '', placement, placementSlots, roomsAt(slot), entries, students, isExtra, slotLocked);
      const nextStudentPlacements = initSlotStudentPlacements(slot, next[slot] ?? {}, placementSlots, roomsAt(slot), entries, students, neis, existingPlacements, slotLocked);
      setPlacementGrid(next);
      setSlotStudentPlacements(slot, nextStudentPlacements);
    };

    if (ps.banCountTotal <= extraRooms.length) {
      setConfirmModal({
        isOpen: true,
        message: MSG.S7_AUTO_EXTRA(ps.title, ps.subjects.join(','), ps.banCountTotal, extraRooms.length),
        onConfirm: () => {
          runPlacement(true);
          setConfirmModal(null);
        },
      });
    } else {
      runPlacement(false);
    }
  };

  const handleAutoPlaceAll = () => {
    if (isStageLocked) return;
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_AUTO_ALL,
      onConfirm: () => {
        pushHistory('전체 자동배치');
        // 7. 고사장 배치를 확정해 두었으면 고사실 구성은 손대지 않고 학생만 앉힙니다.
        // 잠가 둔 고사장을 자동배치가 다시 짜버리면 잠근 뜻이 없습니다.
        const roomsLocked = !!stages.step7;
        const next = roomsLocked
          ? placement
          : autoPlaceAll(placement, placementSlots, rooms, entries, students, undefined, lockedCells, slotRoomCapacity, slotCapacityBasis);
        if (!roomsLocked) setPlacementGrid(next);
        const allPlacements: Record<number, Record<string, string>> = {};
        for (const ps of placementSlots) {
          const slotLocked = lockedCells[ps.index];
          const existingPlacements = studentPlacements?.[ps.index];
          allPlacements[ps.index] = initSlotStudentPlacements(ps.index, next[ps.index] ?? {}, placementSlots, roomsAt(ps.index), entries, students, neis, existingPlacements, slotLocked);
        }
        setAllStudentPlacements(allPlacements);
        setConfirmModal(null);
      },
    });
  };

  
  const handleFillWaitSlot = (slotIndex: number) => {
    if (isStageLocked) return;
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return;
    pushHistory(`[${ps.title}] 대기 배정`);
    const newPlacement = { ...placement };
    const newStudentPlacements = { ...studentPlacements };

    const slotRow = { ...(newPlacement[slotIndex] || {}) };
    const slotPlacements = newStudentPlacements[slotIndex] ? { ...newStudentPlacements[slotIndex] } : initSlotStudentPlacements(slotIndex, slotRow, placementSlots, roomsAt(slotIndex), entries, students, neis);

    // Identify all students who should be in "wait" (either currently placed in wait, or entirely unplaced)
    const waitStudents = students.filter(st => {
      const rId = slotPlacements[`${st.ban}-${st.num}`];
      if (rId && lockedCells[slotIndex]?.[rId]) return false; // In locked cell
      
      const val = rId ? slotRow[rId] : undefined;
      // If unplaced or placed in a wait cell, they are wait students
      if (!val || isWaitCell(val)) return true;
      return false;
    }).sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

    if (waitStudents.length === 0) return;

    const emptyRooms = roomsAt(slotIndex).filter(r => {
      if (lockedCells[slotIndex]?.[r.id]) return false;
      const val = slotRow[r.id];
      if (isForbiddenCell(val)) return false;
      return !val || isWaitCell(val);
    });
    if (emptyRooms.length === 0) return;

    // Clear empty rooms
    emptyRooms.forEach(r => {
      if (slotRow[r.id]) delete slotRow[r.id];
    });

    // 기존 대기 학생 매핑 정리
    waitStudents.forEach(st => {
      delete slotPlacements[`${st.ban}-${st.num}`];
    });

    const assignments = distributeWaitToRooms(waitStudents, emptyRooms, students);
    assignments.forEach(a => {
      slotRow[a.room.id] = `대기 - ${a.count}명`;
      a.students.forEach(st => {
        slotPlacements[`${st.ban}-${st.num}`] = a.room.id;
      });
    });

    setPlacementGrid({ ...placement, [slotIndex]: slotRow });
    setSlotStudentPlacements(slotIndex, slotPlacements);
  };
  

  const handleDistributeWaitSingleSlot = (slotIndex: number) => {
    if (isStageLocked) return;
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return;

    pushHistory(`[${ps.title}] 대기 균등분배`);
    const newPlacement = { ...placement };
    const newStudentPlacements = { ...studentPlacements };

    const slotRow = { ...(newPlacement[slotIndex] || {}) };
    const slotPlacements = newStudentPlacements[slotIndex]
      ? { ...newStudentPlacements[slotIndex] }
      : initSlotStudentPlacements(slotIndex, slotRow, placementSlots, roomsAt(slotIndex), entries, students, neis);

    const waitStudents = students.filter(st => {
      const rId = slotPlacements[`${st.ban}-${st.num}`];
      if (rId && lockedCells[slotIndex]?.[rId]) return false;
      const isExamTaker = st.subjects.some(sub => ps.subjects.includes(sub));
      if (isExamTaker) return false;
      return true;
    }).sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

    if (waitStudents.length === 0) {
      setAlertModal({ isOpen: true, message: '배치할 대기/미배치 학생이 없습니다.' });
      return;
    }

    // 일반 학급 빈 고사실 우선 사용 (별도실은 미포함하여 정원 초과 인원은 미배치로 유지)
    const regularEmptyRooms = roomsAt(slotIndex).filter(r => {
      if (lockedCells[slotIndex]?.[r.id]) return false;
      if (isExtraRoom(r) || r.roomName.startsWith('별도')) return false;
      const val = slotRow[r.id];
      if (isForbiddenCell(val)) return false;
      return !val || isWaitCell(val);
    });
    const targetRooms = regularEmptyRooms.length > 0 ? regularEmptyRooms : roomsAt(slotIndex).filter(r => {
      if (lockedCells[slotIndex]?.[r.id]) return false;
      const val = slotRow[r.id];
      if (isForbiddenCell(val)) return false;
      return !val || isWaitCell(val);
    });

    if (targetRooms.length === 0) {
      setAlertModal({ isOpen: true, message: '대기 학생을 배치할 수 있는 빈 고사실이 없습니다.', isError: true });
      return;
    }

    targetRooms.forEach(r => {
      delete slotRow[r.id];
    });
    waitStudents.forEach(st => {
      delete slotPlacements[`${st.ban}-${st.num}`];
    });

    // 정원만큼 균등 분배하고 남으면 미배치에 둠 (allowOverflow: false)
    const assignments = distributeWaitToRooms(waitStudents, targetRooms, students, false);
    assignments.forEach(a => {
      const isRegularHome = Boolean(a.room.banName && a.room.banName.trim() !== '');
      if (isRegularHome) {
        const banKey = a.room.banName.replace('반', '');
        slotRow[a.room.id] = `대기${banKey}반 - ${a.count}명`;
      } else {
        slotRow[a.room.id] = `대기 - ${a.count}명`;
      }
      a.students.forEach(st => {
        slotPlacements[`${st.ban}-${st.num}`] = a.room.id;
      });
    });

    setPlacementGrid({ ...placement, [slotIndex]: slotRow });
    setSlotStudentPlacements(slotIndex, slotPlacements);

    const placedCount = assignments.reduce((s, a) => s + a.count, 0);
    const unplacedRemaining = waitStudents.length - placedCount;
    setAlertModal({
      isOpen: true,
      message: `✅ [${ps.title}] 대기 학생 ${placedCount}명이 고사실 정원 한도 내에서 균등 분배되었습니다.` +
        (unplacedRemaining > 0 ? `\n\n⚠️ 정원 초과 인원 ${unplacedRemaining}명은 미배치 상태로 안전하게 유지됩니다.` : ''),
    });
  };

  const handleDistributeWait = () => {
    if (isStageLocked) return;
    setConfirmModal({
      isOpen: true,
      message: '모든 교시의 대기 인원을 고사실 정원(수용인원) 한도 내에서 빈 고사실에 균등하게 재분배하시겠습니까?\n\n※ 정원을 초과하는 인원은 미배치 상태로 안전하게 유지됩니다.',
      onConfirm: () => {
        pushHistory('대기 균등분배');
        const newPlacement = { ...placement };
        const newStudentPlacements = { ...studentPlacements };

        let totalPlaced = 0;
        let totalUnplacedLeftover = 0;

        placementSlots.forEach(ps => {
          const slot = ps.index;
          const slotRow = { ...(newPlacement[slot] || {}) };
          const slotPlacements = newStudentPlacements[slot]
            ? { ...newStudentPlacements[slot] }
            : initSlotStudentPlacements(slot, slotRow, placementSlots, roomsAt(slot), entries, students, neis);

          const waitStudents = students.filter(st => {
            const rId = slotPlacements[`${st.ban}-${st.num}`];
            if (rId && lockedCells[slot]?.[rId]) return false;
            const isExamTaker = st.subjects.some(sub => ps.subjects.includes(sub));
            if (isExamTaker) return false;
            return true;
          }).sort((a, b) => {
            if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
            return a.num - b.num;
          });

          if (waitStudents.length === 0) return;

          const regularEmptyRooms = roomsAt(slot).filter(r => {
            if (lockedCells[slot]?.[r.id]) return false;
            if (isExtraRoom(r) || r.roomName.startsWith('별도')) return false;
            const val = slotRow[r.id];
            if (isForbiddenCell(val)) return false;
            return !val || isWaitCell(val);
          });
          const targetRooms = regularEmptyRooms.length > 0 ? regularEmptyRooms : roomsAt(slot).filter(r => {
            if (lockedCells[slot]?.[r.id]) return false;
            const val = slotRow[r.id];
            if (isForbiddenCell(val)) return false;
            return !val || isWaitCell(val);
          });

          if (targetRooms.length === 0) return;

          targetRooms.forEach(r => {
            delete slotRow[r.id];
          });
          waitStudents.forEach(st => {
            delete slotPlacements[`${st.ban}-${st.num}`];
          });

          // 정원만큼 균등 분배하고 남으면 미배치에 둠 (allowOverflow: false)
          const assignments = distributeWaitToRooms(waitStudents, targetRooms, students, false);
          assignments.forEach(a => {
            const isRegularHome = Boolean(a.room.banName && a.room.banName.trim() !== '');
            if (isRegularHome) {
              const banKey = a.room.banName.replace('반', '');
              slotRow[a.room.id] = `대기${banKey}반 - ${a.count}명`;
            } else {
              slotRow[a.room.id] = `대기 - ${a.count}명`;
            }
            a.students.forEach(st => {
              slotPlacements[`${st.ban}-${st.num}`] = a.room.id;
            });
          });

          const placedInSlot = assignments.reduce((s, a) => s + a.count, 0);
          totalPlaced += placedInSlot;
          totalUnplacedLeftover += (waitStudents.length - placedInSlot);

          newPlacement[slot] = slotRow;
          newStudentPlacements[slot] = slotPlacements;
        });

        setPlacementGrid(newPlacement);
        setAllStudentPlacements(newStudentPlacements);
        setConfirmModal(null);
        setAlertModal({
          isOpen: true,
          message: `✅ 대기 인원 총 ${totalPlaced}명이 정원 한도 내에서 균등하게 배정되었습니다.` +
            (totalUnplacedLeftover > 0 ? `\n\n⚠️ 정원을 초과한 ${totalUnplacedLeftover}명은 미배치 상태로 안전하게 유지됩니다.` : ''),
        });
      }
    });
  };

  const handleConfirmWaitNames = () => {
    if (isStageLocked) return;
    setConfirmModal({
      isOpen: true,
      message: '현재 각 고사실에 배치된 대기 인원의 명칭을 해당 반(예: 대기1반) 기준으로 확정하시겠습니까?',
      onConfirm: () => {
        pushHistory('대기반 명칭 확정');
        let newPlacement = { ...placement };
        let changed = false;
        Object.keys(newPlacement).forEach(slotStr => {
          const slot = Number(slotStr);
          const row = { ...newPlacement[slot] };
          let rowChanged = false;
          rooms.forEach(r => {
            const val = row[r.id];
            if (val && isWaitCell(val) && val.startsWith('대기 - ')) {
              const count = parseWaitCount(val);
              const label = r.banName ? `대기${r.banName}` : `대기${r.roomName}`;
              row[r.id] = `${label} - ${count}명`;
              rowChanged = true;
            }
          });
          if (rowChanged) {
            newPlacement[slot] = row;
            changed = true;
          }
        });
        if (changed) setPlacementGrid(newPlacement);
        setConfirmModal(null);
      }
    });
  };

  const handleDeleteCurrentCell = () => {
    if (!selectedCell || isStageLocked) return;
    pushHistory('현재 셀 삭제');
    setPlacementCell(selectedCell.slot, selectedCell.roomId, '');
  };

  const handleDeleteSlot = () => {
    if (!selectedCell || isStageLocked) return;
    const ps = placementSlots.find(s => s.index === selectedCell.slot);
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_DEL_SLOT2(ps?.title ?? ''),
      onConfirm: () => {
        pushHistory(`[${ps?.title || '교시'}] 전체 삭제`);
        clearPlacementSlot(selectedCell.slot);
        setConfirmModal(null);
      },
    });
  };

  /**
   * 별도 고사실에서 따로 보는 학생 지정.
   *
   * 틱이나 장애가 있어 따로 응시하고, 끝나면 답안지를 가져옵니다.
   * 원래 고사실 명단에는 그대로 두고 비고에 '별도고사실 응시중'으로 적습니다.
   * 명단에서 빼 버리면 감독 선생님이 그 학생의 존재를 알 수 없습니다.
   *
   * 늘 따로 보는 학생이 있고, 한 과목만 따로 보는 학생(추가 시간이 필요한 경우 등)이
   * 있어서, 체크할 때 어느 쪽인지 물어봅니다.
   */
  const [separateAsk, setSeparateAsk] = useState<{
    studentKey: string;
    label: string;
    slotIndex: number;
    slotTitle: string;
    room: number;
  } | null>(null);

  const separateRoomCount = Math.max(1, settings.separateRoomCount ?? 2);

  const handleToggleSeparate = (st: Pick<Student, 'ban' | 'num' | 'name'>, stKey: string) => {
    if (isStageLocked || !studentListModal) return;
    const cur = separateExaminers[stKey];
    const slotIndex = studentListModal.slotIndex;

    // 이미 이 교시에 별도면 해제합니다.
    if (separateRoomFor(stKey, slotIndex, separateExaminers)) {
      if (cur?.slots === 'all') {
        setSeparateExaminer(stKey, null); // 전체 별도를 풉니다.
      } else {
        const rest = (cur?.slots as number[] ?? []).filter(i => i !== slotIndex);
        setSeparateExaminer(stKey, rest.length > 0 ? { ...cur!, slots: rest } : null);
      }
      return;
    }

    const ps = placementSlots.find(s => s.index === slotIndex);
    setSeparateAsk({
      studentKey: stKey,
      label: `${st.ban} ${st.num}번 ${displayName(st.name)}`,
      slotIndex,
      slotTitle: ps?.title ?? '이 교시',
      room: cur?.room ?? 1,
    });
  };

  const applySeparate = (scope: 'all' | 'slot') => {
    if (!separateAsk) return;
    const { studentKey, slotIndex, room } = separateAsk;
    const cur = separateExaminers[studentKey];
    const entry: SeparateExaminer =
      scope === 'all'
        ? { room, slots: 'all' }
        : { room, slots: [...new Set([...(Array.isArray(cur?.slots) ? cur!.slots : []), slotIndex])] };
    setSeparateExaminer(studentKey, entry);
    setSeparateAsk(null);
  };

  /**
   * 모든 교시·모든 고사실 칸을 한꺼번에 잠그거나 풉니다.
   * 잠긴 칸은 자동배치가 건드리지 않습니다. 손으로 맞춘 자리를 지키는 용도입니다.
   */
  const handleLockAllCells = (locked: boolean) => {
    if (isStageLocked) return;

    if (!locked) {
      setAllLockedCells({});
      setAlertModal({ isOpen: true, message: '모든 칸의 잠금을 풀었습니다.\n\n이제 자동배치가 모든 칸을 다시 짤 수 있습니다.' });
      return;
    }

    const next: Record<number, Record<string, boolean>> = {};
    let count = 0;
    for (const ps of placementSlots) {
      const row: Record<string, boolean> = {};
      for (const r of rooms) {
        if (!r.roomName || r.roomName === '0') continue;
        row[r.id] = true;
        count++;
      }
      next[ps.index] = row;
    }
    setAllLockedCells(next);
    setAlertModal({
      isOpen: true,
      message: `모든 칸(${count}칸)을 잠갔습니다.\n\n자동배치가 이 칸들을 건드리지 않습니다. 고칠 칸만 자물쇠를 눌러 풀면 됩니다.`,
    });
  };

  /**
   * 초기화는 그 단계가 만든 것만 지웁니다.
   *  - 8. 학생 배치: 학생만 비웁니다. 7번에서 정한 고사장·대기실 구성은 그대로 둡니다.
   *  - 7. 고사장 배치: 고사장 구성까지 비웁니다.
   */
  const handleResetStep7 = () => {
    if (isStageLocked) return;

    if (stepMode !== 7) {
      setConfirmModal({
        isOpen: true,
        message: '⚠️ 학생 배치를 초기화하시겠습니까?\n\n• 모든 교시의 학생이 고사실에서 빠집니다.\n• 7. 고사장 배치에서 정한 고사장·대기실과 정원은 그대로 남습니다.\n• 실행 취소(Undo)로 되돌릴 수 있습니다.',
        onConfirm: () => {
          pushHistory('학생 배치 초기화');
          setAllStudentPlacements({});
          setSelectedPlacementCell(null);
          setConfirmModal(null);
          setAlertModal({
            isOpen: true,
            message: '✅ 학생 배치를 초기화했습니다.\n\n고사장 구성은 그대로입니다. [전체 자동배치]로 학생만 다시 앉히면 됩니다.'
          });
        },
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      message: '⚠️ 고사장 배치를 모두 초기화하시겠습니까?\n\n• 모든 교시의 고사실 및 대기 배치가 깨끗하게 비워집니다.\n• 초기화 후 [전체 자동배치]를 다시 실행할 수 있습니다.\n• 작업 후에도 실행 취소(Undo)로 언제든 되돌릴 수 있습니다.',
      onConfirm: () => {
        pushHistory('고사장 배치 전체 초기화');
        clearAllPlacement();
        setPlacementGrid({});
        setAllStudentPlacements({});
        setSelectedPlacementCell(null);
        setConfirmModal(null);
        setAlertModal({
          isOpen: true,
          message: '✅ 고사장 배치가 깨끗하게 초기화되었습니다.\n\n[전체 자동배치] 버튼을 눌러 처음부터 다시 배치를 진행할 수 있습니다.'
        });
      },
    });
  };

  const handleDeleteAll = handleResetStep7;

  const handleConfirm = async () => {
    try {
      // 7. 고사장 배치는 고사실 구성만 잠급니다. 응시현황 생성은 8번 확정에서 합니다.
      if (stepMode === 7) {
        confirmStep7Rooms();
        await saveCloudImmediately(useAppStore.getState(), '[확정] 7단계. 고사장 배치 확정');
        setAlertModal({
          isOpen: true,
          message: '✅ 고사장 배치를 확정했습니다.\n\n고사실 구성과 정원이 잠겼습니다. 이어서 8. 학생 배치에서 학생을 배정하세요.',
        });
        return;
      }

      const notices = confirmStage4();
      await saveCloudImmediately(useAppStore.getState(), '[확정] 8단계. 학생 배치 확정');

      let finalMessage = '✅ 서버에 배치가 확정 및 안전하게 저장되었습니다.\n\n';
      if (notices.length > 0) {
        finalMessage += notices.join('\n');
      } else {
        finalMessage += '특이사항 없이 모든 학생이 성공적으로 배치되었습니다.';
      }
      setAlertModal({ isOpen: true, message: finalMessage });
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message, isError: true });
    }
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: stepMode === 7
        ? '고사장 배치 확정을 취소하고 고사실 구성과 정원을 다시 고칠 수 있게 할까요?'
        : (stages.stage5 ? MSG.S7_CANCEL_SEAT : MSG.S7_CANCEL_SIMPLE),
      onConfirm: () => {
        if (stepMode === 7) cancelStep7Rooms();
        else cancelStage4();
        setConfirmModal(null);
      },
    });
  };

  const curSlot = selectedCell ? placementSlots.find(s => s.index === selectedCell.slot) : null;
  const curRoom = selectedCell ? rooms.find(r => r.id === selectedCell.roomId) : null;
  const pItems = selectedCell ? panelItems(selectedCell.slot, selectedCell.roomId, placement, placementSlots, roomsAt(selectedCell.slot), entries, students) : [];

  const curSlotRow = selectedCell ? (placement[selectedCell.slot] || {}) : {};
  const curSlotPlacements = selectedCell ? (studentPlacements?.[selectedCell.slot] || {}) : {};
  const curCellVal = selectedCell ? (curSlotRow[selectedCell.roomId] || '') : '';
  const examBanItems = pItems.filter(it => it.type === 'ban');

  const unplacedStudents = selectedCell
    ? students.filter(st => {
        const rId = curSlotPlacements[`${st.ban}-${st.num}`];
        if (!rId) return true;
        const val = curSlotRow[rId];
        return !val;
      }).sort((a, b) => {
        const idA = `${a.grade}${String(a.ban).padStart(2, '0')}${String(a.num).padStart(2, '0')}`;
        const idB = `${b.grade}${String(b.ban).padStart(2, '0')}${String(b.num).padStart(2, '0')}`;
        return idA.localeCompare(idB);
      })
    : [];

  const curRoomStudents = selectedCell
    ? students.filter(st => curSlotPlacements[`${st.ban}-${st.num}`] === selectedCell.roomId)
        .sort((a, b) => {
          const idA = `${a.grade}${String(a.ban).padStart(2, '0')}${String(a.num).padStart(2, '0')}`;
          const idB = `${b.grade}${String(b.ban).padStart(2, '0')}${String(b.num).padStart(2, '0')}`;
          return idA.localeCompare(idB);
        })
    : [];


  const handleUnplaceCurrentRoomStudents = () => {
    if (!selectedCell || curRoomStudents.length === 0 || isStageLocked) return;
    const targetRoom = rooms.find(r => r.id === selectedCell.roomId);
    setConfirmModal({
      isOpen: true,
      message: `[${targetRoom?.roomName || '현재 고사실'}]의 학생 ${curRoomStudents.length}명을 모두 비우고 '미배치' 상태로 전환하시겠습니까?`,
      onConfirm: () => {
        const transfers: Record<string, string> = {};
        curRoomStudents.forEach(st => {
          transfers[`${st.ban}-${st.num}`] = 'unplaced';
        });
        pushHistory(`[${curSlot?.title}] ${targetRoom?.roomName} 학생 비우기`);
        transferStudentsAndUpdatePlacement(selectedCell.slot, transfers);
        setConfirmModal(null);
      }
    });
  };

  // Summary counts for current selected slot (or 1st slot)
  const activeSlotIdx = selectedCell?.slot ?? placementSlots[0]?.index ?? 1;
  const activePs = placementSlots.find(s => s.index === activeSlotIdx);
  const activeSlotRow = placement[activeSlotIdx] || {};
  const activeSlotPlacements = studentPlacements?.[activeSlotIdx] || {};

  let activePlacedStudents = 0;
  let activeWaitStudents = 0;
  let activeUnplacedStudents = 0;

  students.forEach(st => {
    const rId = activeSlotPlacements[`${st.ban}-${st.num}`];
    if (!rId) {
      activeUnplacedStudents++;
    } else {
      const val = activeSlotRow[rId];
      if (!val) {
        activeUnplacedStudents++;
      } else if (isWaitCell(val)) {
        activeWaitStudents++;
      } else {
        activePlacedStudents++;
      }
    }
  });

  const activeSlotIntegrity = verifySlotIntegrity(activeSlotIdx, placement, placementSlots, roomsAt(activeSlotIdx), students, activeSlotPlacements);
  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={stepMode === 7 ? 7 : 8}
        stageTitle={stepMode === 7 ? "7. 고사장 배치" : "8. 학생 배치"}
        isConfirmed={isStageLocked}
        confirmLabel={stepMode === 7 ? "7. 고사장 배치 확정" : "8. 학생 배치 확정"}
        cancelLabel="확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        /* 두 잠금은 서로 독립입니다. 다만 8번을 확정해 둔 채 고사장을 고치면
           확정된 학생 배치와 어긋나므로, 막지 않고 알려만 줍니다. */
        guideMessage={
          stepMode === 7 && stages.stage4
            ? '8. 학생 배치가 확정되어 있습니다. 여기서 고사장을 고치면 확정된 학생 배치와 어긋날 수 있으니, 고친 뒤에는 8번에서 다시 확인해 주세요.'
            : undefined
        }
        actions={
          // 버튼이 많아 좁아지면 글자가 세로로 쪼개져 읽기 어려워집니다. 줄바꿈을 막고 줄어들지 않게 합니다.
          <div className="flex items-center gap-2 [&_button]:whitespace-nowrap [&_button]:shrink-0 [&_span]:whitespace-nowrap">
            <button
              onClick={() => setAlgorithmHelpOpen(true)}
              className="p-1.5 text-slate-400 hover:text-[#005691] hover:bg-blue-50 rounded-lg transition"
              title="이 단계가 어떤 규칙으로 배치하는지 봅니다"
              aria-label="배치 규칙 설명"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            {/* Undo / Redo Arrow Buttons */}
            <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 gap-1 shadow-2xs">
              <button
                onClick={handleUndo}
                disabled={past.length === 0 || isStageLocked}
                aria-label="실행 취소"
                className="px-2.5 py-1.5 hover:bg-white text-gray-700 rounded-lg text-sm font-bold flex items-center gap-1 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed shadow-2xs"
                title={past.length > 0 ? `실행 취소 - ${past[past.length - 1].actionName}` : '실행 취소'}
              >
                <RotateCcw className="w-4 h-4 text-indigo-600" />
                <span>취소</span>
              </button>
              <button
                onClick={handleRedo}
                disabled={future.length === 0 || isStageLocked}
                aria-label="다시 실행"
                className="px-2.5 py-1.5 hover:bg-white text-gray-700 rounded-lg text-sm font-bold flex items-center gap-1 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed shadow-2xs"
                title={future.length > 0 ? `다시 실행 - ${future[0].actionName}` : '다시 실행'}
              >
                <RotateCw className="w-4 h-4 text-indigo-600" />
                <span>재실행</span>
              </button>
            </div>

            <button
              onClick={handleAutoPlaceAll}
              disabled={isStageLocked}
              className="px-4 py-2 bg-[#005691] hover:bg-blue-800 text-white rounded-xl text-base font-bold flex items-center gap-1.5 shadow-2xs transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
              title="미응시자 자기반 대기 보장 및 이동 최소화 최적 배치 실행"
            >
              <Sparkles className="w-4 h-4" /> 전체 자동배치
            </button>
            <button
              onClick={handleCheckBanMembership}
              className="px-3 py-2 bg-white hover:bg-gray-50 text-slate-700 border border-gray-300 rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition active:scale-95"
              title="칸에 적힌 분반과 실제 학생이 맞는지 편성현황과 대조합니다"
            >
              <span>🔍 분반 점검</span>
            </button>
            <button
              onClick={() => setTimetablePreviewOpen(true)}
              className="px-3 py-2 bg-white hover:bg-gray-50 text-slate-700 border border-gray-300 rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition active:scale-95"
              title="고사 시간표를 미리 보고 인쇄하거나 엑셀로 내려받습니다"
            >
              <span>📋 시간표</span>
            </button>
            <button
              onClick={handleSaveProgress}
              disabled={isSaving}
              className="px-3 py-2 bg-white hover:bg-gray-50 text-slate-700 border border-gray-300 rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              title="확정하지 않고 지금까지의 작업만 저장합니다 (클라우드에서 이 시점으로 되돌릴 수 있습니다)"
            >
              <span>{isSaving ? '저장 중…' : '💾 중간 저장'}</span>
            </button>
            {/* 손으로 맞춘 자리를 지키려면 칸을 잠급니다. 한 칸씩 누르기 번거로워 한꺼번에 여닫습니다. */}
            <span className="inline-flex rounded-xl border border-gray-300 overflow-hidden shadow-2xs">
              <button
                onClick={() => handleLockAllCells(true)}
                disabled={isStageLocked}
                className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-[15.5px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed active:scale-95"
                title="모든 교시의 모든 칸을 잠급니다. 자동배치가 건드리지 않습니다."
              >
                <Lock className="w-4 h-4 text-slate-500" />
                <span>전체 잠금</span>
              </button>
              <button
                onClick={() => handleLockAllCells(false)}
                disabled={isStageLocked}
                className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-[15.5px] font-bold flex items-center gap-1.5 border-l border-gray-300 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed active:scale-95"
                title="모든 칸의 잠금을 풉니다."
              >
                <Unlock className="w-4 h-4 text-slate-500" />
                <span>해제</span>
              </button>
            </span>
            <button
              onClick={handleResetStep7}
              disabled={isStageLocked}
              className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed shadow-2xs active:scale-95"
              title={stepMode === 7
                ? '모든 교시의 고사장·대기실 구성을 비웁니다.'
                : '학생만 비웁니다. 7번에서 정한 고사장 구성은 그대로 남습니다.'}
            >
              <RotateCcw className="w-4 h-4 text-red-600" />
              <span>{stepMode === 7 ? '고사장 초기화' : '학생 배치 초기화'}</span>
            </button>
          </div>
        }
      />

      {/* 이동 최소화 현황: 학생 배치 결과 지표이므로 8. 학생 배치에서만 보여줍니다. */}
      <div className={`bg-[#fee2e2] text-[#005691] border-b border-emerald-800 px-6 py-2 items-center justify-between shrink-0 no-print shadow-xs ${
        stepMode === 7 ? 'hidden' : 'flex'
      }`}>
        <div className="flex items-center gap-3 text-[15px]">
          <span className="font-bold text-[#005691] flex items-center gap-1.5 text-[17px]">
            <CheckCircle2 className="w-4.5 h-4.5 text-[#005691]" />
            이동 최소화 현황:
          </span>
          <span className="px-2.5 py-0.5 bg-[#005691] text-white font-bold rounded-full text-[15px] shadow-2xs">
            원반 대기 보장률 {movementStats.homeWaitPercentage}%
          </span>
          <span className="text-[#005691] font-bold">
            (대기 학생 {movementStats.homeWaiters}명 / 총 {movementStats.totalWaiters}명 자기반 대기)
          </span>
        </div>

        {/* Live Student Count Summary and Integrity Badge for Current Slot */}
        <div className="flex items-center gap-2.5 text-sm bg-white/90 px-3 py-1 rounded-xl border border-blue-200 font-bold shadow-2xs">
          <span className="text-gray-600">[{activePs?.title || '현재교시'}]</span>
          <span className="text-slate-800">총원: <strong className="text-blue-900">{students.length}명</strong></span>
          <span className="text-slate-300">|</span>
          <span className="text-indigo-700">응시: <strong>{activePlacedStudents}명</strong></span>
          <span className="text-slate-300">|</span>
          <span className="text-amber-700">대기: <strong>{activeWaitStudents}명</strong></span>
          {activeUnplacedStudents > 0 ? (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-red-600">미배치: <strong>{activeUnplacedStudents}명</strong></span>
            </>
          ) : (
            <>
              <span className="text-slate-300">|</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-xs font-extrabold flex items-center gap-1" title="전체 학생 총원과 배치 인원이 정확히 일치합니다">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                인원 일치 ({activePlacedStudents + activeWaitStudents}/{students.length})
              </span>
            </>
          )}
          {activeSlotIntegrity && !activeSlotIntegrity.isValid && (
            <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-md text-xs font-extrabold flex items-center gap-1" title={activeSlotIntegrity.violations[0]?.message}>
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              무결성 주의
            </span>
          )}
        </div>
      </div>

      {/* Control bar: 한눈에 보기 & 배치 패널 토글 */}
      <div className="px-5 pt-2 pb-1 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCompactFit(!isCompactFit)}
            className={`px-3 py-1.5 rounded-lg font-bold border transition flex items-center gap-1.5 ${
              isCompactFit
                ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                : 'bg-white text-slate-700 border-gray-300 hover:bg-gray-50'
            }`}
            title="화면에 맞추어 전체 고사실을 한눈에 볼 수 있도록 컴팩트하게 표시합니다"
          >
            {isCompactFit ? '🔍 한눈에 보기 (ON)' : '🔍 원래 크기 (확대)'}
          </button>
          <span className="text-slate-400 text-[13px]">
            {isCompactFit ? '※ 화면 맞춤 모드: 모든 반이 한눈에 들어오도록 최적화됨' : '※ 기본 크기 모드'}
          </span>
        </div>

        {stepMode !== 7 && (
        <button
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className={`px-3 py-1.5 rounded-lg font-bold border transition flex items-center gap-1.5 ${
            isPanelOpen
              ? 'bg-blue-50 text-[#005691] border-blue-200 shadow-xs'
              : 'bg-white text-slate-600 border-gray-300 hover:bg-gray-50'
          }`}
          title="오른쪽 배치 패널을 열거나 닫아 표를 더 넓게 봅니다"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{isPanelOpen ? '배치 패널 닫기' : '배치 패널 열기'}</span>
        </button>
        )}
      </div>

      <div className="p-4 flex-1 flex gap-4 overflow-hidden">
        {/* Placement Table Grid */}
        <div className="flex-1 flex flex-col border border-gray-200 rounded-2xl overflow-auto bg-white shadow-sm">
          <table className={`w-full text-left border-collapse ${isCompactFit ? 'text-[15px]' : 'text-[17px] min-w-[950px]'}`}>
            <thead className="bg-gray-50 text-[#0f172a] sticky top-0 z-20 shadow-xs">
              <tr className="divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
                <th rowSpan={2} className={`py-2 px-2 text-center font-bold text-gray-900 ${isCompactFit ? 'w-28 text-[14.5px]' : 'w-36 text-[17px]'}`}>
                  슬롯 (과목)
                </th>
                {/* 7. 고사장 배치는 '계' 한 줄만 쓰므로 구분 열이 항상 같은 값이라 뺍니다. */}
                {stepMode !== 7 && (
                  <th rowSpan={2} className={`py-2 px-1 text-center font-bold text-gray-900 ${isCompactFit ? 'w-10 text-[14.5px]' : 'w-12 text-[17px]'}`}>
                    구분
                  </th>
                )}
                <th colSpan={4} className={`py-1.5 px-1 text-center font-bold text-gray-900 ${isCompactFit ? 'text-[14.5px]' : 'text-[17px]'}`}>
                  {stepMode === 7 ? '배정 가능 인원' : '인원 요약'}
                </th>
                {rooms.map(r => {
                  // calculate total students placed in this room across all slots
                  const totalStudentsInRoom = placementSlots.reduce((acc, ps) => {
                    const slotPlacements = studentPlacements?.[ps.index];
                    if (slotPlacements) {
                      return acc + Object.values(slotPlacements).filter(id => id === r.id).length;
                    }
                    const val = placement[ps.index]?.[r.id];
                    if (val && !isWaitCell(val)) {
                      return acc + (entries.get(val)?.stuCount || 0);
                    } else if (val && isWaitCell(val)) {
                      return acc + parseWaitCount(val);
                    }
                    return acc;
                  }, 0);

                  const canDeleteRoom = totalStudentsInRoom === 0;

                  return (
                    <th key={r.id} rowSpan={2} className={`py-1.5 px-1 text-center bg-white group relative ${isCompactFit ? 'min-w-[80px] px-1' : 'min-w-[115px] px-2'}`}>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="flex-1 text-center font-bold text-gray-900 truncate" title={r.roomName}>
                          {r.roomName || '(미배정)'}
                        </span>
                        
                        {/* Action icons on room header */}
                        {!isStageLocked && (
                          <div className="flex items-center gap-0.5">
                            {canDeleteRoom ? (
                              <button
                                onClick={() => handleDeleteRoom(r)}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition shadow-2xs"
                                title={`${r.roomName} 고사장 삭제 (현재 배정된 학생 0명)`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleClearRoomStudents(r)}
                                className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition opacity-0 group-hover:opacity-100 shadow-2xs"
                                title={`${r.roomName} 고사장의 모든 배정 학생 비우기 (비운 후 고사장 삭제 가능)`}
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className={`text-slate-500 font-semibold flex items-center justify-center gap-1 ${isCompactFit ? 'text-[11px]' : 'text-[12.5px]'}`}>
                        <span>{r.banName || r.roomName || '별도실'} ({r.capacity}석)</span>
                        {totalStudentsInRoom > 0 ? (
                          <span className="text-blue-600 text-[10.5px] bg-blue-50 px-1 py-0.2 rounded font-bold" title="현재 배정된 총 학생 수">
                            {totalStudentsInRoom}명
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[10px] bg-gray-50 px-1 py-0.2 rounded">
                            비어있음
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}

              </tr>
              <tr className="divide-x divide-gray-200 border-b border-gray-200 bg-white">
                <th className={`py-1 px-0.5 text-center font-bold text-gray-700 ${isCompactFit ? 'w-8 text-[13.5px]' : 'w-12 text-[15px]'}`}>학급</th>
                <th className={`py-1 px-0.5 text-center font-bold text-gray-700 ${isCompactFit ? 'w-8 text-[13.5px]' : 'w-12 text-[15px]'}`}>총원</th>
                <th className={`py-1 px-0.5 text-center font-black text-[#005691] ${isCompactFit ? 'w-8 text-[13.5px]' : 'w-12 text-[15px]'}`}>응시</th>
                {/* 7. 고사장 배치에서는 셀에 쓰는 말과 맞춰 '대기'로 부릅니다. */}
                <th className={`py-1 px-0.5 text-center font-black text-slate-600 ${isCompactFit ? 'w-8 text-[13.5px]' : 'w-12 text-[15px]'}`}>
                  대기
                </th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-200 font-normal">
              {placementSlots.map((ps, slotIdx) => {
                // 8. 학생 배치는 실제로 앉힌 결과만 셉니다. 비우면 0명으로 보여야 합니다.
                const sum = slotSummary(ps.index, placement, placementSlots, entries, studentPlacements, students, stepMode !== 7);
                const hasError = sum.errorKey !== 'OK';
                // 일차가 바뀌는 첫 줄에 굵은 경계선을 그어 날짜를 구분합니다.
                const isNewDay = slotIdx === 0 || placementSlots[slotIdx - 1].day !== ps.day;
                const dayTone = ps.day % 2 === 1
                  ? { bar: 'bg-[#005691]', chip: 'bg-[#005691] text-white', cell: 'bg-white' }
                  : { bar: 'bg-slate-500', chip: 'bg-slate-600 text-white', cell: 'bg-slate-50/70' };

                // 표 전체를 가로지르는 날짜 띠. 일차가 바뀌는 지점을 확실히 끊어 줍니다.
                const totalCols = 1 + (stepMode === 7 ? 0 : 1) + 4 + rooms.length;

                return (
                  <React.Fragment key={ps.index}>
                    {isNewDay && (
                      <tr>
                        <td colSpan={totalCols} className={`p-0 ${dayTone.bar}`}>
                          <div className={`flex items-center gap-2 px-3 text-white font-black tracking-wide ${isCompactFit ? 'py-1 text-[13px]' : 'py-1.5 text-[15px]'}`}>
                            <span>{ps.day}일차</span>
                            <span className="opacity-60 font-bold">
                              {days.find(d => d.day === ps.day)?.date || ''}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr className="divide-x divide-gray-200 bg-white">
                      <td rowSpan={stepMode === 7 ? 1 : 3} className={`py-2 px-2 font-bold text-center ${dayTone.cell} ${isCompactFit ? 'w-28' : 'w-36'}`}>
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-black leading-none whitespace-nowrap ${dayTone.chip} ${isCompactFit ? 'text-[12.5px]' : 'text-[14px]'}`}>
                            {ps.day}일차
                          </span>
                          <span className={`text-gray-900 font-black whitespace-nowrap ${isCompactFit ? 'text-[15px]' : 'text-[17.5px]'}`}>{ps.period}교시</span>
                        </div>
                        {/* 과목이 둘 이상이면 한 줄에 하나씩 적어 중간에 끊기지 않게 합니다. */}
                        <div className={`font-bold mt-0.5 leading-snug ${ps.subjects.length === 0 ? 'text-slate-500' : 'text-[#005691]'} ${isCompactFit ? 'text-[14px]' : 'text-[16px]'}`}>
                          {ps.subjects.length === 0
                            ? '시험 없음 · 전체 자습'
                            : ps.subjects.map(sub => (
                                <div key={sub} className="whitespace-nowrap overflow-hidden text-ellipsis" title={sub}>
                                  {sub}
                                </div>
                              ))}
                        </div>
                        {/* 전원이 시험을 보는 교시는 분반으로 모을지, 학급이 자기 교실에 앉을지 고릅니다. */}
                        {/* 교시 도구는 한 줄로 모아 칸이 길어지지 않게 합니다. */}
                        {!isStageLocked && ps.subjects.length > 0 && (
                          <div className={`mt-1 flex items-center justify-center gap-1 ${isCompactFit ? 'text-[11px]' : 'text-[12.5px]'}`}>
                            <button
                              onClick={() => handleResetAndAutoPlaceSlot(ps.index)}
                              className="p-0.5 text-slate-400 hover:text-[#005691] hover:bg-blue-50 rounded transition"
                              title="이 교시 재배치 — 이 교시만 비우고 다시 자동배치합니다"
                              aria-label="이 교시 재배치"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>

                            {stepMode === 7 && ps.nonTakers === 0 && (
                              <span className="inline-flex rounded-md border border-gray-300 overflow-hidden">
                                {([['ban', '분반'], ['class', '학반']] as const).map(([mode, label]) => {
                                  const active = (slotCapacityBasis[ps.index] ?? 'room') === (mode === 'class' ? 'class' : 'room');
                                  return (
                                    <button
                                      key={mode}
                                      onClick={() => handleSetSlotArrangement(ps, mode)}
                                      className={`px-1.5 py-0.5 font-bold transition ${
                                        active ? 'bg-[#005691] text-white' : 'bg-white text-slate-600 hover:bg-gray-50'
                                      }`}
                                      title={mode === 'ban'
                                        ? '편성현황 분반대로 모여 앉습니다. 정원은 고사실 좌석 수입니다.'
                                        : '학급이 자기 교실에 그대로 앉습니다. 정원은 그 반의 학생 수입니다.'}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </span>
                            )}

                            {stepMode === 7 && (
                              <button
                                onClick={() => setBanLabelModal(ps.index)}
                                className="px-1.5 py-0.5 bg-white hover:bg-blue-50 text-slate-600 hover:text-[#005691] border border-gray-300 rounded-md font-bold transition"
                                title="이 교시의 분반 이름을 고칩니다"
                              >
                                이름
                              </button>
                            )}
                          </div>
                        )}

                        {/* 8. 학생 배치: 좌석을 넘긴 고사실을 교시 칸에서 바로 알아봅니다.
                            분반을 쪼개지 않으므로 초과가 생길 수 있고, 담당자가 손으로 옮깁니다. */}
                        {stepMode !== 7 && (() => {
                          const row = placement[ps.index] ?? {};
                          const sp = studentPlacements?.[ps.index];
                          if (!sp) return null;
                          const over = rooms.filter(r => {
                            const v = row[r.id];
                            if (!v || isWaitCell(v) || isForbiddenCell(v)) return false;
                            const used = students.filter(st => sp[`${st.ban}-${st.num}`] === r.id).length;
                            return used > capacityForSlot(r, ps.index, slotRoomCapacity, ps, v, slotCapacityBasis[ps.index]);
                          });
                          if (over.length === 0) return null;
                          return (
                            <div
                              className={`w-full font-black bg-orange-100 text-orange-900 border border-orange-300 rounded-lg flex items-center justify-center gap-1 ${
                                isCompactFit ? 'text-[11px] px-1.5 py-0.5 mt-1' : 'text-[12.5px] px-2 py-1 mt-1.5'
                              }`}
                              title={`좌석을 넘긴 고사실: ${over.map(r => r.roomName).join(', ')} — 칸을 더블클릭해 학생을 옮겨 주세요.`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>정원 초과 {over.length}실</span>
                            </div>
                          );
                        })()}

                        {/* 7. 고사장 배치는 고사장만 정합니다.
                            미배치는 학생을 실제로 앉혀 봐야 아는 것이라 8. 학생 배치에서만 다룹니다. */}
                        {stepMode !== 7 && sum.remaining.takers + sum.remaining.nonTakers > 0 && (
                          <button
                            onClick={() => handleOpenUnplacedModal(ps.index)}
                                className={`w-full font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-xs transition flex items-center justify-center gap-1 active:scale-95 ${
                                  isCompactFit ? 'text-[11px] px-1.5 py-0.5 mt-1' : 'text-[12.5px] px-2 py-1 mt-1.5'
                                }`}
                                title="이 교시에 아직 배정되지 않은 미배치 학생 명단을 확인하고 고사실에 배정합니다."
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                                <span>미배치 {sum.remaining.takers + sum.remaining.nonTakers}명</span>
                              </button>
                            )}
                      </td>
                      {stepMode !== 7 && (
                        <td className={`py-1 px-1 text-center bg-white text-slate-700 font-medium ${isCompactFit ? 'w-10 text-[14px]' : 'w-14 text-[16px]'}`}>계</td>
                      )}
                      <td className={`py-1 px-0.5 text-center font-medium text-[#005691] ${isCompactFit ? 'w-8 text-[14.5px]' : 'w-12 text-[17px]'}`}>{sum.total.ban}</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-gray-900 ${isCompactFit ? 'w-8 text-[14.5px]' : 'w-12 text-[17px]'}`}>{sum.total.takers + sum.total.nonTakers}</td>
                      <td className={`py-1 px-0.5 text-center font-bold ${stepMode === 7 ? 'text-[#005691]' : 'text-red-800'} ${isCompactFit ? 'w-8 text-[14.5px]' : 'w-12 text-[17px]'}`}>{sum.total.takers}</td>
                      <td className={`py-1 px-0.5 text-center font-bold ${stepMode === 7 ? 'text-slate-600' : 'text-amber-900'} ${isCompactFit ? 'w-8 text-[14.5px]' : 'w-12 text-[17px]'}`}>{sum.total.nonTakers}</td>

                      {rooms.map(r => {
                        const cellVal = placement[ps.index]?.[r.id] ?? '';
                        const isSelected = selectedCell?.slot === ps.index && selectedCell?.roomId === r.id;
                        const isWait = isWaitCell(cellVal);
                        const isForbidden = isForbiddenCell(cellVal);
                        const isUsable = r.roomName !== '' && r.roomName !== '0';
                        const subjectName = isWait || isForbidden ? '' : cellVal.split('-')[0] || '';
                        const color = colorForSubject(subjectName);
                        const isLocked = lockedCells[ps.index]?.[r.id] ?? false;

                        // Calculate actual count from studentPlacements if available
                        const slotPlacements = studentPlacements?.[ps.index];
                        const derivedCount = cellDerived(cellVal, entries).stuCount;
                        // 8. 학생 배치는 실제로 앉힌 학생만 셉니다.
                        // 편성현황에서 끌어온 어림수를 쓰면, 배치를 비워도 인원이 차 있는 것처럼 보입니다.
                        const actualCount: number = slotPlacements
                          ? students.filter(st => slotPlacements[`${st.ban}-${st.num}`] === r.id).length
                          : (stepMode === 7 && typeof derivedCount === 'number' ? derivedCount : 0);

                        // 이 교시에만 지정된 정원이 있으면 그 값을, 없으면 고사실 기본 정원을 씁니다.
                        const roomCap = capacityForSlot(r, ps.index, slotRoomCapacity, ps, cellVal, slotCapacityBasis[ps.index]);
                        const hasCapOverride = Boolean(slotRoomCapacity?.[ps.index]?.[r.id]);
                        // 전교생이 같은 시험을 보는 교시는 반 인원이 곧 정원입니다.
                        // 전원 응시 또는 전원 자습이면 각 반이 제 교실에 있으므로 반 인원이 정원입니다.
                        const isHomeRoomSlot = !isExtraRoom(r) && !!r.maxClassSize && roomCap === r.maxClassSize && roomCap !== r.capacity;
                        const isOverCapacity = isUsable && !isForbidden && actualCount > roomCap;

                        return (
                          <td
                            key={r.id}
                            rowSpan={stepMode === 7 ? 1 : 3}
                            onClick={() => isUsable && handleCellClick(ps.index, r.id)}
                            onDoubleClick={() => stepMode !== 7 && isUsable && !isForbidden && handleCellDoubleClick(ps.index, r.id)}
                            draggable={isUsable && !isStageLocked && !isLocked && !isForbidden}
                            onDragStart={(e) => {
                              if (isStageLocked || !isUsable || isLocked || isForbidden) { e.preventDefault(); return; }
                              e.dataTransfer.setData('application/json', JSON.stringify({ slot: ps.index, roomId: r.id }));
                            }}
                            onDragOver={(e) => {
                              if (isStageLocked || !isUsable || isLocked || isForbidden) return;
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (isStageLocked || !isUsable || isLocked || isForbidden) return;
                              try {
                                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                                const sourceIsLocked = lockedCells[data.slot]?.[data.roomId];
                                if (sourceIsLocked) return;
                                if (data.slot === ps.index && data.roomId !== r.id) {
                                  pushHistory();
                                  swapPlacementCells(ps.index, data.roomId, r.id);
                                }
                              } catch (err) {}
                            }}
                            className={`group relative ${isCompactFit ? 'py-1 px-1' : 'py-2 px-2'} align-middle text-center cursor-pointer transition divide-x divide-gray-200 ${
                              !isUsable ? 'bg-white cursor-not-allowed' :
                              isForbidden ? 'bg-rose-50/80 border-2 border-dashed border-rose-300' :
                              isSelected ? (
                                isOverCapacity
                                  ? 'bg-orange-200 ring-2 ring-orange-500 font-bold z-10'
                                  : 'bg-[#fee2e2]/90 ring-2 ring-emerald-600 ring-inset font-bold z-10'
                              ) :
                              isOverCapacity ? 'bg-orange-100 hover:bg-orange-200/90 border-2 border-orange-400 text-orange-950 shadow-xs' :
                              isLocked ? 'bg-gray-50 border-b border-gray-200' :
                              // 대기실은 무채색 + 왼쪽 회색 띠. 과목 팔레트가 모두 옅은 유채색이라
                              // 색을 '종류'부터 갈라야 시험 보는 반과 한눈에 구분됩니다.
                              isWait ? 'bg-white hover:bg-slate-50 border-b border-gray-200' :
                              cellVal ? `${color.bg} ${color.hoverBg} border-b border-gray-200` :
                              'bg-slate-50/70 hover:bg-slate-100'
                            }`}
                            data-accent={isWait ? 'wait' : cellVal && !isForbidden ? 'exam' : 'none'}
                            title={
                              isForbidden
                                ? '배치금지 설정된 고사실 (클릭하여 선택 또는 해제)'
                                : isOverCapacity
                                ? `[강제 배정 고사실] 정원(${roomCap}명) 초과: 현재 ${actualCount}명 배정 (+${actualCount - roomCap}명 초과). 더블클릭하여 학생 이동 가능.`
                                : '클릭: 선택 / 텍스트 클릭 또는 더블클릭: 배정 학생 명단 팝업 / 우측 상단 자물쇠: 균등분배 잠금'
                            }
                          >
                            {isUsable && cellVal && !isForbidden && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setLockedCell(ps.index, r.id, !isLocked);
                                }}
                                className={`absolute top-1 right-1 p-0.5 rounded transition-colors ${
                                  isLocked ? 'text-[#005691] hover:bg-[#cce3f0]' : 'text-gray-800 hover:text-[#0f172a] hover:bg-gray-50'
                                }`}
                              >
                                {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3 h-3 opacity-0 group-hover:opacity-100" />}
                              </button>
                            )}
                            {isForbidden ? (
                              <div
                                className="py-1 px-1 flex flex-col items-center justify-center text-center space-y-1 select-none"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleCellClick(ps.index, r.id);
                                }}
                              >
                                <div className="inline-flex items-center justify-center p-1.5 rounded-full bg-rose-100 text-rose-600 shadow-2xs">
                                  <Ban className="w-4 h-4" />
                                </div>
                                <div className={`font-black text-rose-700 leading-tight ${isCompactFit ? 'text-[11.5px]' : 'text-[14px]'}`}>
                                  배치금지
                                </div>
                                <div className="text-[10px] text-rose-500 font-semibold leading-none">
                                  (배제됨)
                                </div>
                                {stepMode === 7 && !isStageLocked && (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleToggleForbiddenCell(ps.index, r.id);
                                    }}
                                    className="mt-1 px-2 py-0.5 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded text-[10.5px] font-bold shadow-2xs transition active:scale-95"
                                    title="배치금지 해제"
                                  >
                                    해제
                                  </button>
                                )}
                              </div>
                            ) : cellVal ? (
                              <div
                                className={`relative space-y-0.5 transition-colors group ${isLocked ? 'opacity-70' : ''}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleCellClick(ps.index, r.id);
                                  // 7번에서 과목-분반 글자를 누르면 그 교시의 분반 이름을 고치는 창이 열립니다.
                                  if (stepMode === 7) {
                                    if (!isWait && !isForbidden && cellVal) setBanLabelModal(ps.index);
                                  } else {
                                    handleCellDoubleClick(ps.index, r.id);
                                  }
                                }}
                              >
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <div
                                    className={`font-black leading-tight whitespace-nowrap overflow-hidden ${
                                      isOverCapacity ? 'text-orange-950' : isWait ? 'text-slate-500' : `${color.text} hover:underline`
                                    } ${stepMode === 7 && !isWait && cellVal ? 'cursor-text' : ''}`}
                                    title={stepMode === 7 && !isWait && cellVal ? '눌러서 분반 이름을 고칩니다' : undefined}
                                    style={{ fontSize: `${cellLabelFontSize(isWait ? '대기' : banLabel(cellVal, ps.index, r.id), isCompactFit)}px` }}
                                  >
                                    {/* 대기실은 '대기'라고만 씁니다. 칸에 적힌 숫자는 지난번에 나눈 결과라
                                        지금 앉은 인원과 어긋납니다. 인원은 바로 아래 줄에 제대로 나옵니다. */}
                                    {isWait
                                      ? '대기'
                                      : banLabel(cellVal, ps.index, r.id)}
                                  </div>
                                  {isOverCapacity && stepMode !== 7 && (
                                    <span className="px-1.5 py-0.2 bg-orange-600 text-white text-[9.5px] rounded-sm font-black shadow-2xs tracking-tighter">
                                      강제배정
                                    </span>
                                  )}
                                </div>
                                {stepMode === 7 ? (
                                  /* 7. 고사장 배치는 정원만 다룹니다. 실제 배정 인원은 8. 학생 배치에서 봅니다. */
                                  <div
                                    className="flex items-center justify-center gap-0.5 mt-0.5"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      disabled={isStageLocked || isLocked}
                                      value={roomCap}
                                      onChange={e => {
                                        const v = Number(e.target.value);
                                        setSlotRoomCapacity(ps.index, r.id, v > 0 ? v : null);
                                      }}
                                      onBlur={() => rebalanceSlotAfterCapacityChange(ps)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                      }}
                                      className={`px-1 py-0.5 border rounded-md text-center font-black disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#005691] ${
                                        isCompactFit ? 'w-14 text-[14px]' : 'w-[4.5rem] text-[16.5px]'
                                      } ${
                                        hasCapOverride
                                          ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                          : 'border-gray-200 text-[#005691]'
                                      }`}
                                      title={
                                        isStageLocked
                                          ? "7. 고사장 배치가 확정되어 수정할 수 없습니다. 상단 '확정 취소'를 누르면 다시 고칠 수 있습니다."
                                          : isLocked
                                          ? '잠긴 고사실이라 수정할 수 없습니다. 칸 우측 상단 자물쇠를 풀어 주세요.'
                                          : hasCapOverride
                                          ? `이 교시에만 지정한 정원입니다 (고사실 기본 ${r.capacity}명)`
                                          : isHomeRoomSlot
                                          ? `${ps.takers === 0 ? '전교생이 자습하는 교시' : '전교생이 같은 시험을 보는 교시'}라 ${r.banName} 학생 수(${r.maxClassSize}명)가 정원입니다 — 고치면 이 교시에만 적용됩니다`
                                          : '고사실 기본 정원 — 고치면 이 교시에만 적용됩니다'
                                      }
                                    />
                                    <span className={`text-slate-500 font-bold ${isCompactFit ? 'text-[13px]' : 'text-[15px]'}`}>석</span>
                                    <span className={`text-slate-300 ${isCompactFit ? 'text-[13px]' : 'text-[15px]'}`}>|</span>
                                    <span
                                      className={`font-black whitespace-nowrap ${isCompactFit ? 'text-[12.5px]' : 'text-[14.5px]'} ${
                                        isOverCapacity ? 'text-rose-700' : 'text-slate-800'
                                      }`}
                                      title={`정원 ${roomCap}석에 ${actualCount}명 배치`}
                                    >
                                      {actualCount}명
                                    </span>
                                    {hasCapOverride && !isStageLocked && !isLocked && (
                                      <button
                                        onClick={() => {
                                          setSlotRoomCapacity(ps.index, r.id, null);
                                          setTimeout(() => rebalanceSlotAfterCapacityChange(ps), 0);
                                        }}
                                        className="text-slate-400 hover:text-rose-700 transition"
                                        title={`기본 정원(${r.capacity}명)으로 되돌리기`}
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                ) : isOverCapacity ? (
                                  <div
                                    className={`font-black text-white flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 rounded-md px-1.5 py-0.5 mt-0.5 shadow-xs transition ${
                                      isCompactFit ? 'text-[10.5px]' : 'text-[12px]'
                                    }`}
                                    title={`[강제 배정] 정원(${roomCap}명)을 ${actualCount - roomCap}명 초과하여 ${actualCount}명이 강제 배정되었습니다.`}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-100 shrink-0" />
                                    <span>{actualCount}명 (강제배정)</span>
                                  </div>
                                ) : (
                                  <div className={`font-black hover:underline ${isCompactFit ? 'text-[13.5px] text-slate-800' : 'text-[16px] text-[#0f172a]'}`}>
                                    {actualCount}명
                                  </div>
                                )}

                                {/* 고사실 구성은 7. 고사장 배치에서만 바꿉니다. */}
                                {stepMode === 7 && !isStageLocked && !isLocked && (
                                  isWait ? (
                                    <div className="mt-1.5 flex items-center justify-center gap-1">
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          openCapacityPrompt(ps.index, r.id, 'exam');
                                        }}
                                        className={`px-2 py-0.5 bg-rose-900 hover:bg-rose-950 text-white rounded-md font-bold inline-flex items-center justify-center gap-1 shadow-2xs transition active:scale-95 whitespace-nowrap ${
                                          isCompactFit ? 'text-[11.5px]' : 'text-[13px]'
                                        }`}
                                        title="이 대기실을 시험 고사장으로 변환"
                                      >
                                        <span>{isCompactFit ? '고사장' : '고사장 변환'}</span>
                                      </button>
                                      {/* 시험실 옆 교실을 비우고 싶을 때처럼, 이 교시에만 이 실을 빼는 버튼입니다. */}
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          handleToggleForbiddenCell(ps.index, r.id);
                                        }}
                                        className={`px-1.5 py-0.5 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 border border-gray-300 hover:border-rose-300 rounded-md font-bold inline-flex items-center justify-center shadow-2xs transition active:scale-95 whitespace-nowrap ${
                                          isCompactFit ? 'text-[11.5px]' : 'text-[13px]'
                                        }`}
                                        title="이 교시에는 이 고사실을 쓰지 않습니다 (대기 인원은 남은 실에 다시 나눕니다)"
                                      >
                                        <span>사용안함</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        openCapacityPrompt(ps.index, r.id, 'wait', subjectName);
                                      }}
                                      className={`mt-1.5 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-md font-bold inline-flex items-center justify-center gap-1 shadow-2xs transition active:scale-95 mx-auto whitespace-nowrap ${
                                        isCompactFit ? 'text-[11.5px]' : 'text-[13px]'
                                      }`}
                                      title="이 고사장을 대기실로 변환"
                                    >
                                      <span>대기실 변환</span>
                                    </button>
                                  )
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-1">
                                <span className="text-gray-400 text-[14px]">-</span>
                                {stepMode === 7 && !isStageLocked && !isLocked && (
                                  <div className="mt-0.5 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        openCapacityPrompt(ps.index, r.id, 'exam');
                                      }}
                                      className={`px-1.5 py-0.5 bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-700 border border-gray-200 hover:border-blue-300 rounded-md font-bold inline-flex items-center justify-center gap-0.5 shadow-2xs ${
                                        isCompactFit ? 'text-[9.5px]' : 'text-[11px]'
                                      }`}
                                      title="이 빈 고사실을 시험 고사장으로 변환"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                      <span>고사장 변환</span>
                                    </button>
                                    {/* 빈 실을 대기실로 열어 두고, 한두 명만 손으로 옮기는 쓰임새가 있습니다. */}
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        openCapacityPrompt(ps.index, r.id, 'wait');
                                      }}
                                      className={`px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 hover:border-amber-300 rounded-md font-bold inline-flex items-center justify-center gap-0.5 shadow-2xs ${
                                        isCompactFit ? 'text-[9.5px]' : 'text-[11px]'
                                      }`}
                                      title="이 빈 고사실을 빈 대기실로 엽니다 (인원은 직접 옮깁니다)"
                                    >
                                      <Clock className="w-2.5 h-2.5" />
                                      <span>대기실 변환</span>
                                    </button>
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleToggleForbiddenCell(ps.index, r.id);
                                      }}
                                      className={`px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-bold inline-flex items-center justify-center gap-0.5 shadow-2xs ${
                                        isCompactFit ? 'text-[9.5px]' : 'text-[11px]'
                                      }`}
                                      title="이 빈 고사실을 배치금지로 지정"
                                    >
                                      <Ban className="w-2.5 h-2.5 text-rose-600" />
                                      <span>배치금지</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* 배치 / 미배치 줄은 학생을 실제로 넣어본 결과라 8. 학생 배치에서만 보여줍니다. */}
                    {stepMode !== 7 && (
                    <>
                    <tr className="divide-x divide-gray-200 bg-white">
                      <td className={`py-1 px-1 text-center bg-white text-slate-700 font-medium ${isCompactFit ? 'text-[12.5px]' : 'text-[15px]'}`}>배치</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-slate-800 ${isCompactFit ? 'text-[12.5px]' : 'text-[16px]'}`}>{sum.placed.ban}</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-slate-800 ${isCompactFit ? 'text-[12.5px]' : 'text-[16px]'}`}>{sum.placed.takers + sum.placed.nonTakers}</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-red-800 ${isCompactFit ? 'text-[12.5px]' : 'text-[16px]'}`}>{sum.placed.takers}</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-amber-800 ${isCompactFit ? 'text-[12.5px]' : 'text-[16px]'}`}>{sum.placed.nonTakers}</td>
                    </tr>

                    <tr className={`divide-x divide-gray-200 border-b-2 border-gray-200 ${hasError ? 'bg-[#e6f1f8]/60' : 'bg-white'}`}>
                      <td
                        onClick={() => handleOpenUnplacedModal(ps.index)}
                        className={`py-1 px-1 text-center bg-white font-bold transition cursor-pointer ${
                          (sum.remaining.takers + sum.remaining.nonTakers) > 0
                            ? 'text-red-600 hover:bg-red-50 underline'
                            : 'text-slate-700'
                        } ${isCompactFit ? 'text-[12.5px]' : 'text-[15px]'}`}
                        title="클릭하여 미배치 학생 명단 확인 및 배정"
                      >
                        미배치
                      </td>
                      <td className={`py-1 px-0.5 text-center font-bold ${isCompactFit ? 'text-[12.5px]' : 'text-[16px]'} ${sum.remaining.ban !== 0 ? 'text-red-500 font-bold' : 'text-slate-800'}`}>{sum.remaining.ban}</td>
                      <td
                        onClick={() => (sum.remaining.takers + sum.remaining.nonTakers) > 0 && handleOpenUnplacedModal(ps.index)}
                        className={`py-1 px-0.5 text-center font-bold ${isCompactFit ? 'text-[12.5px]' : 'text-[16px]'} ${
                          (sum.remaining.takers + sum.remaining.nonTakers) !== 0 ? 'text-red-600 font-black cursor-pointer hover:bg-red-50' : 'text-slate-800'
                        }`}
                        title={(sum.remaining.takers + sum.remaining.nonTakers) > 0 ? "클릭하여 미배치 학생 명단 보기 및 배정" : undefined}
                      >
                        {(sum.remaining.takers + sum.remaining.nonTakers) > 0 ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-md font-black shadow-2xs">
                            {sum.remaining.takers + sum.remaining.nonTakers}명 📋
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                      <td
                        onClick={() => sum.remaining.takers > 0 && handleOpenUnplacedModal(ps.index)}
                        className={`py-1 px-0.5 text-center font-bold ${isCompactFit ? 'text-[12.5px]' : 'text-[16px]'} ${
                          sum.remaining.takers !== 0 ? 'text-red-600 font-black cursor-pointer hover:bg-red-50' : 'text-slate-800'
                        }`}
                        title={sum.remaining.takers > 0 ? "시험 응시 미배치 학생 명단 확인" : undefined}
                      >
                        {sum.remaining.takers > 0 ? (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-red-100 text-red-700 rounded font-bold">
                            {sum.remaining.takers}
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                      <td
                        onClick={() => sum.remaining.nonTakers > 0 && handleOpenUnplacedModal(ps.index)}
                        className={`py-1 px-0.5 text-center font-bold ${isCompactFit ? 'text-[12.5px]' : 'text-[16px]'} ${
                          sum.remaining.nonTakers !== 0 ? 'text-amber-700 font-black cursor-pointer hover:bg-amber-50' : 'text-slate-800'
                        }`}
                        title={sum.remaining.nonTakers > 0 ? "대기 미배치 학생 명단 확인" : undefined}
                      >
                        {sum.remaining.nonTakers > 0 ? (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">
                            {sum.remaining.nonTakers}
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                    </tr>
                    </>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 배치 패널(미배치 학생·대기 균등분배·학생 이동)은 학생 단위 작업이라 8. 학생 배치 전용입니다. */}
        {isPanelOpen && stepMode !== 7 && (
          <div className="w-80 flex flex-col border border-gray-200 rounded-2xl bg-white shadow-lg overflow-hidden shrink-0 transition-all">
            <div className="bg-white p-3.5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-[#005691]">배치 패널</h3>
                <div className="flex items-center gap-1.5">
                  {selectedCell && (
                    <button
                      onClick={() => handleCellDoubleClick(selectedCell.slot, selectedCell.roomId)}
                      className="px-2.5 py-1 bg-[#005691] hover:bg-[#005691] text-white rounded-lg text-[13px] font-bold flex items-center gap-1 shadow-xs transition"
                      title="선택한 교시/반의 배정 학생 명단 팝업 열기"
                    >
                      <Users className="w-3.5 h-3.5" /> 학생 명단
                    </button>
                  )}
                  <button
                    onClick={() => setIsPanelOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition text-[16px] font-bold"
                    title="배치 패널 닫기 (표를 전체 화면으로 봅니다)"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {curSlot && curRoom && (
                <div className="text-[14px] text-[#005691] font-bold mt-1.5">
                  {curSlot.title} : {curRoom.roomName} {curRoom.banName && curRoom.banName !== curRoom.roomName ? `(${curRoom.banName})` : ''}
                </div>
              )}
            </div>

          <div className="p-4 flex-1 flex flex-col overflow-hidden">
            {(() => {
              if (!curSlot) {
                return (
                  <div className="flex-1 flex items-center justify-center text-[15px] text-slate-500 p-6 text-center leading-relaxed">
                    표에서 칸을 하나 누르면 그 교시의 미배치 학생을 보여 줍니다.
                  </div>
                );
              }

              const unplaced = students.filter(st => {
                const rId = curSlotPlacements[`${st.ban}-${st.num}`];
                return !rId || rId === 'unplaced' || !curSlotRow[rId] || curSlotRow[rId] === '배치금지';
              }).sort((a, b) => (a.ban !== b.ban ? a.ban.localeCompare(b.ban, 'ko') : a.num - b.num));

              // 분반을 통째로 유지하다 보면 좌석을 넘길 수 있습니다. 확정 전에 여기서 정리합니다.
              const overCapacity = roomsAt(curSlot.index)
                .map(r => {
                  const cellValue = curSlotRow[r.id];
                  if (!cellValue || cellValue === '배치금지') return null;
                  const used = students.filter(st => curSlotPlacements[`${st.ban}-${st.num}`] === r.id).length;
                  const cap = capacityForSlot(r, curSlot.index, slotRoomCapacity, curSlot, cellValue, slotCapacityBasis[curSlot.index]);
                  return used > cap ? { room: r, used, cap } : null;
                })
                .filter((x): x is { room: ExamRoom; used: number; cap: number } => x !== null);

              const overBlock = overCapacity.length > 0 && (
                <div className="mb-3 border border-rose-200 rounded-xl overflow-hidden shrink-0">
                  <div className="px-3 py-1.5 bg-rose-50 text-[13.5px] font-black text-rose-800">
                    정원 초과 {overCapacity.length}곳 — 확정하려면 먼저 정리해야 합니다
                  </div>
                  <div className="divide-y divide-rose-100">
                    {overCapacity.map(({ room, used, cap }) => (
                      <button
                        key={room.id}
                        onClick={() => handleCellDoubleClick(curSlot.index, room.id)}
                        className="w-full px-3 py-1.5 text-[13.5px] flex items-center justify-between hover:bg-rose-50 transition text-left"
                        title="학생 명단을 열어 다른 고사실로 옮깁니다"
                      >
                        <span className="font-bold text-gray-900">{room.roomName}</span>
                        <span className="font-black text-rose-700">{used} / {cap}석 (+{used - cap})</span>
                      </button>
                    ))}
                  </div>
                </div>
              );

              if (unplaced.length === 0) {
                return (
                  <>
                    {overBlock}
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <p className="text-[15px] font-bold text-slate-700">미배치 학생이 없습니다.</p>
                      <p className="text-[13.5px] text-slate-500">{curSlot.title} 학생이 모두 자리를 받았습니다.</p>
                    </div>
                  </>
                );
              }

              return (
                <>
                  {overBlock}
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[14.5px] font-black text-rose-700">
                      {curSlot.title} 미배치 {unplaced.length}명
                    </span>
                    <button
                      onClick={() => handleOpenUnplacedModal(curSlot.index)}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[13px] font-bold transition"
                      title="미배치 학생을 고사실에 배정합니다"
                    >
                      배정하기
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {unplaced.map(st => {
                      const stKey = `${st.ban}-${st.num}`;
                      return (
                        <div key={stKey} className="px-2.5 py-1.5 text-[13.5px] flex items-center gap-1.5">
                          <span className="font-bold text-slate-700 w-12 shrink-0">{st.ban}</span>
                          <span className="text-slate-500 w-9 shrink-0">{st.num}번</span>
                          <span className="font-bold text-gray-900 truncate flex-1">{displayName(st.name)}</span>
                          <select
                            value=""
                            onChange={e => {
                              if (!e.target.value) return;
                              pushHistory(`[${curSlot.title}] ${displayName(st.name)} 배정`);
                              transferStudentsAndUpdatePlacement(curSlot.index, { [stKey]: e.target.value });
                            }}
                            className="px-1.5 py-1 border border-gray-300 rounded-lg text-[12.5px] font-bold text-[#005691] focus:outline-none focus:ring-2 focus:ring-[#005691]"
                            title="이 학생을 넣을 고사실을 고릅니다"
                          >
                            <option value="">배치…</option>
                            {roomsAt(curSlot.index)
                              .filter(r => r.roomName !== '' && r.roomName !== '0' && curSlotRow[r.id] !== '배치금지')
                              .map(r => {
                                const used = students.filter(x => curSlotPlacements[`${x.ban}-${x.num}`] === r.id).length;
                                const cap = capacityForSlot(r, curSlot.index, slotRoomCapacity, curSlot, curSlotRow[r.id], slotCapacityBasis[curSlot.index]);
                                return (
                                  <option key={r.id} value={r.id}>
                                    {r.roomName} ({used}/{cap}){used >= cap ? ' 초과' : ''}
                                  </option>
                                );
                              })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      </div>

      {/* Student List Modal with Multi-Selection, Individual Dropdowns, and Explicit Transfer/Close Buttons */}
      {studentListModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setStudentListModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col border border-gray-200 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white rounded-t-2xl gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-bold text-[#005691] flex items-center gap-2">
                  <Users className="w-5 h-5 text-red-500 shrink-0" />
                  <span>{studentListModal.title}</span>
                </h3>

                {/* 임시 정원 증가/감소 (+ -) 컨트롤 */}
                {(() => {
                  const curRoom = rooms.find(r => r.id === studentListModal.roomId);
                  if (!curRoom || studentListModal.roomId === 'unplaced') return null;
                  const cap = curRoom.capacity && curRoom.capacity > 0 ? curRoom.capacity : 28;
                  const count = studentListModal.students.length;
                  return (
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs">
                      <span className="text-[12px] font-bold text-slate-600">고사실 정원</span>
                      <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-1 py-0.5 shadow-2xs">
                        <button
                          type="button"
                          disabled={isStageLocked || cap <= 1}
                          onClick={() => {
                            if (cap > 1) {
                              pushHistory(`[${curRoom.roomName}] 정원 축소`);
                              updateRoom(curRoom.id, { capacity: cap - 1 });
                            }
                          }}
                          className="w-6 h-6 flex items-center justify-center font-black text-slate-700 hover:bg-slate-100 rounded text-sm transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="정원 1석 감소 (-1)"
                        >
                          -
                        </button>
                        <span className="w-9 text-center font-black text-[#005691] text-[13px] select-none">
                          {cap}석
                        </span>
                        <button
                          type="button"
                          disabled={isStageLocked}
                          onClick={() => {
                            pushHistory(`[${curRoom.roomName}] 정원 증가`);
                            updateRoom(curRoom.id, { capacity: cap + 1 });
                          }}
                          className="w-6 h-6 flex items-center justify-center font-black text-blue-600 hover:bg-blue-50 rounded text-sm transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="임시 정원 1석 증가 (+1)"
                        >
                          +
                        </button>
                      </div>
                      {count > cap ? (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-900 text-[11px] font-extrabold rounded-md flex items-center gap-1 border border-orange-200">
                          ⚠️ {count - cap}명 초과
                        </span>
                      ) : count === cap ? (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-md border border-emerald-200">
                          ✅ {count}/{cap}석
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-md border border-blue-200">
                          여유 {cap - count}석
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <button
                onClick={() => handleCommitTransfersAndClose(false)}
                className="text-[#0f172a] hover:text-gray-800 text-xl font-bold p-1 rounded-lg hover:bg-gray-50 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 이 고사실 전체를 다른 고사실로 통째로 옮깁니다 (분반을 쪼개지 않고 자리만 바꿀 때). */}
            {studentListModal.students.length > 0 && !isStageLocked && (
              <div className="px-5 py-2.5 bg-amber-50/70 border-b border-amber-200 flex items-center gap-2.5 text-[14.5px]">
                <span className="font-black text-amber-900 shrink-0">이 고사실 전체 이동</span>
                <span className="text-amber-800 shrink-0">{studentListModal.students.length}명</span>
                <select
                  value=""
                  onChange={e => {
                    const targetId = e.target.value;
                    if (!targetId) return;
                    const moves: Record<string, string> = {};
                    studentListModal.students.forEach(st => { moves[`${st.ban}-${st.num}`] = targetId; });
                    const targetName = rooms.find(r => r.id === targetId)?.roomName ?? '';
                    pushHistory(`[${placementSlots.find(s => s.index === studentListModal.slotIndex)?.title ?? ''}] 고사실 전체 이동 ➔ ${targetName}`);
                    transferStudentsAndUpdatePlacement(studentListModal.slotIndex, moves);
                    setStudentListModal(null);
                    setAlertModal({
                      isOpen: true,
                      message: `✅ ${studentListModal.students.length}명을 통째로 [${targetName}]로 옮겼습니다.`,
                    });
                  }}
                  className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-[14px] font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                  title="이 고사실의 학생 전원을 고른 고사실로 옮깁니다"
                >
                  <option value="">-- 옮길 고사실 선택 --</option>
                  {roomsAt(studentListModal.slotIndex)
                    .filter(r => r.id !== studentListModal.roomId && r.roomName !== '' && r.roomName !== '0')
                    .map(r => {
                      const row = placement[studentListModal.slotIndex] ?? {};
                      const sp = studentPlacements?.[studentListModal.slotIndex] ?? {};
                      const used = students.filter(x => sp[`${x.ban}-${x.num}`] === r.id).length;
                      const cap = capacityForSlot(r, studentListModal.slotIndex, slotRoomCapacity,
                        placementSlots.find(s => s.index === studentListModal.slotIndex), row[r.id],
                        slotCapacityBasis[studentListModal.slotIndex]);
                      return (
                        <option key={r.id} value={r.id}>
                          {r.roomName} ({used}/{cap}석){used === 0 ? ' · 비어있음' : ''}
                        </option>
                      );
                    })}
                </select>
              </div>
            )}

            {/* Batch Action Toolbar */}
            {studentListModal.students.length > 0 && (
              <div className="px-5 py-2.5 bg-[#e6f1f8]/70 border-b border-gray-200/80 flex items-center justify-between gap-3 text-[14.5px]">
                <label className="flex items-center gap-2 font-bold text-[#005691] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedStudentKeys.length === studentListModal.students.length && studentListModal.students.length > 0}
                    onChange={e => handleSelectAllStudents(e.target.checked)}
                    className="w-4 h-4 rounded text-red-500 focus:ring-[#00A651] cursor-pointer"
                  />
                  <span>전체 선택 ({selectedStudentKeys.length}/{studentListModal.students.length})</span>
                </label>
                <div className="flex items-center gap-2">
                  <select
                    disabled={isStageLocked}
                    value={batchTargetRoomId}
                    onChange={e => {
                      const targetId = e.target.value;
                      setBatchTargetRoomId(targetId);
                      if (targetId && selectedStudentKeys.length > 0) {
                        setRowTargetRoomIds(prev => {
                          const next = { ...prev };
                          selectedStudentKeys.forEach(k => {
                            next[k] = targetId;
                          });
                          return next;
                        });
                      }
                    }}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[14px] font-bold text-[#0f172a] focus:ring-2 focus:ring-[#00A651] focus:outline-none cursor-pointer"
                  >
                    <option value="">-- 일괄 이동할 고사실 선택 --</option>
                    {rooms.filter(r => r.roomName !== '' && r.roomName !== '0').map(r => {
                      const isTargetLocked = lockedCells[studentListModal.slotIndex]?.[r.id];
                      return (
                        <option key={r.id} value={r.id} disabled={isTargetLocked}>
                          {r.roomName} {r.banName && r.banName !== r.roomName ? `(${r.banName})` : ''} {isTargetLocked ? '(🔒 잠김)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    disabled={isStageLocked || selectedStudentKeys.length === 0}
                    onClick={handleMoveSelectedToWait}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold text-[14px] shadow-2xs transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 flex items-center gap-1 cursor-pointer"
                    title="선택된 학생들의 이동 대상을 대기실로 지정합니다"
                  >
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>대기로 이동</span>
                  </button>
                </div>
              </div>
            )}

            {/* Student Table */}
            <div className="flex-1 overflow-auto p-4.5">
              {studentListModal.students.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <div className="text-[17px] text-[#0f172a]">해당 고사실/대기반에 배정된 학생이 없습니다.</div>
                  {(() => {
                    const slotUnplaced = students.filter(st => {
                      const rId = (studentPlacements?.[studentListModal.slotIndex] || {})[`${st.ban}-${st.num}`];
                      const row = placement[studentListModal.slotIndex] || {};
                      return !rId || rId === 'unplaced' || !row[rId] || row[rId] === '배치금지';
                    });
                    if (slotUnplaced.length > 0 && studentListModal.roomId !== 'unplaced') {
                      return (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl max-w-md mx-auto">
                          <p className="text-[13.5px] text-red-900 font-bold mb-2">
                            💡 현재 교시에 아직 배정되지 않은 미배치 학생이 {slotUnplaced.length}명 있습니다.
                          </p>
                          <button
                            onClick={() => handleOpenUnplacedModal(studentListModal.slotIndex)}
                            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-[13px] shadow-xs transition cursor-pointer"
                          >
                            미배치 학생 {slotUnplaced.length}명 명단 확인 및 배정
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              ) : (
                <table className="w-full text-[16px] border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200 text-gray-800">
                      <th className="py-2.5 px-2 text-center w-10">
                        <input
                          type="checkbox"
                          checked={selectedStudentKeys.length === studentListModal.students.length && studentListModal.students.length > 0}
                          onChange={e => handleSelectAllStudents(e.target.checked)}
                          className="w-4 h-4 rounded text-red-500 focus:ring-[#00A651] cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-2 text-center w-12 font-bold" title="틱·장애 등으로 별도 고사실에서 따로 보는 학생">별도</th>
                      <th className="py-2.5 px-2 text-center w-10 font-bold">#</th>
                      <th className="py-2.5 px-2 text-center font-bold w-14">반</th>
                      <th className="py-2.5 px-2 text-center font-bold w-14">번호</th>
                      <th className="py-2.5 px-3 text-left font-bold w-24">이름</th>
                      <th className="py-2.5 px-3 text-center font-bold w-40">구분 / 수강상태</th>
                      <th className="py-2.5 px-3 text-center font-bold">배정 대상 고사실</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentListModal.students.map((st, idx) => {
                      const stKey = `${st.ban}-${st.num}`;
                      const isSelected = selectedStudentKeys.includes(stKey);
                      const currentTarget = rowTargetRoomIds[stKey] || studentListModal.roomId;

                      const ps = placementSlots.find(s => s.index === studentListModal.slotIndex);
                      const slotSubjects = ps?.subjects || [];
                      const taking = st.subjects.filter(s => slotSubjects.includes(s));

                      return (
                        <tr
                          key={stKey}
                          className={`border-b border-gray-200 transition ${
                            isSelected ? 'bg-[#e6f1f8]/60 font-normal' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                          }`}
                        >
                          <td className="py-2 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectStudentToggle(stKey)}
                              className="w-4 h-4 rounded text-red-500 focus:ring-[#00A651] cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            {taking.length > 0 ? (
                              <input
                                type="checkbox"
                                disabled={isStageLocked}
                                checked={Boolean(separateRoomFor(stKey, studentListModal.slotIndex, separateExaminers))}
                                onChange={() => handleToggleSeparate(st, stKey)}
                                className="w-4 h-4 rounded cursor-pointer accent-[#005691]"
                                title="별도 고사실에서 따로 보는 학생으로 표시합니다"
                              />
                            ) : (
                              <span className="text-slate-300 text-[12px]">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center text-[#0f172a] font-normal text-[13px]">{idx + 1}</td>
                          <td className="py-2 px-2 text-center font-bold text-[#005691]">
                            {st.ban.endsWith('반') ? st.ban : `${st.ban}반`}
                          </td>
                          <td className="py-2 px-2 text-center font-normal text-gray-800">{st.num}번</td>
                          <td className="py-2 px-3 font-bold text-gray-900">{st.name ? displayName(st.name) : '-'}</td>
                          <td className="py-2 px-3 text-center">
                            {taking.length > 0 ? (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[11.5px] font-bold rounded-md whitespace-nowrap">
                                🔴 응시: {taking.join(', ')}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[11.5px] font-bold rounded-md whitespace-nowrap">
                                🟡 대기 (미응시)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <select
                              disabled={isStageLocked}
                              value={currentTarget}
                              onChange={e => {
                                const newTarget = e.target.value;
                                setRowTargetRoomIds(prev => ({ ...prev, [stKey]: newTarget }));
                              }}
                              className={`w-full px-2 py-1.5 rounded-lg text-[13px] font-bold border focus:ring-2 focus:ring-[#00A651] focus:outline-none cursor-pointer ${
                                currentTarget !== studentListModal.roomId && currentTarget !== 'unplaced'
                                  ? 'bg-blue-50 border-blue-500 text-blue-950 font-bold'
                                  : currentTarget === 'unplaced'
                                  ? 'bg-red-50 border-red-300 text-red-700'
                                  : 'bg-white border-gray-200 text-[#0f172a]'
                              }`}
                            >
                              {studentListModal.roomId === 'unplaced' && (
                                <option value="unplaced">-- 미배치 (배정 대상 선택) --</option>
                              )}
                              {rooms.filter(r => r.roomName !== '' && r.roomName !== '0').map(r => {
                                const isTargetLocked = lockedCells[studentListModal.slotIndex]?.[r.id];
                                const targetCell = (placement[studentListModal.slotIndex] || {})[r.id];
                                const isForbidden = targetCell === '배치금지';
                                const studentTakesTargetSubject = targetCell && !isWaitCell(targetCell) && st.subjects.includes(targetCell.split('-')[0]);

                                return (
                                  <option key={r.id} value={r.id} disabled={isTargetLocked || isForbidden}>
                                    {studentTakesTargetSubject ? '⭐ [추천:시험] ' : ''}
                                    {r.roomName} {r.banName && r.banName !== r.roomName ? `(${r.banName})` : ''}
                                    {targetCell ? ` - ${targetCell}` : ' (비어있음)'}
                                    {isTargetLocked ? ' (🔒 잠김)' : ''}
                                    {isForbidden ? ' (🚫 배치금지)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer Action Bar */}
            <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-white rounded-b-2xl">
              <div className="text-[14.5px] text-gray-800 font-bold flex items-center gap-2.5">
                <span>총 <strong className="text-[#005691]">{studentListModal.students.length}</strong>명</span>
                {selectedStudentKeys.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-[#fee2e2] text-[#005691] rounded-full font-extrabold text-[12.5px]">
                    {selectedStudentKeys.length}명 선택됨
                  </span>
                )}
                {(() => {
                  const changedCount = Object.entries(rowTargetRoomIds).filter(
                    ([, targetId]) => targetId && targetId !== studentListModal.roomId
                  ).length;
                  if (changedCount > 0) {
                    return (
                      <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 rounded-full font-extrabold text-[12.5px] border border-blue-200">
                        이동 예정: {changedCount}명
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="flex items-center gap-3">
                <button
                  disabled={isStageLocked}
                  onClick={() => {
                    if (batchTargetRoomId && selectedStudentKeys.length > 0) {
                      selectedStudentKeys.forEach(k => {
                        rowTargetRoomIds[k] = batchTargetRoomId;
                      });
                    }
                    handleCommitTransfersAndClose(true);
                  }}
                  className="px-5 py-2.5 bg-[#005691] hover:bg-[#004270] text-white rounded-xl text-[15px] font-bold shadow-md transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  🚀 이동 적용 및 닫기
                </button>
                <button
                  onClick={() => handleCommitTransfersAndClose(false)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[15px] font-bold transition cursor-pointer"
                >
                  닫기
                </button>
              </div>
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

      {/* 배치 규칙 설명 */}
      {algorithmHelpOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setAlgorithmHelpOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#005691] text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-black text-[17px]">
                <HelpCircle className="w-5 h-5" />
                <span>{stepMode === 7 ? '7. 고사장 배치 규칙' : '8. 학생 배치 규칙'}</span>
              </div>
              <button onClick={() => setAlgorithmHelpOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition" aria-label="닫기">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-auto text-[15px] leading-relaxed text-slate-800 space-y-5">
              {stepMode === 7 ? (
                <>
                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">고사실 정원이 정해지는 순서</h3>
                    <ol className="list-decimal ml-5 space-y-1">
                      <li><strong>그 교시에만 지정한 정원</strong>이 있으면 그 값을 씁니다. 칸의 숫자를 고치면 그 교시에만 적용되고, 초록색으로 표시됩니다.</li>
                      <li>없으면, <strong>전교생이 같은 상황인 교시</strong>(전원 응시이거나 전원 자습)는 <strong>그 반의 학생 수</strong>가 정원입니다. 학생이 자기 반 교실에 그대로 앉기 때문입니다.</li>
                      <li>그 밖에는 <strong>고사실 기본 정원</strong>을 씁니다. 기본 정원은 <em>2. 기초정보</em>에서 고사실마다 정합니다.</li>
                    </ol>
                  </section>

                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">대기실을 고사장으로 바꿀 때</h3>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>남은 실만으로 대기 인원이 <strong>수용되면 실을 늘리지 않습니다.</strong></li>
                      <li>모자랄 때만 <strong>모자란 만큼</strong> 별도실을 더 쓰고, 정원에 맞춰 균등하게 나눕니다.</li>
                      <li>일반 교실을 먼저 채우고, 별도실은 마지막에 최소한으로 씁니다.</li>
                    </ul>
                  </section>

                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">고사실을 쓰지 않을 때 (사용안함)</h3>
                    <p>시험실 옆 교실을 비우고 싶을 때처럼 대기실 하나를 빼면, 그 방 학생이 미배치로 남지 않도록 <strong>곧바로 남은 실에 다시 나눕니다.</strong> 위와 같은 규칙을 따릅니다.</p>
                  </section>

                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">정원을 고치면</h3>
                    <p>숫자를 고치고 <strong>칸 밖을 클릭하거나 Enter</strong>를 누르면 그 교시가 새 정원 기준으로 다시 나뉩니다. 여기서는 고사장과 정원만 정합니다. 학생을 실제로 앉히는 것은 <strong>8. 학생 배치</strong>의 일입니다.</p>
                  </section>

                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">시험이 없는 교시</h3>
                    <p>시험이 있는 날은 1교시부터 그날 마지막 시험 교시까지 모두 표에 나옵니다. 과목이 없는 교시는 <strong>전교생이 자기 반 교실에서 자습</strong>합니다.</p>
                  </section>
                </>
              ) : (
                <>
                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">응시자를 고사장에 넣는 방법</h3>
                    <p className="mb-1">교시마다 둘 중 하나를 자동으로 고릅니다.</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li><strong>분반 수 = 시험실 수 ➔ 분반 위주</strong><br />NEIS 분반을 그대로 씁니다. 같은 분반 학생이 같은 고사장에 모입니다.</li>
                      <li><strong>분반 수 ≠ 시험실 수 ➔ 학번순</strong><br />학번 순서를 유지한 채 <strong>인원만 균등하게</strong> 나눕니다. 예를 들어 91명을 4실에 넣으면 23·23·23·22명이 됩니다. 앞쪽 고사장부터 정원까지 채우지 않습니다.</li>
                    </ul>
                  </section>

                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">자리가 모자라면</h3>
                    <p>응시자가 고사장 정원 총합보다 많으면 <strong>빈 방이나 대기실을 고사장으로 더 씁니다.</strong> 그러지 않으면 자리를 못 얻은 응시자가 미배치로 남습니다.</p>
                  </section>

                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">대기 학생을 넣는 방법</h3>
                    <ol className="list-decimal ml-5 space-y-1">
                      <li><strong>자기 반 교실 먼저.</strong> 대기 학생은 되도록 자기 반에 남깁니다. 상단의 <em>원반 대기 보장률</em>이 이 비율입니다.</li>
                      <li>남은 인원은 다른 대기실에 <strong>균등하게</strong> 나눕니다. 일반 교실을 먼저 채우고 별도실은 최소한으로 씁니다.</li>
                      <li>정원은 절대 넘기지 않습니다. 끝내 자리가 없으면 <strong>미배치</strong>로 남겨 표에 드러냅니다.</li>
                    </ol>
                  </section>

                  <section className="space-y-1.5">
                    <h3 className="font-black text-[#005691] text-[16px]">손으로 고치기</h3>
                    <ul className="list-disc ml-5 space-y-1">
                      <li><strong>칸을 더블클릭</strong>하면 그 고사실의 학생 명단이 열립니다. 학생을 골라 다른 고사실로 옮길 수 있습니다.</li>
                      <li><strong>칸을 끌어다 놓으면</strong> 같은 교시 안에서 두 고사실의 배치가 서로 바뀝니다.</li>
                      <li>칸 오른쪽 위 <strong>자물쇠</strong>를 잠그면 자동배치가 그 칸을 건드리지 않습니다.</li>
                      <li>고사실 구성과 정원은 <em>7. 고사장 배치</em>에서 정합니다.</li>
                    </ul>
                  </section>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end shrink-0">
              <button onClick={() => setAlgorithmHelpOpen(false)} className="px-5 py-2 bg-[#005691] hover:bg-blue-800 text-white rounded-xl font-bold transition">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 분반 이름 지정 */}
      {/* 늘 따로 보는 학생인지, 이 시험만 따로 보는 학생인지 물어봅니다. */}
      {separateAsk && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setSeparateAsk(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#005691] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-black text-[17px]">별도 고사실 응시</div>
                <div className="text-[13px] text-blue-100 font-medium mt-0.5">{separateAsk.label}</div>
              </div>
              <button onClick={() => setSeparateAsk(null)} className="p-1 hover:bg-white/20 rounded-lg transition" aria-label="닫기">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {separateRoomCount > 1 && (
                <div>
                  <label className="block font-bold text-slate-700 text-[14px] mb-2">어느 별도 고사실인가요?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: separateRoomCount }, (_, i) => i + 1).map(n => (
                      <button
                        key={n}
                        onClick={() => setSeparateAsk({ ...separateAsk, room: n })}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[14px] border transition ${
                          separateAsk.room === n
                            ? 'bg-[#005691] text-white border-[#005691]'
                            : 'bg-white text-slate-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {n}실
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="font-bold text-slate-700 text-[14px] mb-2">어느 시험에 적용할까요?</p>
                <div className="space-y-2">
                  <button
                    onClick={() => applySeparate('all')}
                    className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#005691] hover:bg-blue-50/50 transition"
                  >
                    <div className="font-black text-[15px] text-slate-800">모든 시험</div>
                    <div className="text-[13px] text-slate-500 mt-0.5">늘 별도 고사실에서 봅니다.</div>
                  </button>
                  <button
                    onClick={() => applySeparate('slot')}
                    className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#005691] hover:bg-blue-50/50 transition"
                  >
                    <div className="font-black text-[15px] text-slate-800">{separateAsk.slotTitle}만</div>
                    <div className="text-[13px] text-slate-500 mt-0.5">이 시험만 따로 봅니다 (추가 시간이 필요한 경우 등).</div>
                  </button>
                </div>
              </div>

              <p className="text-[13px] text-slate-500 leading-relaxed border-t border-gray-100 pt-3">
                별도 응시자는 <strong>원래 고사실 명단에 그대로 남고</strong>, 비고에 '별도고사실 응시중'으로 적힙니다.
                좌석배치도에서는 빠집니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 고사장·대기실로 바꾸기 전에 정원부터 묻습니다. */}
      {capacityPrompt && (() => {
        const ps = placementSlots.find(s2 => s2.index === capacityPrompt.slotIndex);
        const room = rooms.find(r => r.id === capacityPrompt.roomId);
        const isExam = capacityPrompt.kind === 'exam';
        const isNewWait = !isExam && !placement[capacityPrompt.slotIndex]?.[capacityPrompt.roomId];
        const titleText = isExam ? '고사장 변환' : isNewWait ? '대기실 열기' : '대기실 변환';

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setCapacityPrompt(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-[#005691] text-white px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="font-black text-[17px]">{titleText}</div>
                  <div className="text-[13px] text-blue-100 font-medium mt-0.5">
                    {ps?.title ?? ''} · {room?.roomName ?? ''}
                  </div>
                </div>
                <button onClick={() => setCapacityPrompt(null)} className="p-1 hover:bg-white/20 rounded-lg transition" aria-label="닫기">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5">
                <label className="block font-bold text-slate-700 text-[14px] mb-2">
                  이 교시에 이 실을 몇 명까지 쓸까요?
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    autoFocus
                    value={capacityPrompt.value}
                    onChange={e => setCapacityPrompt({ ...capacityPrompt, value: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmCapacityPrompt();
                      if (e.key === 'Escape') setCapacityPrompt(null);
                    }}
                    className="w-28 px-3 py-2 border-2 border-gray-300 focus:border-[#005691] rounded-lg text-[18px] font-black text-center outline-hidden"
                  />
                  <span className="font-bold text-slate-600 text-[15px]">석</span>
                </div>
                <p className="text-[13px] text-slate-500 mt-3 leading-relaxed">
                  {isNewWait
                    ? '빈 대기실로 엽니다. 인원은 0명이니, 8. 학생 배치에서 필요한 학생만 옮겨 주세요.'
                    : '이 교시, 이 실에만 적용되는 정원입니다. 다른 교시는 그대로입니다.'}
                </p>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
                <button
                  onClick={() => setCapacityPrompt(null)}
                  className="px-4 py-2 bg-white hover:bg-gray-100 text-slate-700 border border-gray-300 rounded-lg font-bold text-[14px] transition"
                >
                  취소
                </button>
                <button
                  onClick={confirmCapacityPrompt}
                  className="px-4 py-2 bg-[#005691] hover:bg-[#00426e] text-white rounded-lg font-bold text-[14px] transition"
                >
                  {titleText}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {banLabelModal !== null && (() => {
        const ps = placementSlots.find(s => s.index === banLabelModal);
        if (!ps) return null;
        const examRooms = rooms.filter(r => {
          const v = placement[banLabelModal]?.[r.id];
          return v && !isWaitCell(v) && !isForbiddenCell(v);
        });
        const style = banStyleOf(banLabelModal);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setBanLabelModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-[#005691] text-white px-5 py-4 flex items-center justify-between shrink-0">
                <div>
                  <div className="font-black text-[17px]">{ps.title} — 분반 이름</div>
                  <div className="text-[13px] text-blue-100 font-medium mt-0.5">
                    {ps.subjects.length ? ps.subjects.join(', ') : '시험 없음'}
                  </div>
                </div>
                <button onClick={() => setBanLabelModal(null)} className="p-1 hover:bg-white/20 rounded-lg transition" aria-label="닫기">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-4 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-700 text-[14px]">표기 방식</span>
                  {(['neis', 'ko', 'en', 'none'] as BanLabelStyle[]).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setSlotBanLabelStyle(banLabelModal, opt)}
                      disabled={isStageLocked}
                      className={`px-3 py-1.5 rounded-lg text-[14px] font-bold border transition disabled:opacity-50 ${
                        style === opt
                          ? 'bg-[#005691] text-white border-[#005691]'
                          : 'bg-white text-slate-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt === 'neis' ? '편성현황 그대로' : opt === 'ko' ? '가 나 다' : opt === 'en' ? 'A B C' : '표시 안 함'}
                    </button>
                  ))}
                  <button
                    onClick={() => setSlotBanLabelStyle(banLabelModal, null)}
                    disabled={isStageLocked}
                    className="px-3 py-1.5 rounded-lg text-[13.5px] font-bold text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition disabled:opacity-50"
                    title="이 교시만의 지정을 지우고 설정의 기본 방식을 따릅니다"
                  >
                    기본값 따르기
                  </button>
                </div>
                <p className="text-[13px] text-slate-500 mt-2">
                  아래 칸에 글자를 직접 적으면 그 고사실만 그 이름으로 나옵니다. 비우면 위 방식대로 자동으로 붙습니다.
                </p>
              </div>

              <div className="p-6 overflow-auto">
                {examRooms.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">이 교시에는 시험을 치르는 고사실이 없습니다.</p>
                ) : (
                  <table className="w-full text-[14px] border-collapse">
                    <thead className="bg-gray-50 text-slate-700 font-black">
                      <tr className="divide-x divide-gray-200 border-b border-gray-200">
                        <th className="py-2 px-3 text-left">고사실</th>
                        <th className="py-2 px-3 text-left">과목</th>
                        <th className="py-2 px-3 text-left">편성현황 분반</th>
                        <th className="py-2 px-3 w-40 text-center">분반 이름</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {examRooms.map(r => {
                        const cellVal = placement[banLabelModal]?.[r.id] ?? '';
                        const hyphen = cellVal.lastIndexOf('-');
                        const subject = hyphen === -1 ? cellVal : cellVal.slice(0, hyphen);
                        const autoLabel = banLabel(cellVal, banLabelModal, r.id).split('-').pop() || '';
                        const manual = slotBanLabels[banLabelModal]?.[r.id] ?? '';
                        return (
                          <tr key={r.id} className="divide-x divide-gray-200">
                            <td className="py-2 px-3 font-bold text-gray-900">
                              {r.roomName}
                              {r.banName && <span className="ml-1 text-slate-500 font-normal">({r.banName})</span>}
                            </td>
                            <td className="py-2 px-3 text-slate-700">{subject}</td>
                            <td className="py-2 px-3 text-slate-500">{entries.get(cellVal)?.room || '-'}</td>
                            <td className="py-1.5 px-2 text-center">
                              <input
                                type="text"
                                maxLength={6}
                                disabled={isStageLocked}
                                value={manual}
                                placeholder={autoLabel}
                                onChange={e => setSlotBanLabel(banLabelModal, r.id, e.target.value)}
                                className={`w-28 px-2 py-1 border rounded-lg text-center font-black text-[14px] focus:outline-none focus:ring-2 focus:ring-[#005691] disabled:bg-gray-100 disabled:text-gray-400 ${
                                  manual ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-[#005691]'
                                }`}
                                title={manual ? '직접 지정한 이름입니다. 비우면 자동 표기로 돌아갑니다.' : `자동 표기: ${autoLabel}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
                <button
                  onClick={() => examRooms.forEach(r => setSlotBanLabel(banLabelModal, r.id, null))}
                  disabled={isStageLocked}
                  className="px-4 py-2 bg-white hover:bg-gray-50 text-slate-700 border border-gray-300 rounded-xl font-bold transition disabled:opacity-50"
                >
                  직접 지정 모두 지우기
                </button>
                <button onClick={() => setBanLabelModal(null)} className="px-5 py-2 bg-[#005691] hover:bg-blue-800 text-white rounded-xl font-bold transition">
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {timetablePreviewOpen && <TimetablePreviewModal onClose={() => setTimetablePreviewOpen(false)} />}

      {alertModal && (
        <AlertModal
          isOpen={alertModal.isOpen}
          message={alertModal.message}
          isError={alertModal.isError}
          onClose={() => setAlertModal(null)}
        />
      )}


      {/* Subject Select Modal for Add/Shrink Room */}
      {subjectSelectModal && subjectSelectModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={() => setSubjectSelectModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <div className={`text-white px-5 py-4 flex items-center justify-between ${subjectSelectModal.action === 'add' ? 'bg-[#005691]' : 'bg-amber-700'}`}>
              <div className="flex items-center gap-2">
                {subjectSelectModal.action === 'add' ? <Plus className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
                <h3 className="font-bold text-lg">
                  {subjectSelectModal.action === 'add' ? '고사장 추가 대상 과목 선택' : '축소할 고사장 과목 선택'}
                </h3>
              </div>
              <button
                onClick={() => setSubjectSelectModal(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <p className="text-gray-700 leading-relaxed font-semibold">
                {subjectSelectModal.action === 'add'
                  ? '대기실을 시험 고사장으로 전환할 과목을 선택해주세요. 추가된 고사장은 인원이 0명으로 비워져 수동 배치가 가능해집니다.'
                  : '축소할 과목을 선택해주세요. 해당 과목의 고사장이 축소되어 학생은 직전 고사장으로 합쳐지고, 방은 대기실로 전환됩니다.'}
              </p>

              <div className="space-y-2">
                {subjectSelectModal.subjects.map((sub) => {
                  const color = colorForSubject(sub);
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => {
                        const { slotIndex, action, targetRoomId } = subjectSelectModal;
                        setSubjectSelectModal(null);
                        if (action === 'add') {
                          handleAddExamRoomFromWait(slotIndex, sub, targetRoomId);
                        } else {
                          handleShrinkExamRoomToWait(slotIndex, sub, targetRoomId);
                        }
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border transition flex items-center justify-between font-bold ${color.bg} ${color.hoverBg} ${color.border} ${color.text} shadow-xs hover:shadow-md`}
                    >
                      <span className="text-base">{sub}</span>
                      <span className="text-xs px-2 py-0.5 bg-white/80 rounded-md border border-gray-300 text-gray-700">
                        {subjectSelectModal.action === 'add' ? '고사장 추가' : '고사장 축소'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSubjectSelectModal(null)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition shadow-2xs"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wait Students Placement Modal (별도실 대신 각반에 배치할지, 어느반에 배치할지 질문) */}
      {waitPlacementModal && waitPlacementModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onClick={() => setWaitPlacementModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <div className="bg-[#005691] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-200" />
                <h3 className="font-bold text-lg">
                  대기 학생 배치 방법 선택
                </h3>
              </div>
              <button
                onClick={() => setWaitPlacementModal(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm max-h-[75vh] overflow-y-auto">
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1">
                <div className="font-bold text-[#005691] text-base">
                  [{rooms.find(r => r.id === waitPlacementModal.targetRoomId)?.roomName || '선택한 고사실'}] ➔ [{waitPlacementModal.selectedSubject}] 시험 고사장 변환
                </div>
                <div className="text-gray-600 text-xs">
                  • 인원 무결성 검증을 통해 전체 학생 수가 정확하게 보존됩니다.<br />
                  • 남은 대기 학생: <strong className="text-amber-700 text-sm">{waitPlacementModal.waitStudentsCount}명</strong>
                </div>
              </div>

              {/* 1. 고사장 대상 과목 선택 (해당 교시 과목이 2개 이상일 때 필수로 선택) */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>변환할 시험 과목 선택</span>
                  </div>
                  {waitPlacementModal.subjects.length > 1 ? (
                    <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold">
                      과목 {waitPlacementModal.subjects.length}개 중 선택
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
                      단일 과목
                    </span>
                  )}
                </div>
                {waitPlacementModal.subjects.length > 1 ? (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {waitPlacementModal.subjects.map(sub => {
                      const isSelected = waitPlacementModal.selectedSubject === sub;
                      const subColor = colorForSubject(sub);
                      return (
                        <button
                          type="button"
                          key={sub}
                          onClick={() => setWaitPlacementModal(prev => prev ? { ...prev, selectedSubject: sub } : null)}
                          className={`p-3 rounded-xl border-2 text-left flex items-center justify-between transition cursor-pointer ${
                            isSelected
                              ? 'border-[#005691] bg-blue-50/90 text-[#005691] shadow-xs ring-2 ring-blue-300'
                              : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="waitModalSubject"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 text-[#005691]"
                            />
                            <span className="font-extrabold text-sm">{sub}</span>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${subColor.bg} ${subColor.text}`}>
                            선택
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm font-bold text-gray-800 bg-white p-2.5 rounded-lg border border-gray-200 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{waitPlacementModal.selectedSubject}</span>
                  </div>
                )}
              </div>

              {/* 2. 해당 과목 응시생 배치 방법 (고사장 인원 분배) */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5">
                <div className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>[{waitPlacementModal.selectedSubject}] 응시생 배치 방법 선택</span>
                </div>

                {/* Option 2-1: 고사장 1실 추가하여 균등 분배 (추천) */}
                <label className={`block p-3 rounded-xl border-2 transition cursor-pointer ${
                  waitPlacementModal.examDistributionMode === 'even'
                    ? 'border-[#005691] bg-blue-50/80 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="examDistributionMode"
                      checked={waitPlacementModal.examDistributionMode === 'even'}
                      onChange={() => setWaitPlacementModal(prev => prev ? { ...prev, examDistributionMode: 'even' } : null)}
                      className="mt-1 w-4 h-4 text-[#005691]"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                        <span>🌟 고사장 1실 추가하여 균등 분배</span>
                        <span className="px-1.5 py-0.2 text-[11px] bg-emerald-100 text-emerald-800 rounded font-extrabold">추천</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                        해당 과목의 전체 응시생을 추가된 고사장 포함 모든 고사장에 고르게 균등 분배합니다. (0명 빈 고사장 방지)
                      </p>
                    </div>
                  </div>
                </label>

                {/* Option 2-2: 기존 고사장에 채우고 남는 인원은 미배치로 두기 */}
                <label className={`block p-3 rounded-xl border-2 transition cursor-pointer ${
                  waitPlacementModal.examDistributionMode === 'fill_unplaced'
                    ? 'border-[#005691] bg-blue-50/80 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="examDistributionMode"
                      checked={waitPlacementModal.examDistributionMode === 'fill_unplaced'}
                      onChange={() => setWaitPlacementModal(prev => prev ? { ...prev, examDistributionMode: 'fill_unplaced' } : null)}
                      className="mt-1 w-4 h-4 text-[#005691]"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 text-sm">
                        📦 기존 고사장에 채우고 남는 인원은 미배치로 두기
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                        기존 고사장에 학생들을 정원(28석)까지 채우고, 남는 초과 인원은 미배치로 둡니다. (새 고사장은 0명)
                      </p>
                    </div>
                  </div>
                </label>

                {/* Option 2-3: 새 고사장은 0명으로 비워두기 (수동 배치) */}
                <label className={`block p-3 rounded-xl border-2 transition cursor-pointer ${
                  waitPlacementModal.examDistributionMode === 'manual_empty'
                    ? 'border-[#005691] bg-blue-50/80 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="examDistributionMode"
                      checked={waitPlacementModal.examDistributionMode === 'manual_empty'}
                      onChange={() => setWaitPlacementModal(prev => prev ? { ...prev, examDistributionMode: 'manual_empty' } : null)}
                      className="mt-1 w-4 h-4 text-[#005691]"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 text-sm">
                        ✏️ 새 고사장은 0명으로 비워두기 (수동 배치)
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                        기존 고사장 학생 배치를 그대로 유지하고, 새 고사장은 0명으로 비워 수동으로 이동/배치합니다.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {/* 3. 남은 대기 학생 배치 방법 */}
              {(() => {
                const regularCandidateRooms = waitPlacementModal.candidateRooms.filter(r => !isExtraRoom(r) && !r.roomName.startsWith('별도'));
                const regularTotalCap = regularCandidateRooms.reduce((sum, r) => sum + (r.capacity && r.capacity > 0 ? r.capacity : 28), 0);
                const isWaitOverflow = waitPlacementModal.waitStudentsCount > regularTotalCap;

                const availableExtraRooms = waitPlacementModal.candidateRooms
                  .filter(r => isExtraRoom(r) || r.roomName.startsWith('별도'))
                  .sort((a, b) => a.roomName.localeCompare(b.roomName, 'ko', { numeric: true }));

                let overflowRem = waitPlacementModal.waitStudentsCount - regularTotalCap;
                const autoAddedExtraRooms: ExamRoom[] = [];
                if (isWaitOverflow) {
                  for (const er of availableExtraRooms) {
                    autoAddedExtraRooms.push(er);
                    const cap = er.capacity && er.capacity > 0 ? er.capacity : 28;
                    overflowRem -= cap;
                    if (overflowRem <= 0) break;
                  }
                }

                return (
                  <div className="space-y-3">
                    <div className="font-bold text-gray-900 text-sm">
                      남은 대기 학생 ({waitPlacementModal.waitStudentsCount}명)을 어디에 배치할까요?
                    </div>

                    {/* Option 1: 각 반(일반 학급)에 균등 분산 배치 */}
                    <label className={`block p-3.5 rounded-xl border-2 transition cursor-pointer ${
                      waitPlacementModal.mode === 'all_regular'
                        ? 'border-[#005691] bg-blue-50/40 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="waitPlacementMode"
                          checked={waitPlacementModal.mode === 'all_regular'}
                          onChange={() => setWaitPlacementModal(prev => prev ? { ...prev, mode: 'all_regular' } : null)}
                          className="mt-1 w-4 h-4 text-[#005691]"
                        />
                        <div className="flex-1">
                          <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5 flex-wrap">
                            <span>🏛️ 각 반(일반 학급)에 균등 분산 배치</span>
                            {isWaitOverflow ? (
                              <span className="px-1.5 py-0.2 text-[11px] bg-amber-100 text-amber-800 rounded font-extrabold border border-amber-300">
                                정원 초과 시 별도실 자동 추가
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 text-[11px] bg-emerald-100 text-emerald-800 rounded font-extrabold">추천</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                            시험이 없는 일반 학급 교실에 대기 학생을 배정하며, 인원이 넘치면 자동으로 별도실 1칸을 추가하여 대기 인원을 재배치합니다.
                          </p>
                          <div className="mt-1.5 text-xs text-blue-700 font-bold flex items-center gap-1 flex-wrap">
                            <span>기본 일반 학급 ({regularTotalCap}석): {regularCandidateRooms.map(r => r.roomName).join(', ') || '(없음)'}</span>
                            {isWaitOverflow && autoAddedExtraRooms.length > 0 && (
                              <span className="text-orange-700 font-extrabold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                                + 자동으로 {autoAddedExtraRooms.map(r => r.roomName).join(', ')} 추가 ({autoAddedExtraRooms.reduce((s, r) => s + (r.capacity || 28), 0)}석)
                              </span>
                            )}
                          </div>

                          {/* 안내 박스 */}
                          {isWaitOverflow && (
                            <div className="mt-2.5 p-3 bg-amber-50/90 border border-amber-300 rounded-xl text-xs space-y-1">
                              <div className="font-black text-amber-950 flex items-center gap-1.5">
                                <span className="text-sm">📢</span>
                                <span>정원 초과 자동 별도실 추가 안내</span>
                              </div>
                              <div className="text-amber-900 leading-relaxed font-medium">
                                대기 학생(<strong>{waitPlacementModal.waitStudentsCount}명</strong>)이 일반 학급 총 정원(<strong>{regularTotalCap}석</strong>)을 
                                <strong> {waitPlacementModal.waitStudentsCount - regularTotalCap}명</strong> 초과합니다.<br />
                                따라서 <strong>자동으로 {autoAddedExtraRooms.map(r => r.roomName).join(', ') || '별도실 1칸'}을 추가</strong>하여 대기 인원 전원({waitPlacementModal.waitStudentsCount}명)을 안전하게 재배치합니다.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </label>

                {/* Option 2: 어느 반에 배치할지 직접 선택 */}
                <label className={`block p-3.5 rounded-xl border-2 transition cursor-pointer ${
                  waitPlacementModal.mode === 'custom_rooms'
                    ? 'border-[#005691] bg-blue-50/40 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="waitPlacementMode"
                      checked={waitPlacementModal.mode === 'custom_rooms'}
                      onChange={() => setWaitPlacementModal(prev => prev ? { ...prev, mode: 'custom_rooms' } : null)}
                      className="mt-1 w-4 h-4 text-[#005691]"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 text-sm">
                        🎯 어느 반에 배치할지 직접 선택 (원하는 반 지정)
                      </div>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        선택한 반(들)에만 대기 학생을 배치하고, 선택하지 않은 다른 반 및 별도실은 비워둡니다.
                      </p>

                      {waitPlacementModal.mode === 'custom_rooms' && (
                        <div className="mt-3 p-2.5 bg-white border border-gray-200 rounded-lg space-y-1.5 animate-in fade-in duration-100">
                          <div className="text-xs font-bold text-gray-700 mb-1">대기실로 사용할 반 선택:</div>
                          <div className="grid grid-cols-3 gap-2">
                            {waitPlacementModal.candidateRooms.map(r => {
                              const isChecked = waitPlacementModal.selectedRoomIds.includes(r.id);
                              return (
                                <label
                                  key={r.id}
                                  className={`p-2 rounded-lg border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                                    isChecked
                                      ? 'bg-blue-100 border-[#005691] text-[#005691]'
                                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={e => {
                                      const checked = e.target.checked;
                                      setWaitPlacementModal(prev => {
                                        if (!prev) return null;
                                        const nextIds = checked
                                          ? [...prev.selectedRoomIds, r.id]
                                          : prev.selectedRoomIds.filter(id => id !== r.id);
                                        return { ...prev, selectedRoomIds: nextIds };
                                      });
                                    }}
                                    className="w-3.5 h-3.5 text-[#005691] rounded"
                                  />
                                  <span className="truncate">{r.roomName} ({r.capacity}석)</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </label>

                {/* Option 3: 수동 배치 (대기 인원 비워두기) */}
                <label className={`block p-3.5 rounded-xl border-2 transition cursor-pointer ${
                  waitPlacementModal.mode === 'manual_empty'
                    ? 'border-[#005691] bg-blue-50/40 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="waitPlacementMode"
                      checked={waitPlacementModal.mode === 'manual_empty'}
                      onChange={() => setWaitPlacementModal(prev => prev ? { ...prev, mode: 'manual_empty' } : null)}
                      className="mt-1 w-4 h-4 text-[#005691]"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 text-sm">
                        ✏️ 수동 배치 (대기 인원 자동배치 안 함 / 비워두기)
                      </div>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        대기실을 자동 생성하지 않고 비워둡니다. 관리자가 학생 명단에서 원하는 반으로 직접 이동/배치합니다.
                      </p>
                    </div>
                  </div>
                </label>

                {/* Option 4: 별도실 순차 사용 */}
                <label className={`block p-3.5 rounded-xl border-2 transition cursor-pointer ${
                  waitPlacementModal.mode === 'extra_rooms'
                    ? 'border-[#005691] bg-blue-50/40 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="waitPlacementMode"
                      checked={waitPlacementModal.mode === 'extra_rooms'}
                      onChange={() => setWaitPlacementModal(prev => prev ? { ...prev, mode: 'extra_rooms' } : null)}
                      className="mt-1 w-4 h-4 text-[#005691]"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 text-sm">
                        🏢 별도실 순차 사용 (일반 학급 정원 초과 시에만 사용)
                      </div>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        일반 학급에 정원까지 우선 배정하고, 남는 잉여 인원만 별도실1부터 순차적으로 최소 사용합니다.
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            );
          })()}
        </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setWaitPlacementModal(null)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition shadow-2xs"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecuteWaitPlacement}
                className="px-5 py-2 bg-[#005691] hover:bg-blue-800 text-white font-bold rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>변환 및 배치 실행</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
