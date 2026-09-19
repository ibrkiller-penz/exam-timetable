import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables, buildRooms } from '../../src/domain/baseData';
import { buildStudents } from '../../src/domain/subjects';
import { createInitialTimetable } from '../../src/domain/constants';
import { buildPlacementInfo } from '../../src/domain/placementInfo';
import { subjectBanEntries, slotSummary } from '../../src/domain/placement';
import { autoPlaceSlot, calculateStudentMovement, initSlotStudentPlacements, getStudentListForSlotRoom, sanitizePlacementGrid } from '../../src/domain/autoPlace';

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
});
