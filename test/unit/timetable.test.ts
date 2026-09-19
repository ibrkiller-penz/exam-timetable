import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables } from '../../src/domain/baseData';
import { buildTakers, buildStudents, findCompatGroups } from '../../src/domain/subjects';
import { canSameTime, slotStatus, dayLoad, duplicateSubjects } from '../../src/domain/timetable';
import { createInitialDays, createInitialTimes, createInitialTimetable } from '../../src/domain/constants';
import { recommendIdealTimetable } from '../../src/domain/recommendTimetable';
import { slotKey, DayIdx, PeriodIdx } from '../../src/domain/types';

describe('timetable', () => {
  it('detects conflicting subjects', async () => {
    const rows = (await parseNeisFile(makeNeisWorkbook(makeNeisRows()))).rows;
    const { subjectSummary } = buildSubjectTables(rows, 1);
    const takers = buildTakers(rows, subjectSummary);

    expect(canSameTime(['공통국어2(4)', '공통수학2(4)'], takers)).toBe(false);
    expect(canSameTime(['한국사(3)', '정보(2)'], takers)).toBe(true);
  });

  it('checks slotStatus and ensures ideal recommendation works with 3 periods without placing in periods 4 and 5', async () => {
    const rows = (await parseNeisFile(makeNeisWorkbook(makeNeisRows()))).rows;
    const { subjectSummary } = buildSubjectTables(rows, 1);
    const takers = buildTakers(rows, subjectSummary);
    const students = buildStudents(rows, subjectSummary);
    const days = createInitialDays();
    days[0].date = '2026-10-12';
    const times = createInitialTimes();
    // Configure only 3 periods per day
    for (const t of times) {
      if (t.period <= 3) {
        t.time = `Period ${t.period}`;
      } else {
        t.time = null;
      }
    }

    const result = recommendIdealTimetable(subjectSummary, takers, students, [1, 2, 3, 4], times);
    
    // Check that NO subjects are placed in inactive periods 4 and 5
    for (const d of [1, 2, 3, 4]) {
      expect(result.timetable[slotKey(d as DayIdx, 4)].subjects).toHaveLength(0);
      expect(result.timetable[slotKey(d as DayIdx, 5)].subjects).toHaveLength(0);
    }
    
    // All subjects are placed
    expect(result.unplacedSubjects).toHaveLength(0);
    expect(result.maxDailyExamsForAnyStudent).toBeLessThanOrEqual(2);
  });

  it('guarantees 0 unplaced subjects on real school datasets', async () => {
    const fs = require('fs');
    const path = require('path');
    const XLSX = require('xlsx');

    const realFiles = [
      'C:\\Users\\pc\\Desktop\\안티그래비티 결과\\시험 시간표 소스\\학생편성현황(2026학년도  2학기  2)이름삭제.xlsx',
      'C:\\Users\\pc\\Desktop\\안티그래비티 결과\\시험 시간표 소스\\학생편성현황(2026학년도  2학기  3)이름삭제.xlsx'
    ];

    for (const f of realFiles) {
      if (!fs.existsSync(f)) continue;
      const buf = fs.readFileSync(f);
      const { rows } = parseNeisFile(new Uint8Array(buf));
      const { subjectSummary } = buildSubjectTables(rows, 1);
      const takers = buildTakers(rows, subjectSummary);
      const students = buildStudents(rows, subjectSummary);

      const maxSubsPerStudent = Math.max(...students.map(s => s.subjects.length));
      console.log(`\n>>> File: ${path.basename(f)}`);
      console.log(`Total students: ${students.length}, Total subjects: ${subjectSummary.length}`);
      console.log(`Max subjects any student takes: ${maxSubsPerStudent}`);
      
      const subCounts = new Map<number, number>();
      for (const st of students) {
        subCounts.set(st.subjects.length, (subCounts.get(st.subjects.length) || 0) + 1);
      }
      console.log('Student subject count distribution:', Array.from(subCounts.entries()).sort((a,b) => b[0] - a[0]));
      
      const compat = findCompatGroups(subjectSummary, takers, students.length);
      console.log(`Compat groups found: ${compat.groups.length}`);
      console.log(`Max group size:`, Math.max(...compat.groups.map(g => g.subjects.length)));
      const group4 = compat.groups.filter(g => g.subjects.length >= 4);
      console.log(`Groups with size >= 4: ${group4.length}`);
      const group3 = compat.groups.filter(g => g.subjects.length === 3);
      console.log(`Groups with size 3: ${group3.length}`);
      const group2 = compat.groups.filter(g => g.subjects.length === 2);
      console.log(`Groups with size 2: ${group2.length}`);

      for (const dayCount of [3, 4, 5]) {
        const activeDays = Array.from({ length: dayCount }, (_, i) => (i + 1) as DayIdx);
        const times = createInitialTimes();
        for (const t of times) {
          if (t.period <= 3 && t.day <= dayCount) {
            t.time = `09:00 ~ 10:00`;
          } else {
            t.time = null;
          }
        }

        const res = recommendIdealTimetable(subjectSummary, takers, students, activeDays, times);
        // Verify ZERO conflicts in every slot
        for (const slot of Object.values(res.timetable)) {
          if (slot.subjects.length > 1) {
            expect(canSameTime(slot.subjects, takers)).toBe(true);
          }
        }
        let usedSlotsCount = 0;
        for (const sKey of Object.keys(res.timetable)) {
          if (res.timetable[sKey].subjects.length > 0) usedSlotsCount++;
        }
        const totalActiveSlots = dayCount * 3;
        const emptySlotsCount = totalActiveSlots - usedSlotsCount;
        console.log(`DayCount: ${dayCount} (Total ${totalActiveSlots}시간), Placed: ${res.placedCount}/${subjectSummary.length}, Used: ${usedSlotsCount}시간, Empty (자습/빈시간): ${emptySlotsCount}시간`);
        for (const d of activeDays) {
          const row = [1,2,3].map(p => {
            const subs = res.timetable[slotKey(d, p as PeriodIdx)]?.subjects || [];
            return `P${p}: ${subs.length > 0 ? `[${subs.join(', ')}]` : '(자습/빈시간)'}`;
          }).join(' | ');
          console.log(`  Day ${d}: ${row}`);
        }
      }
    }
  });
});
