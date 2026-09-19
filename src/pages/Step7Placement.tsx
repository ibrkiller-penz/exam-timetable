import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { CloudModal } from '../components/CloudModal';
import { saveCloudImmediately } from '../domain/firebase';
import { MSG } from '../domain/messages';
import { isWaitCell, isForbiddenCell, parseWaitCount, Student, ExamRoom, PlacementGrid, isExtraRoom } from '../domain/types';
import { selPlacementSlots, selSubjectBanEntries } from '../store/selectors';
import { slotSummary, cellDerived, panelItems } from '../domain/placement';
import { autoPlaceSlot, autoPlaceAll, resetAndAutoPlaceSlot, getStudentListForSlotRoom, calculateStudentMovement, initSlotStudentPlacements, distributeWaitToRooms, addExamRoomFromWait, shrinkExamRoomToWait } from '../domain/autoPlace';
import { verifySlotIntegrity, assertSlotIntegrity } from '../domain/integrity';
import { getSubjectColor } from '../domain/constants';
import { Sparkles, Trash2, Users, CheckCircle2, Lock, Unlock, Layers, AlertTriangle, RotateCcw, RotateCw, Plus, Clock, UserX, X, RefreshCw, ArrowRightLeft, UserCheck, Minus, BookOpen, Ban } from 'lucide-react';

interface HistorySnapshot {
  placement: PlacementGrid;
  studentPlacements: Record<number, Record<string, string>>;
  lockedCells: Record<number, Record<string, boolean>>;
  rooms: ExamRoom[];
  actionName: string;
}

export const Step7Placement: React.FC = () => {
  const { settings, updateSettings, 
    placement,
    studentPlacements,
    lockedCells = {},
    rooms,
    students,
    neis,
    
    stages,
    ui,
    setPlacementCell,
    swapPlacementCells,
    setLockedCell,
    clearPlacementSlot,
    clearAllPlacement,
    setPlacementGrid,
    transferStudentsAndUpdatePlacement,
    setSlotStudentPlacements,
    setAllStudentPlacements,
    setSelectedPlacementCell,
    confirmStage4,
    cancelStage4,
    addRoom,
    deleteRoom,
    setRooms,
  } = useAppStore();

  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  const selectedCell = ui.selectedPlacementCell;
  const movementStats = calculateStudentMovement(placement, placementSlots, rooms, students);

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);
  const [cloudModalOpen, setCloudModalOpen] = useState<boolean>(false);
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
    if (past.length === 0 || stages.stage4) return;
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
    if (future.length === 0 || stages.stage4) return;
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
  const handleToggleForbiddenCell = (slot?: number, roomId?: string) => {
    if (stages.stage4) return;
    const targetSlot = slot ?? selectedCell?.slot;
    const targetRoomId = roomId ?? selectedCell?.roomId;
    if (targetSlot === undefined || !targetRoomId) return;

    const curVal = placement[targetSlot]?.[targetRoomId] || '';
    const room = rooms.find(r => r.id === targetRoomId);
    const roomLabel = room ? room.roomName : targetRoomId;

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
        rooms,
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
      const regularRooms = candidateRooms.filter(r => !isExtraRoom(r) && !r.roomName.startsWith('별도'));
      const regularCap = regularRooms.reduce((sum, r) => sum + (r.capacity && r.capacity > 0 ? r.capacity : 28), 0);
      const targetRoomIds = regularRooms.map(r => r.id);

      // 인원이 넘치면 자동으로 별도실 1칸(필요한 별도실)을 추가하고 대기 인원 재배치
      if (waitPlacementModal.waitStudentsCount > regularCap) {
        let overflow = waitPlacementModal.waitStudentsCount - regularCap;
        const availableExtraRooms = candidateRooms
          .filter(r => isExtraRoom(r) || r.roomName.startsWith('별도'))
          .sort((a, b) => a.roomName.localeCompare(b.roomName, 'ko', { numeric: true }));

        for (const er of availableExtraRooms) {
          if (overflow <= 0) break;
          targetRoomIds.push(er.id);
          const cap = er.capacity && er.capacity > 0 ? er.capacity : 28;
          overflow -= cap;
        }
      }
      chosenWaitRoomIds = targetRoomIds;
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
  const handleAddExamRoomFromWait = (slotIndex: number, subject?: string, targetRoomId?: string) => {
    if (stages.stage4) return;
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
    if (stages.stage4) return;
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
            rooms,
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

  // Clear All Students in a Room
  const handleClearRoomStudents = (r: ExamRoom) => {
    if (stages.stage4) return;
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
    if (stages.stage4) return;
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
    if (stages.stage4) return;
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
            : initSlotStudentPlacements(slot, slotRow, placementSlots, rooms, entries, students, neis);

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

          const emptyRooms = rooms.filter(r => {
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
      slotPlacements = initSlotStudentPlacements(slot, placement[slot] ?? {}, placementSlots, rooms, entries, students, neis);
      setSlotStudentPlacements(slot, slotPlacements);
    }

    const result = getStudentListForSlotRoom(
      slot,
      roomId,
      placement,
      placementSlots,
      rooms,
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
      slotPlacements = initSlotStudentPlacements(slotIndex, placement[slotIndex] ?? {}, placementSlots, rooms, entries, students, neis);
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
      setRowTargetRoomIds(prev => {
        const next = { ...prev };
        selectedStudentKeys.forEach(k => {
          next[k] = targetWaitRoom!.id;
        });
        return next;
      });
      setAlertModal({
        isOpen: true,
        message: `선택한 ${selectedStudentKeys.length}명의 이동 대상이 [${targetWaitRoom.roomName} (대기)]로 지정되었습니다. 아래 [🚀 수기/일괄 이동 적용]을 누르면 즉시 반영됩니다.`,
      });
      setSelectedStudentKeys([]);
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
              message: `⚠️ 수강생 불일치 오류: [${st.name || stKey}] 학생은 [${targetSubject}] 과목의 수강생이 아닙니다.\n\n해당 과목 고사장에 배치할 수 없습니다. (총원 및 수강자 무결성 보호)`,
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
      const report = verifySlotIntegrity(slot, placement, placementSlots, rooms, students, simulatedPlacements);
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
    if (stages.stage4) return;
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
          rooms,
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
    if (stages.stage4) return;
    const ps = placementSlots.find(s => s.index === slot);
    if (!ps) return;

    const extraRooms = rooms.filter(r => (r.maxClassSize === null || r.maxClassSize === 0) && r.capacity > 0);
    const runPlacement = (isExtra: boolean) => {
      pushHistory(`[${ps.title}] 자동배치`);
      const slotLocked = lockedCells[slot];
      const existingPlacements = studentPlacements?.[slot];
      const next = autoPlaceSlot(slot, rooms[0]?.id ?? '', placement, placementSlots, rooms, entries, students, isExtra, slotLocked);
      const nextStudentPlacements = initSlotStudentPlacements(slot, next[slot] ?? {}, placementSlots, rooms, entries, students, neis, existingPlacements, slotLocked);
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
    if (stages.stage4) return;
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_AUTO_ALL,
      onConfirm: () => {
        pushHistory('전체 자동배치');
        const next = autoPlaceAll(placement, placementSlots, rooms, entries, students, undefined, lockedCells);
        setPlacementGrid(next);
        const allPlacements: Record<number, Record<string, string>> = {};
        for (const ps of placementSlots) {
          const slotLocked = lockedCells[ps.index];
          const existingPlacements = studentPlacements?.[ps.index];
          allPlacements[ps.index] = initSlotStudentPlacements(ps.index, next[ps.index] ?? {}, placementSlots, rooms, entries, students, neis, existingPlacements, slotLocked);
        }
        setAllStudentPlacements(allPlacements);
        setConfirmModal(null);
      },
    });
  };

  
  const handleFillWaitSlot = (slotIndex: number) => {
    if (stages.stage4) return;
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return;
    pushHistory(`[${ps.title}] 대기 배정`);
    const newPlacement = { ...placement };
    const newStudentPlacements = { ...studentPlacements };

    const slotRow = { ...(newPlacement[slotIndex] || {}) };
    const slotPlacements = newStudentPlacements[slotIndex] ? { ...newStudentPlacements[slotIndex] } : initSlotStudentPlacements(slotIndex, slotRow, placementSlots, rooms, entries, students, neis);

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

    const emptyRooms = rooms.filter(r => {
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
    if (stages.stage4) return;
    const ps = placementSlots.find(s => s.index === slotIndex);
    if (!ps) return;

    pushHistory(`[${ps.title}] 대기 균등분배`);
    const newPlacement = { ...placement };
    const newStudentPlacements = { ...studentPlacements };

    const slotRow = { ...(newPlacement[slotIndex] || {}) };
    const slotPlacements = newStudentPlacements[slotIndex]
      ? { ...newStudentPlacements[slotIndex] }
      : initSlotStudentPlacements(slotIndex, slotRow, placementSlots, rooms, entries, students, neis);

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
    const regularEmptyRooms = rooms.filter(r => {
      if (lockedCells[slotIndex]?.[r.id]) return false;
      if (isExtraRoom(r) || r.roomName.startsWith('별도')) return false;
      const val = slotRow[r.id];
      if (isForbiddenCell(val)) return false;
      return !val || isWaitCell(val);
    });
    const targetRooms = regularEmptyRooms.length > 0 ? regularEmptyRooms : rooms.filter(r => {
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
    if (stages.stage4) return;
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
            : initSlotStudentPlacements(slot, slotRow, placementSlots, rooms, entries, students, neis);

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

          const regularEmptyRooms = rooms.filter(r => {
            if (lockedCells[slot]?.[r.id]) return false;
            if (isExtraRoom(r) || r.roomName.startsWith('별도')) return false;
            const val = slotRow[r.id];
            if (isForbiddenCell(val)) return false;
            return !val || isWaitCell(val);
          });
          const targetRooms = regularEmptyRooms.length > 0 ? regularEmptyRooms : rooms.filter(r => {
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
    if (stages.stage4) return;
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
    if (!selectedCell || stages.stage4) return;
    pushHistory('현재 셀 삭제');
    setPlacementCell(selectedCell.slot, selectedCell.roomId, '');
  };

  const handleDeleteSlot = () => {
    if (!selectedCell || stages.stage4) return;
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

  const handleResetStep7 = () => {
    if (stages.stage4) return;
    setConfirmModal({
      isOpen: true,
      message: '⚠️ 학생 및 고사실 배치를 모두 초기화하시겠습니까?\n\n• 모든 교시의 고사실 및 대기 배치가 깨끗하게 비워집니다.\n• 초기화 후 [전체 자동배치]를 다시 실행할 수 있습니다.\n• 작업 후에도 실행 취소(Undo)로 언제든 되돌릴 수 있습니다.',
      onConfirm: () => {
        pushHistory('배치 전체 초기화');
        clearAllPlacement();
        setPlacementGrid({});
        setAllStudentPlacements({});
        setSelectedPlacementCell(null);
        setConfirmModal(null);
        setAlertModal({
          isOpen: true,
          message: '✅ 학생 및 고사실 배치가 깨끗하게 초기화되었습니다.\n\n[전체 자동배치] 버튼을 눌러 처음부터 다시 배치를 진행할 수 있습니다.'
        });
      },
    });
  };

  const handleDeleteAll = handleResetStep7;

  const handleConfirm = async () => {
    try {
      const notices = confirmStage4();
      await saveCloudImmediately(useAppStore.getState(), '[확정] 7단계. 학생배치 확정');
      
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
    if (!selectedCell || curRoomStudents.length === 0 || stages.stage4) return;
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

  const activeSlotIntegrity = verifySlotIntegrity(activeSlotIdx, placement, placementSlots, rooms, students, activeSlotPlacements);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={7}
        stageTitle="학생 및 고사실 배치"
        isConfirmed={!!(stages.step7 ?? stages.stage4)}
        confirmLabel="배치 확정"
        cancelLabel="배치 확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        actions={
          <div className="flex items-center gap-2">
            {/* Undo / Redo Arrow Buttons with aria-label & Action Name Tooltips */}
            <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 gap-1 shadow-2xs">
              <button
                onClick={handleUndo}
                disabled={past.length === 0 || stages.stage4}
                aria-label="실행 취소"
                className="px-2.5 py-1.5 hover:bg-white text-gray-700 rounded-lg text-sm font-bold flex items-center gap-1 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed shadow-2xs"
                title={past.length > 0 ? `실행 취소 - ${past[past.length - 1].actionName}` : '실행 취소'}
              >
                <RotateCcw className="w-4 h-4 text-indigo-600" />
                <span>취소</span>
              </button>
              <button
                onClick={handleRedo}
                disabled={future.length === 0 || stages.stage4}
                aria-label="다시 실행"
                className="px-2.5 py-1.5 hover:bg-white text-gray-700 rounded-lg text-sm font-bold flex items-center gap-1 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed shadow-2xs"
                title={future.length > 0 ? `다시 실행 - ${future[0].actionName}` : '다시 실행'}
              >
                <RotateCw className="w-4 h-4 text-indigo-600" />
                <span>재실행</span>
              </button>
            </div>

            {/* Re-place Current Slot Button */}
            {curSlot && (
              <button
                onClick={() => handleResetAndAutoPlaceSlot(curSlot.index)}
                disabled={stages.stage4}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-[15px] font-bold flex items-center gap-1.5 shadow-2xs transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200"
                title={`[${curSlot.title}] 교시만 초기화하고 다시 자동 배치합니다 (다른 교시 영향 없음)`}
              >
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                <span>이 교시 재배치</span>
              </button>
            )}

            <button
              onClick={handleAutoPlaceAll}
              disabled={stages.stage4}
              className="px-4 py-2 bg-[#005691] hover:bg-blue-800 text-white rounded-xl text-base font-bold flex items-center gap-1.5 shadow-md transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
              title="미응시자 자기반 대기 보장 및 이동 최소화 최적 배치 실행"
            >
              <Sparkles className="w-4 h-4" /> 전체 자동배치
            </button>
            <button
              onClick={() => handleFillSubsequentWait()}
              disabled={stages.stage4}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 shadow-2xs"
              title={selectedCell ? `선택된 ${placementSlots.find(s => s.index === selectedCell.slot)?.title || ''}부터 이후 교시들의 빈 고사실을 대기로 일괄 배정` : '전체 교시의 빈 고사실들을 대기로 일괄 배정'}
            >
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>이후 대기</span>
            </button>
            <button
              onClick={handleConfirmWaitNames}
              disabled={stages.stage4}
              className="px-3 py-2 bg-[#e6f1f8] hover:bg-blue-100 text-[#005691] border border-[#b3d4e8] rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed shadow-2xs"
            >
              대기반 확정
            </button>
            <button
              onClick={handleDistributeWait}
              disabled={stages.stage4}
              className="px-3 py-2 bg-[#e6f1f8] hover:bg-[#cce3f0] text-indigo-700 border border-[#b3d4e8] rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed shadow-2xs"
            >
              대기 균등분배
            </button>
            {selectedCell && (
              <button
                onClick={() => handleToggleForbiddenCell()}
                disabled={stages.stage4}
                className={`px-3 py-2 rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed shadow-2xs active:scale-95 ${
                  placement[selectedCell.slot]?.[selectedCell.roomId] === '배치금지'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-700'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300'
                }`}
                title="선택한 고사실을 해당 교시에 배치금지(과목 및 학생 배제)로 지정하거나 해제합니다."
              >
                <Ban className="w-4 h-4" />
                <span>
                  {placement[selectedCell.slot]?.[selectedCell.roomId] === '배치금지'
                    ? '배치금지 해제'
                    : '배치금지'}
                </span>
              </button>
            )}
            <button
              onClick={handleResetStep7}
              disabled={stages.stage4}
              className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-xl text-[15.5px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed shadow-2xs active:scale-95"
              title="학생 및 고사실 배치를 모두 초기화합니다."
            >
              <RotateCcw className="w-4 h-4 text-red-600" />
              <span>배치 초기화</span>
            </button>
          </div>
        }
      />

      {/* Movement & Home Waiting Summary Banner with Live Student Counts */}
      <div className="bg-[#fee2e2] text-[#005691] border-b border-emerald-800 px-6 py-2 flex items-center justify-between shrink-0 no-print shadow-xs">
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
      </div>

      <div className="p-4 flex-1 flex gap-4 overflow-hidden">
        {/* Placement Table Grid */}
        <div className="flex-1 flex flex-col border border-gray-200 rounded-2xl overflow-auto bg-white shadow-sm">
          <table className={`w-full text-left border-collapse ${isCompactFit ? 'text-[13.5px]' : 'text-[16px] min-w-[950px]'}`}>
            <thead className="bg-gray-50 text-[#0f172a] sticky top-0 z-20 shadow-xs">
              <tr className="divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
                <th rowSpan={2} className={`py-2 px-2 text-center font-bold text-gray-900 ${isCompactFit ? 'w-24 text-[13px]' : 'w-32 text-[16px]'}`}>
                  슬롯 (과목)
                </th>
                <th rowSpan={2} className={`py-2 px-1 text-center font-bold text-gray-900 ${isCompactFit ? 'w-10 text-[13px]' : 'w-12 text-[16px]'}`}>
                  구분
                </th>
                <th colSpan={4} className={`py-1.5 px-1 text-center font-bold text-gray-900 ${isCompactFit ? 'text-[13px]' : 'text-[16px]'}`}>
                  인원 요약 현황
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
                        {!stages.stage4 && (
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
                <th className={`py-1 px-0.5 text-center font-bold text-gray-700 ${isCompactFit ? 'w-8 text-[12px]' : 'w-12 text-[14px]'}`}>학급</th>
                <th className={`py-1 px-0.5 text-center font-bold text-gray-700 ${isCompactFit ? 'w-8 text-[12px]' : 'w-12 text-[14px]'}`}>총원</th>
                <th className={`py-1 px-0.5 text-center font-bold text-gray-700 ${isCompactFit ? 'w-8 text-[12px]' : 'w-12 text-[14px]'}`}>응시</th>
                <th className={`py-1 px-0.5 text-center font-bold text-gray-700 ${isCompactFit ? 'w-8 text-[12px]' : 'w-12 text-[14px]'}`}>미응시</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-200 font-normal">
              {placementSlots.map(ps => {
                const sum = slotSummary(ps.index, placement, placementSlots, entries, studentPlacements, students);
                const hasError = sum.errorKey !== 'OK';

                return (
                  <React.Fragment key={ps.index}>
                    <tr className="divide-x divide-gray-200 bg-white">
                      <td rowSpan={3} className={`py-2 px-2 font-bold text-center bg-white ${isCompactFit ? 'w-24' : 'w-32'}`}>
                        <div className={`text-gray-900 font-bold ${isCompactFit ? 'text-[13.5px]' : 'text-[16px]'}`}>{ps.title}</div>
                        <div className={`text-[#005691] font-bold mt-0.5 ${isCompactFit ? 'text-[12.5px]' : 'text-[14.5px]'}`}>{ps.subjects.join(', ')}</div>
                        {!stages.stage4 && (
                          <div className="flex items-center justify-center gap-1 mt-1.5 flex-wrap">
                            <button
                              onClick={() => handleAddExamRoomFromWait(ps.index)}
                              className={`font-bold bg-blue-50 text-[#005691] border border-blue-200 rounded-lg hover:bg-blue-100 shadow-2xs transition ${isCompactFit ? 'text-[11px] px-1.5 py-0.5' : 'text-[13px] px-2 py-0.5'}`}
                              title="이 교시에 시험 고사장 1실 추가 (대기실을 고사장으로 변환)"
                            >
                              + 고사장
                            </button>
                            <button
                              onClick={() => handleShrinkExamRoomToWait(ps.index)}
                              className={`font-bold bg-amber-50 text-amber-900 border border-amber-200 rounded-lg hover:bg-amber-100 shadow-2xs transition ${isCompactFit ? 'text-[11px] px-1.5 py-0.5' : 'text-[13px] px-2 py-0.5'}`}
                              title="이 교시의 고사장 1실 축소 (대기실로 변환하고 학생 합침)"
                            >
                              - 축소
                            </button>
                            <button
                              onClick={() => handleResetAndAutoPlaceSlot(ps.index)}
                              className={`font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg hover:bg-indigo-100 shadow-2xs transition ${isCompactFit ? 'text-[11px] px-1.5 py-0.5' : 'text-[13px] px-2 py-0.5'}`}
                              title="이 교시만 초기화하고 다시 자동배치 (다른 교시 영향 없음)"
                            >
                              재배치
                            </button>
                            <button
                              onClick={() => handleAutoPlaceSlot(ps.index)}
                              className={`font-bold bg-[#e6f1f8] text-[#005691] border border-gray-200 rounded-lg hover:bg-[#fee2e2] shadow-2xs transition ${isCompactFit ? 'text-[11px] px-1.5 py-0.5' : 'text-[13px] px-2 py-0.5'}`}
                              title="이 교시 자동배치"
                            >
                              자동배치
                            </button>

                            {sum.remaining.takers + sum.remaining.nonTakers > 0 && (
                              <button
                                onClick={() => handleOpenUnplacedModal(ps.index)}
                                className={`w-full font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-xs transition flex items-center justify-center gap-1 animate-pulse active:scale-95 ${
                                  isCompactFit ? 'text-[11px] px-1.5 py-0.5 mt-1' : 'text-[12.5px] px-2 py-1 mt-1.5'
                                }`}
                                title="이 교시에 아직 배정되지 않은 미배치 학생 명단을 확인하고 고사실에 배정합니다."
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                                <span>미배치 {sum.remaining.takers + sum.remaining.nonTakers}명</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`py-1 px-1 text-center bg-white text-slate-700 font-medium ${isCompactFit ? 'w-10 text-[12.5px]' : 'w-14 text-[15px]'}`}>계</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-[#005691] ${isCompactFit ? 'w-8 text-[13px]' : 'w-12 text-[16px]'}`}>{sum.total.ban}</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-gray-900 ${isCompactFit ? 'w-8 text-[13px]' : 'w-12 text-[16px]'}`}>{sum.total.takers + sum.total.nonTakers}</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-red-800 ${isCompactFit ? 'w-8 text-[13px]' : 'w-12 text-[16px]'}`}>{sum.total.takers}</td>
                      <td className={`py-1 px-0.5 text-center font-medium text-amber-900 ${isCompactFit ? 'w-8 text-[13px]' : 'w-12 text-[16px]'}`}>{sum.total.nonTakers}</td>

                      {rooms.map(r => {
                        const cellVal = placement[ps.index]?.[r.id] ?? '';
                        const isSelected = selectedCell?.slot === ps.index && selectedCell?.roomId === r.id;
                        const isWait = isWaitCell(cellVal);
                        const isForbidden = isForbiddenCell(cellVal);
                        const isUsable = r.roomName !== '' && r.roomName !== '0';
                        const subjectName = isWait || isForbidden ? '' : cellVal.split('-')[0] || '';
                        const color = getSubjectColor(subjectName);
                        const isLocked = lockedCells[ps.index]?.[r.id] ?? false;

                        // Calculate actual count from studentPlacements if available
                        const slotPlacements = studentPlacements?.[ps.index];
                        const derivedCount = cellDerived(cellVal, entries).stuCount;
                        const actualCount: number = slotPlacements
                          ? students.filter(st => slotPlacements[`${st.ban}-${st.num}`] === r.id).length
                          : (typeof derivedCount === 'number' ? derivedCount : 0);

                        const roomCap = r.capacity && r.capacity > 0 ? r.capacity : 28;
                        const isOverCapacity = isUsable && !isForbidden && actualCount > roomCap;

                        return (
                          <td
                            key={r.id}
                            rowSpan={3}
                            onClick={() => isUsable && handleCellClick(ps.index, r.id)}
                            onDoubleClick={() => isUsable && !isForbidden && handleCellDoubleClick(ps.index, r.id)}
                            draggable={isUsable && !stages.stage4 && !isLocked && !isForbidden}
                            onDragStart={(e) => {
                              if (stages.stage4 || !isUsable || isLocked || isForbidden) { e.preventDefault(); return; }
                              e.dataTransfer.setData('application/json', JSON.stringify({ slot: ps.index, roomId: r.id }));
                            }}
                            onDragOver={(e) => {
                              if (stages.stage4 || !isUsable || isLocked || isForbidden) return;
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (stages.stage4 || !isUsable || isLocked || isForbidden) return;
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
                              isWait ? 'bg-[#e6f1f8]/80 hover:bg-[#e6f1f8]/80 border-b border-gray-200' :
                              cellVal ? `${color.bg} ${color.hoverBg} border-b ${color.border}/50` :
                              'hover:bg-white'
                            }`}
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
                                {!stages.stage4 && (
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
                                className={`space-y-0.5 hover:scale-105 transition-transform group ${isLocked ? 'opacity-70' : ''}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleCellClick(ps.index, r.id);
                                  handleCellDoubleClick(ps.index, r.id);
                                }}
                              >
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <div className={`font-bold break-keep leading-tight ${isCompactFit ? 'text-[12px]' : 'text-[14.5px]'} ${isOverCapacity ? 'text-orange-950 font-black' : isWait ? 'text-amber-950 hover:underline' : `${color.text} hover:underline`}`}>
                                    {cellVal.split('-').map((part, i) => (
                                      <React.Fragment key={i}>
                                        {i > 0 && <br />}
                                        {i > 0 ? '-' : ''}{part}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                  {isOverCapacity && (
                                    <span className="px-1.5 py-0.2 bg-orange-600 text-white text-[9.5px] rounded-sm font-black shadow-2xs tracking-tighter">
                                      강제배정
                                    </span>
                                  )}
                                </div>
                                {isOverCapacity ? (
                                  <div
                                    className={`font-black text-white flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 rounded-md px-1.5 py-0.5 mt-0.5 shadow-xs transition ${
                                      isCompactFit ? 'text-[10.5px]' : 'text-[12px]'
                                    }`}
                                    title={`[강제 배정] 정원(${roomCap}명)을 ${actualCount - roomCap}명 초과하여 ${actualCount}명이 강제 배정되었습니다.`}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-100 shrink-0 animate-pulse" />
                                    <span>{actualCount}명 (강제배정)</span>
                                  </div>
                                ) : (
                                  <div className={`font-bold hover:underline ${isCompactFit ? 'text-[11.5px] text-slate-800' : 'text-[14px] text-[#0f172a]'}`}>
                                    {actualCount}명
                                  </div>
                                )}

                                {/* 대기실 ↔ 고사장 원클릭 변환 버튼 */}
                                {!stages.stage4 && !isLocked && (
                                  isWait ? (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleAddExamRoomFromWait(ps.index, undefined, r.id);
                                      }}
                                      className={`mt-1 px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-bold inline-flex items-center justify-center gap-0.5 shadow-xs transition active:scale-95 mx-auto ${
                                        isCompactFit ? 'text-[10px]' : 'text-[11.5px]'
                                      }`}
                                      title="이 대기실을 시험 고사장으로 변환 (인원은 비워져 수동배치 가능)"
                                    >
                                      <ArrowRightLeft className="w-2.5 h-2.5" />
                                      <span>고사장 변환</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleShrinkExamRoomToWait(ps.index, subjectName, r.id);
                                      }}
                                      className={`mt-1 px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-md font-bold inline-flex items-center justify-center gap-0.5 shadow-2xs transition active:scale-95 mx-auto opacity-90 hover:opacity-100 ${
                                        isCompactFit ? 'text-[10px]' : 'text-[11.5px]'
                                      }`}
                                      title="이 고사장을 대기실로 변환 (학생은 직전 고사장으로 합침)"
                                    >
                                      <ArrowRightLeft className="w-2.5 h-2.5 text-amber-600" />
                                      <span>대기실 변환</span>
                                    </button>
                                  )
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-1">
                                <span className="text-gray-400 text-[14px]">-</span>
                                {!stages.stage4 && !isLocked && (
                                  <div className="mt-0.5 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleAddExamRoomFromWait(ps.index, undefined, r.id);
                                      }}
                                      className={`px-1.5 py-0.5 bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-700 border border-gray-200 hover:border-blue-300 rounded-md font-bold inline-flex items-center justify-center gap-0.5 shadow-2xs ${
                                        isCompactFit ? 'text-[9.5px]' : 'text-[11px]'
                                      }`}
                                      title="이 빈 고사실을 시험 고사장으로 변환"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                      <span>고사장 변환</span>
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
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Sidebar Placement Panel - Collapsible */}
        {isPanelOpen && (
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
            {selectedCell ? (
              <>
                {/* 현재 교시 미배치 학생 알림 및 바로가기 */}
                {(() => {
                  const unplacedInSlot = students.filter(st => {
                    const rId = curSlotPlacements[`${st.ban}-${st.num}`];
                    return !rId || rId === 'unplaced' || !curSlotRow[rId] || curSlotRow[rId] === '배치금지';
                  });
                  if (unplacedInSlot.length > 0) {
                    return (
                      <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded-xl flex items-center justify-between shadow-2xs">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                          <div>
                            <div className="text-[13px] font-bold text-red-900">
                              이 교시 미배치 학생 {unplacedInSlot.length}명
                            </div>
                            <div className="text-[11px] text-red-700">
                              아직 시험실/대기실에 배정되지 않았습니다.
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleOpenUnplacedModal(selectedCell.slot)}
                          className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition active:scale-95 shrink-0 cursor-pointer"
                        >
                          명단 확인
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
                {placement[selectedCell.slot]?.[selectedCell.roomId] === '배치금지' && (
                  <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-[13.5px] font-bold flex items-center gap-2 shadow-2xs">
                    <Ban className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>이 고사실은 해당 교시에 '배치금지'로 설정되어 있습니다.</span>
                  </div>
                )}
                {lockedCells[selectedCell.slot]?.[selectedCell.roomId] && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[13.5px] font-bold flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>잠겨있는 셀입니다. 수정이 불가합니다. (자물쇠 아이콘으로 잠금 해제 가능)</span>
                  </div>
                )}

                {/* 1. 미배치 과목 반 배치 (기하-1반 등) */}
                {examBanItems.length > 0 && (
                  <div className="mb-3 space-y-1.5 shrink-0">
                    <div className="text-xs font-bold text-gray-700 flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span>시험 과목 반 배치 (클릭하여 현재 고사실에 배치):</span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {examBanItems.map((it, idx) => {
                        const subjectName = it.key.split('-')[0] || '';
                        const color = getSubjectColor(subjectName);
                        const isLockedCell = lockedCells[selectedCell.slot]?.[selectedCell.roomId];
                        return (
                          <button
                            key={idx}
                            disabled={stages.stage4 || isLockedCell}
                            onClick={() => setPlacementCell(selectedCell.slot, selectedCell.roomId, it.key)}
                            className={`w-full text-left p-2.5 rounded-xl text-sm border transition flex items-center justify-between font-bold ${color.bg} ${color.hoverBg} ${color.border} ${color.text} shadow-2xs`}
                          >
                            <span>{it.key}</span>
                            <span className="text-xs">{it.count || it.room}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. 대기 균등분배 & 현재 고사실 배정 요약 */}
                <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-extrabold text-gray-800 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      <span>대기/미배치 관리</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDistributeWaitSingleSlot(selectedCell.slot)}
                      disabled={stages.stage4}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold shadow-2xs flex items-center gap-1 active:scale-95 transition cursor-pointer"
                      title="대기 인원을 고사실 정원 한도 내에서 균등 분배합니다."
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>대기 균등분배</span>
                    </button>
                  </div>

                  {/* 현재 고사실 배정 학생 요약 및 비우기 */}
                  {curRoomStudents.length > (curRoom?.capacity && curRoom.capacity > 0 ? curRoom.capacity : 28) && (
                    <div className="p-2.5 bg-orange-50 border border-orange-300 rounded-xl flex items-center gap-2 text-orange-950">
                      <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 animate-pulse" />
                      <div className="text-xs font-bold leading-tight">
                        <span>⚠️ 정원 초과 강제 배정 반</span>
                        <div className="text-[11px] text-orange-800 font-semibold mt-0.5">
                          정원 {curRoom?.capacity || 28}석 중 {curRoomStudents.length}명 배정 (+{curRoomStudents.length - (curRoom?.capacity || 28)}명 초과)
                        </div>
                      </div>
                    </div>
                  )}

                  {curRoomStudents.length > 0 && (
                    <div className="pt-2 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs font-bold text-gray-800 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-blue-600" />
                          <span>현재 고사실 학생 ({curRoomStudents.length}명)</span>
                        </div>
                        {!stages.stage4 && !lockedCells[selectedCell.slot]?.[selectedCell.roomId] && (
                          <button
                            type="button"
                            onClick={handleUnplaceCurrentRoomStudents}
                            className="text-[11px] text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                            title="현재 고사실의 학생들을 모두 비워 미배치 상태로 되돌립니다."
                          >
                            미배치로 비우기
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto p-1.5 bg-white border border-gray-200 rounded-lg grid grid-cols-4 gap-1 max-h-32">
                        {curRoomStudents.map(st => {
                          const stId = `${st.grade}${String(st.ban).padStart(2, '0')}${String(st.num).padStart(2, '0')}`;
                          return (
                            <div
                              key={`${st.ban}-${st.num}`}
                              title={`${stId} ${st.name} (${st.ban}반 ${st.num}번)`}
                              className="py-0.5 px-0.5 text-center font-mono font-bold text-[11px] rounded bg-blue-50 text-blue-900 border border-blue-200"
                            >
                              {stId}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3.5 pt-3.5 border-t border-gray-200 space-y-2.5">
                  {/* Context-aware buttons for converting 대기실 ↔ 고사장 & 배치금지 */}
                  {(() => {
                    const curCellVal = placement[selectedCell.slot]?.[selectedCell.roomId] || '';
                    const isWait = isWaitCell(curCellVal);
                    const isForbidden = curCellVal === '배치금지';
                    const isExam = Boolean(curCellVal && !isWait && !isForbidden);
                    const isLocked = lockedCells[selectedCell.slot]?.[selectedCell.roomId];
                    if (stages.stage4 || isLocked) return null;

                    if (isForbidden) {
                      return (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                          <div className="text-[13px] font-bold text-rose-900 flex items-center gap-1.5">
                            <Ban className="w-4 h-4 text-rose-600" />
                            <span>배치금지 설정된 고사실</span>
                          </div>
                          <p className="text-[12px] text-rose-700 leading-tight">
                            이 교시에는 해당 고사실에 어떤 시험 과목 및 대기 학생도 배정되지 않도록 배제되어 있습니다.
                          </p>
                          <button
                            onClick={() => handleToggleForbiddenCell()}
                            className="w-full py-2.5 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 text-[13.5px] font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs active:scale-95"
                            title="배치금지 설정을 해제합니다."
                          >
                            <CheckCircle2 className="w-4 h-4 text-rose-600" />
                            <span>배치금지 해제</span>
                          </button>
                        </div>
                      );
                    }

                    if (isWait) {
                      return (
                        <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2">
                          <div className="text-[13px] font-bold text-blue-900 flex items-center gap-1.5">
                            <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                            <span>대기실 ➔ 시험 고사장 변환</span>
                          </div>
                          <p className="text-[12px] text-blue-700 leading-tight">
                            이 대기실을 해당 교시 시험 고사장으로 변환합니다. 학생은 비워져 수동 배치가 가능해집니다.
                          </p>
                          <button
                            onClick={() => handleAddExamRoomFromWait(selectedCell.slot, undefined, selectedCell.roomId)}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs active:scale-95"
                            title="이 대기실을 시험 고사장으로 변환합니다."
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                            <span>시험 고사장으로 변환</span>
                          </button>
                          <button
                            onClick={() => handleToggleForbiddenCell()}
                            className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[12.5px] font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95"
                            title="이 고사실을 배치금지로 지정합니다."
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-600" />
                            <span>배치금지 설정</span>
                          </button>
                        </div>
                      );
                    }

                    if (isExam) {
                      const subject = curCellVal.split('-')[0];
                      return (
                        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                          <div className="text-[13px] font-bold text-amber-900 flex items-center gap-1.5">
                            <ArrowRightLeft className="w-4 h-4 text-amber-600" />
                            <span>고사장 ➔ 대기실 변환</span>
                          </div>
                          <p className="text-[12px] text-amber-700 leading-tight">
                            이 고사장을 대기실로 변환합니다. 배정된 학생들은 직전 고사장으로 합쳐집니다.
                          </p>
                          <button
                            onClick={() => handleShrinkExamRoomToWait(selectedCell.slot, subject, selectedCell.roomId)}
                            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-[13.5px] font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs active:scale-95"
                            title="이 고사장을 대기실로 변환합니다."
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                            <span>대기실로 변환</span>
                          </button>
                          <button
                            onClick={() => handleToggleForbiddenCell()}
                            className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[12.5px] font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95"
                            title="이 고사실을 배치금지로 지정합니다."
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-600" />
                            <span>배치금지 설정</span>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleAddExamRoomFromWait(selectedCell.slot, undefined, selectedCell.roomId)}
                          className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[13px] font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95"
                          title="이 빈 고사실을 시험 고사장으로 변환합니다."
                        >
                          <Plus className="w-4 h-4 text-blue-600" />
                          <span>이 빈 고사실을 시험 고사장으로 변환</span>
                        </button>
                        <button
                          onClick={() => handleToggleForbiddenCell()}
                          className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[12.5px] font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95"
                          title="이 고사실에 이 시간은 배치를 못하도록 배치금지로 지정합니다."
                        >
                          <Ban className="w-3.5 h-3.5 text-rose-600" />
                          <span>이 고사실 배치금지 설정</span>
                        </button>
                      </div>
                    );
                  })()}

                  <div className="flex gap-2.5">
                    <button
                      onClick={handleDeleteCurrentCell}
                      disabled={stages.stage4 || lockedCells[selectedCell.slot]?.[selectedCell.roomId]}
                      className={`flex-1 py-2.5 text-[15px] font-bold rounded-xl transition ${
                        lockedCells[selectedCell.slot]?.[selectedCell.roomId]
                          ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                          : 'bg-white hover:bg-gray-50 text-[#0f172a]'
                      }`}
                    >
                      현재 셀 삭제
                    </button>
                    <button
                      onClick={handleDeleteSlot}
                      disabled={stages.stage4}
                      className="flex-1 py-2.5 bg-[#e6f1f8] hover:bg-[#e6f1f8] text-rose-800 border border-gray-200 text-[15px] font-bold rounded-xl transition"
                    >
                      교시 전체 삭제
                    </button>
                  </div>
                  <button
                    onClick={() => handleFillSubsequentWait(selectedCell.slot)}
                    disabled={stages.stage4}
                    className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[15px] font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs"
                    title="선택한 교시부터 마지막 교시까지 빈 고사실들에 대기 인원 자동 배정"
                  >
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>이 교시부터 이후 대기 자동 배정</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[15px] text-[#0f172a] p-6 text-center leading-relaxed font-normal">
                배치 격자에서 셀을 선택하면 배치 가능한 항목 목록이 여기에 표시됩니다.
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Student List Modal with Multi-Selection, Individual Dropdowns, and Explicit Transfer/Close Buttons */}
      {studentListModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setStudentListModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col border border-gray-200 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-4.5 border-b border-gray-200 flex items-center justify-between bg-white rounded-t-2xl">
              <h3 className="text-base font-bold text-[#005691] flex items-center gap-2.5">
                <Users className="w-5 h-5 text-red-500" />
                <span>{studentListModal.title}</span>
              </h3>
              <button
                onClick={() => handleCommitTransfersAndClose(false)}
                className="text-[#0f172a] hover:text-gray-800 text-xl font-bold p-1 rounded-lg hover:bg-gray-50 transition"
              >
                ✕
              </button>
            </div>

            {/* Batch Action Toolbar */}
            {studentListModal.students.length > 0 && (
              <div className="px-5 py-3 bg-[#e6f1f8]/70 border-b border-gray-200/80 flex items-center justify-between gap-3 text-[15px]">
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
                    disabled={stages.stage4 || selectedStudentKeys.length === 0}
                    value={batchTargetRoomId}
                    onChange={e => setBatchTargetRoomId(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[15px] font-bold text-[#0f172a] focus:ring-2 focus:ring-[#00A651] focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
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
                    disabled={stages.stage4 || selectedStudentKeys.length === 0 || !batchTargetRoomId}
                    onClick={handleApplyBatchTransfer}
                    className="px-3.5 py-1.5 bg-[#005691] hover:bg-indigo-700 text-white rounded-lg font-bold text-[15px] shadow-2xs transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
                  >
                    선택 학생 일괄 이동
                  </button>
                  <button
                    disabled={stages.stage4 || selectedStudentKeys.length === 0}
                    onClick={handleMoveSelectedToWait}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold text-[15px] shadow-2xs transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 flex items-center gap-1"
                    title="선택된 학생들을 대기 상태로 이동시킵니다"
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
                          <td className="py-2 px-2 text-center text-[#0f172a] font-normal text-[13px]">{idx + 1}</td>
                          <td className="py-2 px-2 text-center font-bold text-[#005691]">
                            {st.ban.endsWith('반') ? st.ban : `${st.ban}반`}
                          </td>
                          <td className="py-2 px-2 text-center font-normal text-gray-800">{st.num}번</td>
                          <td className="py-2 px-3 font-bold text-gray-900">{st.name || '-'}</td>
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
                              disabled={stages.stage4}
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
              <div className="text-[15px] text-gray-800 font-bold flex items-center gap-3">
                <span>총 <strong className="text-[#005691]">{studentListModal.students.length}</strong>명</span>
                {selectedStudentKeys.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-[#fee2e2] text-[#005691] rounded-full font-extrabold">
                    {selectedStudentKeys.length}명 선택됨
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  disabled={stages.stage4}
                  onClick={() => handleCommitTransfersAndClose(true)}
                  className="px-5 py-2.5 bg-[#005691] hover:bg-[#005691] text-white rounded-xl text-[15px] font-bold shadow-md transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                >
                  🚀 수기/일괄 이동 적용
                </button>
                <button
                  onClick={() => handleCommitTransfersAndClose(false)}
                  className="px-5 py-2.5 bg-gray-50 hover:bg-slate-300 text-[#0f172a] rounded-xl text-[15px] font-bold transition cursor-pointer"
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
                  const color = getSubjectColor(sub);
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
                      const subColor = getSubjectColor(sub);
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
