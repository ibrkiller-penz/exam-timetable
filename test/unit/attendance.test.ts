import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables, buildRooms } from '../../src/domain/baseData';
import { buildStudents } from '../../src/domain/subjects';
import { createInitialTimetable } from '../../src/domain/constants';
import { buildPlacementInfo } from '../../src/domain/placementInfo';
import { subjectBanEntries } from '../../src/domain/placement';
import { autoPlaceSlot } from '../../src/domain/autoPlace';
import { buildAttendance, seatBySeq, seatRandom, hasErrorSeat } from '../../src/domain/attendance';

describe('attendance', () => {
  it('builds attendance records and assigns seats', async () => {
    const rows = (await parseNeisFile(makeNeisWorkbook(makeNeisRows()))).rows;
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 1);
    const rooms = buildRooms(rows, subjectSummary, subjectBans);
    const students = buildStudents(rows, subjectSummary);
    const entries = subjectBanEntries(subjectBans);

    const tt = createInitialTimetable();
    tt['1_1'] = { subjects: ['공통국어2(4)'] };
    const placementSlots = buildPlacementInfo(tt, students, subjectSummary);
    const placement = autoPlaceSlot(1, rooms[0].id, {}, placementSlots, rooms, entries, students, false);

    const { rows: attRows } = buildAttendance(rows, students, rooms, placementSlots, placement, entries);
    expect(attRows.length).toBe(302);

    const seated = seatBySeq(attRows);
    expect(seated[0].seat).toBe(1);

    const randomized = seatRandom(seated, () => 0.5);
    expect(randomized.length).toBe(302);
  });
});
