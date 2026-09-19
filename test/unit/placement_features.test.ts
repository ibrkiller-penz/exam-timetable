import { describe, it, expect } from 'vitest';
import { autoPlaceSlot, resetAndAutoPlaceSlot, initSlotStudentPlacements, distributeWaitToRooms, addExamRoomFromWait, shrinkExamRoomToWait } from '../../src/domain/autoPlace';
import { verifySlotIntegrity } from '../../src/domain/integrity';
import { slotSummary } from '../../src/domain/placement';
import { ExamRoom, PlacementSlot, Student, SubjectBanEntry, PlacementGrid } from '../../src/domain/types';

describe('Step 7 Placement Enhancements (7대 핵심 개선 기능 검증)', () => {
  // Mock Rooms (정원 30명 일반실 2개, 정원 30명 별도실 1개)
  const mockRooms: ExamRoom[] = [
    { id: 'room_1', roomName: '1반', banName: '1반', capacity: 30, maxClassSize: 30, stuCount: null },
    { id: 'room_2', roomName: '2반', banName: '2반', capacity: 30, maxClassSize: 30, stuCount: null },
    { id: 'room_extra', roomName: '별도실1', banName: '별도실1', capacity: 30, maxClassSize: 30, stuCount: null },
  ];

  // Mock Students (1반 31명: 정원 30명 초과 케이스)
  const mockStudents: Student[] = Array.from({ length: 31 }, (_, i) => ({
    grade: 3,
    ban: '1반',
    num: i + 1,
    name: `학생${i + 1}`,
    subjects: ['국어'],
  }));

  // Mock Placement Slots
  const mockSlots: PlacementSlot[] = [
    { index: 1, day: 1, period: 1, title: '1일차 1교시', subjects: ['국어'], banCounts: [1], banCountTotal: 1, maxStuCount: 31 },
    { index: 2, day: 1, period: 2, title: '1일차 2교시', subjects: ['수학'], banCounts: [1], banCountTotal: 1, maxStuCount: 31 },
  ];

  const mockEntries = new Map<string, SubjectBanEntry>([
    ['국어-1반', { key: '국어-1반', subject: '국어', ban: '1반', stuCount: 31, index: 1, room: '1반' }],
    ['수학-1반', { key: '수학-1반', subject: '수학', ban: '1반', stuCount: 31, index: 1, room: '1반' }],
  ]);

  it('1. 분반은 통째로 유지: 31명 분반은 정원 30인 고사실에도 쪼개지 않고 함께 앉힌다', () => {
    // 예전에는 정원을 넘지 않도록 30명만 넣고 1명을 다른 방으로 보냈습니다.
    // 그러면 남은 1명이 다음 방으로 밀리면서 뒤따르는 분반이 모두 어긋납니다.
    // 분반을 통째로 유지하고, 좌석을 넘는 것은 화면에 '강제배정'으로 드러냅니다.
    const slotRow = {
      room_1: '국어-1반',
    };

    const studentPlacements = initSlotStudentPlacements(
      1,
      slotRow,
      mockSlots,
      mockRooms,
      mockEntries,
      mockStudents
    );

    const room1Assigned = Object.values(studentPlacements).filter(id => id === 'room_1').length;
    expect(room1Assigned).toBe(31);

    const otherAssigned = Object.values(studentPlacements).filter(id => id && id !== 'room_1');
    expect(otherAssigned.length).toBe(0);
  });

  it('2. 교시별 재배치(resetAndAutoPlaceSlot): 1교시 재배치 시 2교시 배치는 전혀 변경되지 않음', () => {
    const initialPlacement: PlacementGrid = {
      1: { room_1: '국어-1반' },
      2: { room_1: '수학-1반' },
    };

    const res = resetAndAutoPlaceSlot(
      1,
      'room_1',
      initialPlacement,
      mockSlots,
      mockRooms,
      mockEntries,
      mockStudents
    );

    // Slot 2 must remain exactly identical
    expect(res.placement[2]).toEqual({ room_1: '수학-1반' });
    // Slot 1 is re-placed
    expect(res.placement[1]).toBeDefined();
    expect(res.slotStudentPlacements).toBeDefined();
  });

  it('3. 잠긴 고사실(Lock) 보존: 재배치 시 잠긴 고사실은 안전하게 유지됨', () => {
    const initialPlacement: PlacementGrid = {
      1: { room_1: '국어-1반', room_2: '대기 - 10명' },
    };

    const lockedCellsRow = {
      room_2: true, // locked
    };

    const res = resetAndAutoPlaceSlot(
      1,
      'room_1',
      initialPlacement,
      mockSlots,
      mockRooms,
      mockEntries,
      mockStudents,
      undefined,
      false,
      lockedCellsRow
    );

    // Locked room_2 must be preserved
    expect(res.placement[1]?.['room_2']).toBe('대기 - 10명');
  });

  it('4. 대기 분배 알고리즘: 각 방의 수용정원을 절대 초과하지 않음', () => {
    const waitStudents = Array.from({ length: 70 }, (_, i) => ({
      grade: 3,
      ban: '2반',
      num: i + 1,
      name: `대기학생${i + 1}`,
      subjects: [],
    }));

    // Rooms with small capacities (20, 25)
    const smallRooms: ExamRoom[] = [
      { id: 'r1', roomName: '실1', banName: '실1', capacity: 20, maxClassSize: 20, stuCount: null },
      { id: 'r2', roomName: '실2', banName: '실2', capacity: 25, maxClassSize: 25, stuCount: null },
    ];

    const assignments = distributeWaitToRooms(waitStudents, smallRooms);

    const r1Assignment = assignments.find(a => a.room.id === 'r1');
    const r2Assignment = assignments.find(a => a.room.id === 'r2');

    expect(r1Assignment?.count).toBeLessThanOrEqual(20);
    expect(r2Assignment?.count).toBeLessThanOrEqual(25);
  });

  it('5. 대기실을 시험 고사장으로 전환(추가): 인원은 0명으로 비워지고 수동 배치 가능하며 대기 인원은 재배치됨', () => {
    const ethicsSlots: PlacementSlot[] = [
      { index: 1, day: 1, period: 1, title: '1일차 1교시', subjects: ['고전과 윤리(4)', '국어'], banCounts: [1, 1], banCountTotal: 2, maxStuCount: 33, takers: 31, nonTakers: 2 },
    ];

    const ethicsStudents: Student[] = [
      ...Array.from({ length: 31 }, (_, i) => ({
        grade: 3,
        ban: '1반',
        num: i + 1,
        name: `학생${i + 1}`,
        subjects: ['고전과 윤리(4)', '국어'],
      })),
      { grade: 3, ban: '2반', num: 1, name: '대기1', subjects: ['미응시과목'] },
      { grade: 3, ban: '2반', num: 2, name: '대기2', subjects: ['미응시과목'] },
    ];

    const initialPlacement: PlacementGrid = {
      1: {
        room_1: '고전과 윤리(4)-1반',
        room_2: '대기 - 2명',
        room_extra: '대기 - 0명',
      },
    };

    const initialStudentPlacements: Record<number, Record<string, string>> = {
      1: {
        '1반-1': 'room_1',
        '1반-2': 'room_1',
        '2반-1': 'room_2',
        '2반-2': 'room_2',
      },
    };

    const res = addExamRoomFromWait(
      1,
      '고전과 윤리(4)',
      'room_2',
      initialPlacement,
      ethicsSlots,
      mockRooms,
      mockEntries,
      ethicsStudents,
      initialStudentPlacements
    );

    // 1. room_2 becomes new exam room with key "고전과 윤리(4)-2반"
    expect(res.addedRoom.id).toBe('room_2');
    expect(res.placement[1]?.['room_2']).toBe('고전과 윤리(4)-2반');

    // 2. Default examDistributionMode='even' distributes 31 students evenly (16 in room_1, 15 in room_2)
    const room2Assigned = Object.values(res.studentPlacements[1] || {}).filter(id => id === 'room_2').length;
    const room1Assigned = Object.values(res.studentPlacements[1] || {}).filter(id => id === 'room_1').length;
    expect(room1Assigned).toBe(16);
    expect(room2Assigned).toBe(15);
    expect(room1Assigned + room2Assigned).toBe(31);

    // 3. Existing wait students are reassigned to remaining wait room (room_extra)
    expect(res.placement[1]?.['room_extra']).toBeDefined();
  });

  it('6. 고사장 축소: 고사장 인원을 직전 고사장으로 합치고 축소된 방은 대기실로 전환 후 대기 재배치됨', () => {
    const ethicsSlots: PlacementSlot[] = [
      { index: 1, day: 1, period: 1, title: '1일차 1교시', subjects: ['고전과 윤리(4)'], banCounts: [2], banCountTotal: 2, maxStuCount: 2, takers: 2, nonTakers: 0 },
    ];

    const ethicsStudents: Student[] = [
      { grade: 3, ban: '1반', num: 1, name: '학생1', subjects: ['고전과 윤리(4)'] },
      { grade: 3, ban: '1반', num: 2, name: '학생2', subjects: ['고전과 윤리(4)'] },
    ];

    const initialPlacement: PlacementGrid = {
      1: {
        room_1: '고전과 윤리(4)-1반',
        room_2: '고전과 윤리(4)-2반',
        room_extra: '대기 - 0명',
      },
    };

    const initialStudentPlacements: Record<number, Record<string, string>> = {
      1: {
        '1반-1': 'room_1',
        '1반-2': 'room_2', // Student in room_2
      },
    };

    const res = shrinkExamRoomToWait(
      1,
      '고전과 윤리(4)',
      'room_2',
      initialPlacement,
      ethicsSlots,
      mockRooms,
      mockEntries,
      ethicsStudents,
      initialStudentPlacements
    );

    // 1. room_2 was shrunk and merged into room_1
    expect(res.shrunkRoom.id).toBe('room_2');
    expect(res.mergedToRoom?.id).toBe('room_1');

    // 2. Students in room_2 merged into room_1
    expect(res.studentPlacements[1]?.['1반-2']).toBe('room_1');

    // 3. room_2 is freed and becomes part of wait rooms
    expect(res.placement[1]?.['room_2']).not.toBe('고전과 윤리(4)-2반');
  });

  it('7. 인원 무결성 검증: 고사장 추가 시 총원은 절대 증가하지 않으며(총원 불변), 과목별 응시 인원 무결성이 유지됨', () => {
    // 10 students: 5 take '국어', 5 take '대기' (no exam)
    const tenStudents: Student[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ grade: 3, ban: '1반', num: i + 1, name: `국어학생${i + 1}`, subjects: ['국어'] })),
      ...Array.from({ length: 5 }, (_, i) => ({ grade: 3, ban: '1반', num: i + 6, name: `대기학생${i + 6}`, subjects: ['영어'] })),
    ];

    const slot1: PlacementSlot = {
      index: 1, day: 1, period: 1, title: '1일차 1교시', subjects: ['국어'], banCounts: [1], banCountTotal: 1, maxStuCount: 10, takers: 5, nonTakers: 5
    };

    const initialPlacement: PlacementGrid = {
      1: {
        room_1: '국어-1반',
        room_2: '대기 - 5명',
      },
    };

    const initialPlacements: Record<number, Record<string, string>> = {
      1: {
        '1반-1': 'room_1', '1반-2': 'room_1', '1반-3': 'room_1', '1반-4': 'room_1', '1반-5': 'room_1',
        '1반-6': 'room_2', '1반-7': 'room_2', '1반-8': 'room_2', '1반-9': 'room_2', '1반-10': 'room_2',
      },
    };

    // Verify initial integrity
    const repInitial = verifySlotIntegrity(1, initialPlacement, [slot1], mockRooms, tenStudents, initialPlacements[1]);
    expect(repInitial.isValid).toBe(true);
    expect(repInitial.totalPlaced).toBe(10);
    expect(repInitial.placedTakers).toBe(5);
    expect(repInitial.placedNonTakers).toBe(5);

    // Now add an exam room from wait room_extra (or room_2)
    const res = addExamRoomFromWait(
      1,
      '국어',
      'room_2',
      initialPlacement,
      [slot1],
      mockRooms,
      mockEntries,
      tenStudents,
      initialPlacements
    );

    // The new exam room is created with 0 students
    expect(res.newSubjectKey).toBe('국어-2반');
    expect(res.placement[1]?.['room_2']).toBe('국어-2반');

    // Check integrity: total placed cannot exceed total students (10)
    const repAfter = verifySlotIntegrity(1, res.placement, [slot1], mockRooms, tenStudents, res.studentPlacements[1]);
    expect(repAfter.isValid).toBe(true);
    expect(repAfter.totalPlaced).toBeLessThanOrEqual(10);
    expect(repAfter.placedTakers).toBe(5); // Takers still exactly 5!
  });

  it('8. 수강생 불일치 차단: 해당 과목 미수강 학생이 시험실에 배정될 경우 무결성 위반 감지', () => {
    const students: Student[] = [
      { grade: 3, ban: '1반', num: 1, name: '철수', subjects: ['국어'] },
      { grade: 3, ban: '1반', num: 2, name: '영희', subjects: ['수학'] }, // 영희 does NOT take 국어
    ];

    const slot1: PlacementSlot = {
      index: 1, day: 1, period: 1, title: '1일차 1교시', subjects: ['국어'], banCounts: [1], banCountTotal: 1, maxStuCount: 2, takers: 1, nonTakers: 1
    };

    const placement: PlacementGrid = {
      1: { room_1: '국어-1반' },
    };

    // Assigning 영희 (who doesn't take 국어) to 국어-1반
    const invalidPlacements: Record<string, string> = {
      '1반-1': 'room_1',
      '1반-2': 'room_1', // Violation!
    };

    const rep = verifySlotIntegrity(1, placement, [slot1], mockRooms, students, invalidPlacements);
    expect(rep.isValid).toBe(false);
    expect(rep.violations.some(v => v.type === 'subject_mismatch')).toBe(true);
    expect(rep.violations.some(v => v.type === 'subject_exceeded')).toBe(true);
  });

  it('9. slotSummary 실시간 학생 배치 연동: studentPlacements 기반으로 정확한 총원 불변 계산', () => {
    const students: Student[] = [
      { grade: 3, ban: '1반', num: 1, name: '학생1', subjects: ['국어'] },
      { grade: 3, ban: '1반', num: 2, name: '학생2', subjects: ['국어'] },
      { grade: 3, ban: '1반', num: 3, name: '학생3', subjects: ['영어'] },
    ];

    const slot1: PlacementSlot = {
      index: 1, day: 1, period: 1, title: '1일차 1교시', subjects: ['국어'], banCounts: [1], banCountTotal: 1, maxStuCount: 3, takers: 2, nonTakers: 1
    };

    const placement: PlacementGrid = {
      1: { room_1: '국어-1반', room_2: '대기 - 1명' },
    };

    const studentPlacements: Record<number, Record<string, string>> = {
      1: {
        '1반-1': 'room_1',
        '1반-2': 'room_1',
        '1반-3': 'room_2',
      },
    };

    const sum = slotSummary(1, placement, [slot1], mockEntries, studentPlacements, students);
    expect(sum.total.takers).toBe(2);
    expect(sum.total.nonTakers).toBe(1);
    expect(sum.placed.takers).toBe(2);
    expect(sum.placed.nonTakers).toBe(1);
    expect(sum.remaining.takers).toBe(0);
    expect(sum.remaining.nonTakers).toBe(0);
    expect(sum.errorKey).toBe('OK');
  });

  it('10. 별도실 최소화 및 일반실 우선 배정: 고사장 추가 시 일반실 우선 배정 후 잉여 인원만 별도실1 사용, 별도실2~4/9반은 비어있음 유지', () => {
    const rooms: ExamRoom[] = [
      { id: 'r1', roomName: '1반', banName: '1반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 'r2', roomName: '2반', banName: '2반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 'r3', roomName: '3반', banName: '3반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 'r4', roomName: '4반', banName: '4반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 'r5', roomName: '5반', banName: '5반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 'r6', roomName: '6반', banName: '6반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 'r7', roomName: '7반', banName: '7반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 'r8', roomName: '8반', banName: '8반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 'r9', roomName: '9반', banName: '9반', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 're1', roomName: '별도실1', banName: '별도실1', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 're2', roomName: '별도실2', banName: '별도실2', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 're3', roomName: '별도실3', banName: '별도실3', capacity: 28, maxClassSize: 28, stuCount: null },
      { id: 're4', roomName: '별도실4', banName: '별도실4', capacity: 28, maxClassSize: 28, stuCount: null },
    ];

    // 100 wait students from 5반, 6반, 7반, 8반
    const waitStudents: Student[] = Array.from({ length: 100 }, (_, i) => ({
      grade: 3,
      ban: `${5 + Math.floor(i / 25)}반`,
      num: (i % 25) + 1,
      name: `대기학생${i + 1}`,
      subjects: ['타과목'], // Not taking '고전과 윤리(4)'
    }));

    // Exam takers: 100 students in 1~4반
    const examStudents: Student[] = Array.from({ length: 100 }, (_, i) => ({
      grade: 3,
      ban: `${1 + Math.floor(i / 25)}반`,
      num: (i % 25) + 1,
      name: `응시학생${i + 1}`,
      subjects: ['고전과 윤리(4)'],
    }));

    const allStudents = [...examStudents, ...waitStudents];

    const slot: PlacementSlot = {
      index: 1,
      day: 1,
      period: 3,
      title: '1일차 3교시',
      subjects: ['고전과 윤리(4)'],
      banCounts: [4],
      banCountTotal: 4,
      maxStuCount: 200,
      takers: 100,
      nonTakers: 100,
    };

    const initialPlacement: PlacementGrid = {
      1: {
        r1: '고전과 윤리(4)-1반',
        r2: '고전과 윤리(4)-2반',
        r3: '고전과 윤리(4)-3반',
        r4: '고전과 윤리(4)-4반',
        r5: '대기 - 25명',
        r6: '대기 - 25명',
        r7: '대기 - 25명',
        r8: '대기 - 25명',
      },
    };

    const initialStudentPlacements: Record<number, Record<string, string>> = { 1: {} };
    examStudents.slice(0, 25).forEach(s => initialStudentPlacements[1][`${s.ban}-${s.num}`] = 'r1');
    examStudents.slice(25, 50).forEach(s => initialStudentPlacements[1][`${s.ban}-${s.num}`] = 'r2');
    examStudents.slice(50, 75).forEach(s => initialStudentPlacements[1][`${s.ban}-${s.num}`] = 'r3');
    examStudents.slice(75, 100).forEach(s => initialStudentPlacements[1][`${s.ban}-${s.num}`] = 'r4');
    waitStudents.slice(0, 25).forEach(s => initialStudentPlacements[1][`${s.ban}-${s.num}`] = 'r5');
    waitStudents.slice(25, 50).forEach(s => initialStudentPlacements[1][`${s.ban}-${s.num}`] = 'r6');
    waitStudents.slice(50, 75).forEach(s => initialStudentPlacements[1][`${s.ban}-${s.num}`] = 'r7');
    waitStudents.slice(75, 100).forEach(s => initialStudentPlacements[1][`${s.ban}-${s.num}`] = 'r8');

    // Convert r5 (5반) to exam room for '고전과 윤리(4)'
    const res = addExamRoomFromWait(
      1,
      '고전과 윤리(4)',
      'r5',
      initialPlacement,
      [slot],
      rooms,
      mockEntries,
      allStudents,
      initialStudentPlacements
    );

    const slotRow = res.placement[1] || {};

    // 1. r5 became new exam room with even distribution (100 students / 5 rooms = 20 each)
    expect(slotRow['r5']).toBe('고전과 윤리(4)-5반');
    const r5Assigned = Object.values(res.studentPlacements[1] || {}).filter(id => id === 'r5').length;
    expect(r5Assigned).toBe(20);

    // 2. Regular rooms r6, r7, r8 are filled up to their capacity (28 each = 84 total)
    expect(slotRow['r6']).toBe('대기 - 28명');
    expect(slotRow['r7']).toBe('대기 - 28명');
    expect(slotRow['r8']).toBe('대기 - 28명');

    // 3. Overflow 16 students (100 - 84 = 16) are placed ONLY in 별도실1 (re1)
    expect(slotRow['re1']).toBe('대기 - 16명');

    // 4. Unnecessary extra rooms (re2, re3, re4) and 9반 (r9) MUST NOT be used! They must be empty/undefined
    expect(slotRow['re2']).toBeUndefined();
    expect(slotRow['re3']).toBeUndefined();
    expect(slotRow['re4']).toBeUndefined();
    expect(slotRow['r9']).toBeUndefined();

    // 5. Total wait students placed must be exactly 100
    const placedWait = Object.entries(res.studentPlacements[1] || {}).filter(([k, rId]) => {
      const val = slotRow[rId];
      return val && val.startsWith('대기');
    }).length;
    expect(placedWait).toBe(100);

    // 6. Integrity check passes
    const rep = verifySlotIntegrity(1, res.placement, [slot], rooms, allStudents, res.studentPlacements[1]);
    expect(rep.isValid).toBe(true);
  });

  it('11. 2개 과목이 있는 교시에서 고사장 변환 시 선택한 과목으로 고사장이 추가되고 0명으로 비워짐', () => {
    const multiSubjectSlot: PlacementSlot = {
      index: 1,
      day: 1,
      period: 1,
      title: '1일차 1교시',
      subjects: ['기하', '고전과 윤리'],
      banCounts: [2, 2],
      banCountTotal: 4,
      maxStuCount: 28,
      takers: 50,
      nonTakers: 30,
    };

    const testRooms: ExamRoom[] = [
      { id: 'r1', roomName: '1반', banName: '1반', capacity: 28, maxClassSize: 28 },
      { id: 'r2', roomName: '2반', banName: '2반', capacity: 28, maxClassSize: 28 },
      { id: 'r3', roomName: '3반', banName: '3반', capacity: 28, maxClassSize: 28 },
      { id: 'r4', roomName: '4반', banName: '4반', capacity: 28, maxClassSize: 28 },
      { id: 'r5', roomName: '5반', banName: '5반', capacity: 28, maxClassSize: 28 },
    ];

    const testPlacement: PlacementGrid = {
      1: {
        r1: '기하-1반',
        r2: '기하-2반',
        r3: '고전과 윤리-1반',
        r4: '고전과 윤리-2반',
        r5: '대기 - 30명',
      },
    };

    const testStudents: Student[] = [
      ...Array.from({ length: 25 }, (_, i) => ({ grade: 3, ban: '1반', num: i + 1, name: `기하학생${i + 1}`, subjects: ['기하'] })),
      ...Array.from({ length: 25 }, (_, i) => ({ grade: 3, ban: '2반', num: i + 1, name: `윤리학생${i + 1}`, subjects: ['고전과 윤리'] })),
      ...Array.from({ length: 30 }, (_, i) => ({ grade: 3, ban: '3반', num: i + 1, name: `대기학생${i + 1}`, subjects: ['물리'] })),
    ];

    const testStudentPlacements: Record<number, Record<string, string>> = {
      1: {},
    };
    testStudents.slice(0, 25).forEach(s => { testStudentPlacements[1][`${s.ban}-${s.num}`] = 'r1'; });
    testStudents.slice(25, 50).forEach(s => { testStudentPlacements[1][`${s.ban}-${s.num}`] = 'r3'; });
    testStudents.slice(50, 80).forEach(s => { testStudentPlacements[1][`${s.ban}-${s.num}`] = 'r5'; });

    // User chooses '고전과 윤리' for r5
    const res = addExamRoomFromWait(
      1,
      '고전과 윤리',
      'r5',
      testPlacement,
      [multiSubjectSlot],
      testRooms,
      mockEntries,
      testStudents,
      testStudentPlacements,
      undefined,
      'manual_empty',
      'manual_empty'
    );

    // r5 must become 고전과 윤리-3반
    expect(res.placement[1]['r5']).toBe('고전과 윤리-3반');
    // Students in r5 must be 0 (for manual placement)
    const r5Count = Object.values(res.studentPlacements[1]).filter(id => id === 'r5').length;
    expect(r5Count).toBe(0);
  });

  it('12. 대기 균등분배 시 정원 한도 내에서 균등 분배되고, 남은 학생은 미배치로 유지됨', () => {
    const slot: PlacementSlot = {
      index: 1,
      day: 1,
      period: 1,
      title: '1일차 1교시',
      subjects: ['수학'],
      banCounts: [1],
      banCountTotal: 1,
      maxStuCount: 20,
      takers: 20,
      nonTakers: 30,
    };

    // 2 empty waiting rooms, each capacity = 10 (total capacity = 20)
    const rooms: ExamRoom[] = [
      { id: 'w1', roomName: '1반', banName: '1반', capacity: 10, maxClassSize: 10 },
      { id: 'w2', roomName: '2반', banName: '2반', capacity: 10, maxClassSize: 10 },
    ];

    // 25 wait students (exceeds total capacity 20 by 5)
    const waitStudents: Student[] = Array.from({ length: 25 }, (_, i) => ({
      grade: 3,
      ban: '1반',
      num: i + 1,
      name: `대기학생${i + 1}`,
      subjects: ['영어'],
    }));

    // allowOverflow: false
    const assignments = distributeWaitToRooms(waitStudents, rooms, waitStudents, false);

    // Total assigned must NOT exceed room capacities (10 + 10 = 20)
    const totalAssigned = assignments.reduce((s, a) => s + a.count, 0);
    expect(totalAssigned).toBe(20);
    expect(assignments[0].count).toBe(10);
    expect(assignments[1].count).toBe(10);

    // 5 students remain unassigned (미배치)
    const unplacedRemaining = waitStudents.length - totalAssigned;
    expect(unplacedRemaining).toBe(5);
  });

  it('13. 배치금지 설정된 고사실은 자동배치, 단일교시 재배치, 학생 배정 시 완벽히 배제됨', () => {
    const slot: PlacementSlot = {
      index: 1,
      day: 1,
      period: 1,
      title: '1일차 1교시',
      subjects: ['수학'],
      banCounts: [1],
      banCountTotal: 1,
      maxStuCount: 10,
      takers: 10,
      nonTakers: 10,
    };

    const rooms: ExamRoom[] = [
      { id: 'r1', roomName: '1반', banName: '1반', capacity: 15, maxClassSize: 15 },
      { id: 'r2', roomName: '2반', banName: '2반', capacity: 15, maxClassSize: 15 },
      { id: 'r3', roomName: '3반', banName: '3반', capacity: 15, maxClassSize: 15 },
    ];

    const students: Student[] = [
      ...Array.from({ length: 10 }, (_, i) => ({
        grade: 3,
        ban: '1반',
        num: i + 1,
        name: `수학응시생${i + 1}`,
        subjects: ['수학'],
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        grade: 3,
        ban: '1반',
        num: i + 11,
        name: `대기학생${i + 11}`,
        subjects: ['영어'],
      })),
    ];

    // r2 is set to '배치금지'
    const placementWithForbidden: PlacementGrid = {
      1: {
        r2: '배치금지',
      },
    };

    // 1. autoPlaceSlot preserves '배치금지' and does not place any subject in r2
    const placedGrid = autoPlaceSlot(
      1,
      'r1',
      placementWithForbidden,
      [slot],
      rooms,
      mockEntries,
      students,
      false
    );

    expect(placedGrid[1]['r2']).toBe('배치금지');
    // Math subject must be in r1 or r3, never in r2
    expect(placedGrid[1]['r2']).not.toContain('수학');

    // 2. initSlotStudentPlacements does not place any students in r2
    const studentPlacement = initSlotStudentPlacements(
      1,
      placedGrid[1],
      [slot],
      rooms,
      mockEntries,
      students
    );

    const placedInForbidden = Object.values(studentPlacement).filter(rId => rId === 'r2');
    expect(placedInForbidden.length).toBe(0);

    // 3. resetAndAutoPlaceSlot preserves '배치금지'
    const resetRes = resetAndAutoPlaceSlot(
      1,
      'r1',
      placedGrid,
      [slot],
      rooms,
      mockEntries,
      students
    );

    expect(resetRes.placement[1]['r2']).toBe('배치금지');
    const resetForbiddenStudents = Object.values(resetRes.slotStudentPlacements).filter(rId => rId === 'r2');
    expect(resetForbiddenStudents.length).toBe(0);
  });

  it('14. 강제 배정 (정원 초과): 고사장 축소/합병 시 고사실 정원(28석)을 초과하더라도 치명적 무결성 오류 없이 허용됨', () => {
    const slot: PlacementSlot = {
      index: 1,
      day: 1,
      period: 1,
      title: '1일차 1교시',
      subjects: ['물리학'],
      banCounts: [2],
      banCountTotal: 2,
      maxStuCount: 40,
      takers: 40,
      nonTakers: 0,
    };

    const rooms: ExamRoom[] = [
      { id: 'r1', roomName: '1반', capacity: 20, maxClassSize: 20, banName: '1반' },
      { id: 'r2', roomName: '2반', capacity: 20, maxClassSize: 20, banName: '2반' },
    ];

    const students: Student[] = Array.from({ length: 40 }, (_, i) => ({
      grade: 3,
      ban: '1반',
      num: i + 1,
      name: `물리학생${i + 1}`,
      subjects: ['물리학'],
    }));

    const initialPlacement: PlacementGrid = {
      1: { r1: '물리학-1반', r2: '물리학-2반' },
    };

    const initialPlacements: Record<number, Record<string, string>> = {
      1: {},
    };
    // 20 students in r1, 20 students in r2
    students.slice(0, 20).forEach(st => {
      initialPlacements[1][`${st.ban}-${st.num}`] = 'r1';
    });
    students.slice(20).forEach(st => {
      initialPlacements[1][`${st.ban}-${st.num}`] = 'r2';
    });

    // Shrink r2 into r1: r1 will now have 40 students (> 20 capacity, forced placement)
    const res = shrinkExamRoomToWait(
      1,
      '물리학',
      'r2',
      initialPlacement,
      [slot],
      rooms,
      mockEntries,
      students,
      initialPlacements
    );

    expect(res.shrunkRoom.id).toBe('r2');
    expect(res.mergedToRoom?.id).toBe('r1');

    // All 40 students merged into r1 (forced placement)
    const r1Assigned = Object.values(res.studentPlacements[1]).filter(id => id === 'r1').length;
    expect(r1Assigned).toBe(40);

    // Total integrity invariant preserved: exactly 40 students placed
    const report = verifySlotIntegrity(1, res.placement, [slot], rooms, students, res.studentPlacements[1]);
    expect(report.totalPlaced).toBe(40);
    expect(report.takersTotal).toBe(40);
    // room_capacity_exceeded is reported as violation for orange styling
    expect(report.violations.some(v => v.type === 'room_capacity_exceeded')).toBe(true);
    // Fatal violations (total_exceeded, subject_mismatch, etc.) must NOT exist
    const fatal = report.violations.filter(v => v.type !== 'room_capacity_exceeded');
    expect(fatal.length).toBe(0);
  });
});

