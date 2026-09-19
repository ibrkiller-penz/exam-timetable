import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables, buildRooms } from '../../src/domain/baseData';
import { buildStudents } from '../../src/domain/subjects';
import { createInitialTimetable } from '../../src/domain/constants';
import { buildPlacementInfo } from '../../src/domain/placementInfo';
import { subjectBanEntries, slotSummary, cellDerived, hasErrorBaechi } from '../../src/domain/placement';
import { autoPlaceSlot, calculateStudentMovement, initSlotStudentPlacements, getStudentListForSlotRoom, sanitizePlacementGrid } from '../../src/domain/autoPlace';
import { Student, ExamRoom, PlacementSlot, PlacementGrid } from '../../src/domain/types';

describe('placement', () => {
  it('generates placement info and runs auto placement', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 1);
    const rooms = buildRooms(rows, subjectSummary, subjectBans);
    const students = buildStudents(rows, subjectSummary);
    const entries = subjectBanEntries(subjectBans);

    const tt = createInitialTimetable();
    tt['1_1'] = { subjects: ['공통국어2(4)'] };

    const placementSlots = buildPlacementInfo(tt, students, subjectSummary);
    expect(placementSlots.length).toBe(1);

    const placed = autoPlaceSlot(1, rooms[0].id, {}, placementSlots, rooms, entries, students, false);
    const sum = slotSummary(1, placed, placementSlots, entries);
    expect(sum.errorKey).toBe('OK');

    const stats = calculateStudentMovement(placed, placementSlots, rooms, students);
    expect(stats.homeWaitPercentage).toBeGreaterThanOrEqual(0);
  });

  it('tracks student placements and supports moving students between rooms', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 1);
    const rooms = buildRooms(rows, subjectSummary, subjectBans);
    const students = buildStudents(rows, subjectSummary);
    const entries = subjectBanEntries(subjectBans);

    const tt = createInitialTimetable();
    tt['1_1'] = { subjects: ['공통국어2(4)'] };

    const placementSlots = buildPlacementInfo(tt, students, subjectSummary);
    const placed = autoPlaceSlot(1, rooms[0].id, {}, placementSlots, rooms, entries, students, false);

    // 1. Initialize student placements
    const slotPlacements = initSlotStudentPlacements(1, placed[1] ?? {}, placementSlots, rooms, entries, students);
    expect(Object.keys(slotPlacements).length).toBeGreaterThan(0);

    // 2. Query students in room 0
    const room0Students = getStudentListForSlotRoom(1, rooms[0].id, placed, placementSlots, rooms, entries, students, slotPlacements);
    expect(room0Students.students.length).toBeGreaterThan(0);

    const firstStudent = room0Students.students[0];
    const stKey = `${firstStudent.ban}-${firstStudent.num}`;
    const targetRoom = rooms[1];

    // 3. Move first student to room 1
    const updatedSlotPlacements = { ...slotPlacements, [stKey]: targetRoom.id };

    // 4. Verify student is removed from room 0 and present in room 1
    const afterRoom0 = getStudentListForSlotRoom(1, rooms[0].id, placed, placementSlots, rooms, entries, students, updatedSlotPlacements);
    const afterRoom1 = getStudentListForSlotRoom(1, targetRoom.id, placed, placementSlots, rooms, entries, students, updatedSlotPlacements);

    expect(afterRoom0.students.some(s => `${s.ban}-${s.num}` === stKey)).toBe(false);
    expect(afterRoom1.students.some(s => `${s.ban}-${s.num}` === stKey)).toBe(true);
  });

  it('sanitizes legacy extra room labels and guarantees extra rooms never return 17 students from another class', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 1);
    const rooms = buildRooms(rows, subjectSummary, subjectBans);
    const students = buildStudents(rows, subjectSummary);
    const entries = subjectBanEntries(subjectBans);

    const tt = createInitialTimetable();
    tt['1_1'] = { subjects: ['공통국어2(4)'] };
    const placementSlots = buildPlacementInfo(tt, students, subjectSummary);

    const extraRoom = rooms.find(r => !r.banName || r.banName === '') || {
      id: 'room_extra_1',
      roomName: '별도실1',
      banName: '',
      capacity: 30,
      maxClassSize: 0,
      stuCount: 0,
    };

    // Simulate bad legacy grid where extra room was mistakenly labeled "대기1반 - 1명"
    const legacyGrid = {
      1: {
        [extraRoom.id]: '대기1반 - 1명',
      },
    };

    // 1. Verify sanitization cleans it to "대기 - 1명"
    const cleanedGrid = sanitizePlacementGrid(legacyGrid, [extraRoom]);
    expect(cleanedGrid[1][extraRoom.id]).toBe('대기 - 1명');

    // Add a non-taker student so nonTakers has students to place
    const testStudents = [
      ...students,
      { grade: '1', ban: '2반', num: 99, name: '대기학생', subjects: [] },
    ];

    // 2. Verify getStudentListForSlotRoom returns exactly 1 student, NOT 17 students from class 1
    const result = getStudentListForSlotRoom(1, extraRoom.id, cleanedGrid, placementSlots, [extraRoom], entries, testStudents);
    expect(result.students.length).toBe(1);
    expect(result.students[0].name).toBe('대기학생');
  });

  it('supports split/added rooms (4반) without throwing wrong subject error and distributes students evenly', () => {
    // 91 students taking '심화 영어 독해 Ⅰ (4)'
    const sub = '심화 영어 독해 Ⅰ (4)';
    const subStudents: Student[] = Array.from({ length: 91 }, (_, i) => ({
      grade: '3',
      ban: `${(i % 3) + 1}반`,
      num: Math.floor(i / 3) + 1,
      name: `학생${i + 1}`,
      subjects: [sub],
    }));

    const mockRooms: ExamRoom[] = [
      { id: 'r1', roomName: '3-1', capacity: 28, maxClassSize: 28, banName: '1반' },
      { id: 'r2', roomName: '3-2', capacity: 28, maxClassSize: 28, banName: '2반' },
      { id: 'r3', roomName: '3-3', capacity: 28, maxClassSize: 28, banName: '3반' },
      { id: 'r4', roomName: '3-4', capacity: 28, maxClassSize: 28, banName: '4반' },
    ];

    // Static NEIS entries only had 3 bans
    const entries = new Map<string, any>([
      [`${sub}-1반`, { key: `${sub}-1반`, subject: sub, room: '1반', stuCount: 31, index: 1 }],
      [`${sub}-2반`, { key: `${sub}-2반`, subject: sub, room: '2반', stuCount: 30, index: 2 }],
      [`${sub}-3반`, { key: `${sub}-3반`, subject: sub, room: '3반', stuCount: 30, index: 3 }],
    ]);

    const pSlots: PlacementSlot[] = [{
      index: 1,
      day: 1 as any,
      period: 1 as any,
      title: '1일차 1교시',
      subjects: [sub],
      banCounts: [3],
      banCountTotal: 3,
      takers: 91,
      nonTakers: 0,
    }];

    // Grid has 4 rooms: 1반, 2반, 3반, and newly added 4반
    const grid: PlacementGrid = {
      1: {
        r1: `${sub}-1반`,
        r2: `${sub}-2반`,
        r3: `${sub}-3반`,
        r4: `${sub}-4반`,
      },
    };

    // 1. cellDerived for 4반 should return '4반', not '오류'
    const d = cellDerived(`${sub}-4반`, entries);
    expect(d.classRoom).toBe('4반');

    // 2. initSlotStudentPlacements should evenly distribute 91 students into 23, 23, 23, 22
    const slotPlacements = initSlotStudentPlacements(1, grid[1], pSlots, mockRooms, entries, subStudents);
    const countR1 = Object.values(slotPlacements).filter(id => id === 'r1').length;
    const countR2 = Object.values(slotPlacements).filter(id => id === 'r2').length;
    const countR3 = Object.values(slotPlacements).filter(id => id === 'r3').length;
    const countR4 = Object.values(slotPlacements).filter(id => id === 'r4').length;

    expect(countR1 + countR2 + countR3 + countR4).toBe(91);
    expect([countR1, countR2, countR3, countR4].sort((a, b) => b - a)).toEqual([23, 23, 23, 22]);

    // 3. hasErrorBaechi must NOT throw
    expect(() => {
      hasErrorBaechi(grid, pSlots, mockRooms, entries, { 1: slotPlacements }, subStudents);
    }).not.toThrow();

    // 4. slotSummary should report OK and 0 unplaced
    const sum = slotSummary(1, grid, pSlots, entries, { 1: slotPlacements }, subStudents);
    expect(sum.errorKey).toBe('OK');
    expect(sum.remaining.takers).toBe(0);
  });
});
