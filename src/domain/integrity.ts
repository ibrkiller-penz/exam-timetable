import { PlacementGrid, PlacementSlot, ExamRoom, Student, isWaitCell } from './types';

export interface IntegrityViolation {
  type: 'total_exceeded' | 'subject_exceeded' | 'subject_mismatch' | 'wait_exceeded' | 'room_capacity_exceeded' | 'duplicate_assignment';
  message: string;
  details?: any;
}

export interface SlotIntegrityReport {
  isValid: boolean;
  slotIndex: number;
  totalStudents: number;
  totalPlaced: number;
  unplacedCount: number;
  takersTotal: number;
  placedTakers: number;
  remainingTakers: number;
  nonTakersTotal: number;
  placedNonTakers: number;
  remainingNonTakers: number;
  violations: IntegrityViolation[];
}

/**
 * 특정 교시(slotIndex)의 학생 배치 및 고사실 배치의 총원 및 수강생 무결성을 정밀 검증합니다.
 * 1. 전체 학생 수(총원) 불변성 검증: 배치 인원이 총원을 초과할 수 없음.
 * 2. 과목별 응시 인원 검증: 과목별 배정 인원이 실제 과목 수강생 총원을 초과할 수 없음.
 * 3. 과목 수강생 일치 검증: 해당 과목을 수강하지 않는 학생이 해당 과목 시험실에 배정될 수 없음.
 * 4. 미응시 대기 인원 검증: 대기실 배정 인원이 미응시자 총원을 초과할 수 없음.
 * 5. 고사실 수용 정원 검증: 각 고사실 배정 인원이 수용 정원을 초과할 수 없음.
 */
export function verifySlotIntegrity(
  slotIndex: number,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  students: Student[],
  slotPlacements?: Record<string, string>
): SlotIntegrityReport {
  const ps = placementSlots.find(s => s.index === slotIndex);
  const totalStudents = students.length;
  const violations: IntegrityViolation[] = [];

  if (!ps) {
    return {
      isValid: true,
      slotIndex,
      totalStudents,
      totalPlaced: 0,
      unplacedCount: totalStudents,
      takersTotal: 0,
      placedTakers: 0,
      remainingTakers: 0,
      nonTakersTotal: 0,
      placedNonTakers: 0,
      remainingNonTakers: 0,
      violations: [],
    };
  }

  const slotRow = placement[slotIndex] || {};
  const slotP = slotPlacements || {};
  const slotSubjects = ps.subjects;

  // 1. Student-level categorization
  let placedTakers = 0;
  let placedNonTakers = 0;
  let unplacedCount = 0;

function matchSubject(studentSubjects: string[], examSubject: string): boolean {
  const cleanExam = examSubject.replace(/\s*\(\d+\)$/, '').trim();
  return studentSubjects.some(sub => {
    const cleanStudent = sub.replace(/\s*\(\d+\)$/, '').trim();
    return cleanStudent === cleanExam || sub === examSubject;
  });
}

  // Track counts per subject
  const subjectPlacedCounts: Record<string, number> = {};
  const subjectEnrolledCounts: Record<string, number> = {};
  slotSubjects.forEach(sub => {
    subjectPlacedCounts[sub] = 0;
    subjectEnrolledCounts[sub] = students.filter(st => matchSubject(st.subjects, sub)).length;
  });

  // Track counts per room
  const roomAssignedCounts: Record<string, number> = {};
  rooms.forEach(r => {
    roomAssignedCounts[r.id] = 0;
  });

  // Check each student
  for (const st of students) {
    const stKey = `${st.ban}-${st.num}`;
    const rId = slotP[stKey];

    if (!rId || !slotRow[rId]) {
      unplacedCount++;
      continue;
    }

    const cellVal = slotRow[rId];
    if (cellVal === '배치금지') {
      unplacedCount++;
      violations.push({
        type: 'room_capacity_exceeded',
        message: `[${st.name || stKey}] 학생이 배치금지로 설정된 고사실에 배정되었습니다.`,
      });
      continue;
    }

    roomAssignedCounts[rId] = (roomAssignedCounts[rId] || 0) + 1;

    if (isWaitCell(cellVal)) {
      placedNonTakers++;
    } else {
      placedTakers++;
      const subjectName = cellVal.split('-')[0];

      // Check: Does student actually take this subject?
      if (!matchSubject(st.subjects, subjectName)) {
        violations.push({
          type: 'subject_mismatch',
          message: `[${st.name || stKey}] 학생은 [${subjectName}] 과목 수강생이 아닌데 해당 시험실에 배정되었습니다.`,
          details: { student: st, assignedSubject: subjectName, roomId: rId },
        });
      }

      const matchingSub = slotSubjects.find(sub => matchSubject([sub], subjectName));
      if (matchingSub && subjectPlacedCounts[matchingSub] !== undefined) {
        subjectPlacedCounts[matchingSub]++;
      }
    }
  }

  const totalPlaced = placedTakers + placedNonTakers;

  // Check 1: Total Placed vs Total Students
  if (totalPlaced > totalStudents) {
    violations.push({
      type: 'total_exceeded',
      message: `배치된 총원(${totalPlaced}명)이 전체 학생 수(${totalStudents}명)를 초과했습니다.`,
      details: { totalPlaced, totalStudents },
    });
  }

  // Check 2: Per-Subject Total Exceeded
  for (const sub of slotSubjects) {
    const placed = subjectPlacedCounts[sub] || 0;
    const enrolled = subjectEnrolledCounts[sub] || 0;
    if (placed > enrolled) {
      violations.push({
        type: 'subject_exceeded',
        message: `[${sub}] 과목의 고사장 배정 인원(${placed}명)이 실제 수강생 총원(${enrolled}명)을 초과했습니다.`,
        details: { subject: sub, placed, enrolled },
      });
    }
  }

  // Check 3: Wait Students Total Exceeded
  if (placedNonTakers > ps.nonTakers) {
    violations.push({
      type: 'wait_exceeded',
      message: `대기실에 배정된 인원(${placedNonTakers}명)이 전체 미응시 대기학생(${ps.nonTakers}명)을 초과했습니다.`,
      details: { placedNonTakers, nonTakersTotal: ps.nonTakers },
    });
  }

  // Check 4: Room Capacity Exceeded
  for (const r of rooms) {
    if (!r.roomName || r.roomName === '0') continue;
    const assigned = roomAssignedCounts[r.id] || 0;
    const cap = r.capacity && r.capacity > 0 ? r.capacity : 28;
    if (assigned > cap) {
      violations.push({
        type: 'room_capacity_exceeded',
        message: `[${r.roomName}] 고사장의 정원(${cap}명)을 초과(${assigned}명)했습니다.`,
        details: { room: r, assigned, cap },
      });
    }
  }

  return {
    isValid: violations.length === 0,
    slotIndex,
    totalStudents,
    totalPlaced,
    unplacedCount,
    takersTotal: ps.takers,
    placedTakers,
    remainingTakers: ps.takers - placedTakers,
    nonTakersTotal: ps.nonTakers,
    placedNonTakers,
    remainingNonTakers: ps.nonTakers - placedNonTakers,
    violations,
  };
}

/**
 * 인원 무결성을 검증하고 위반 사항이 있을 경우 즉시 Error를 throw합니다.
 * @param allowCapacityExceeded 강제 배정 허용 여부 (기본값 true: 정원 초과 강제 배정 허용, 고사실은 주황색으로 표시)
 */
export function assertSlotIntegrity(
  slotIndex: number,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  students: Student[],
  slotPlacements?: Record<string, string>,
  allowCapacityExceeded: boolean = true
): void {
  const report = verifySlotIntegrity(slotIndex, placement, placementSlots, rooms, students, slotPlacements);
  const fatalViolations = report.violations.filter(v =>
    allowCapacityExceeded ? v.type !== 'room_capacity_exceeded' : true
  );
  if (fatalViolations.length > 0) {
    throw new Error(`[인원 무결성 오류] ${fatalViolations[0].message}`);
  }
}
