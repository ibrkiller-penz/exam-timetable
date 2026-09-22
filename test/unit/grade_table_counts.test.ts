import { describe, it, expect } from 'vitest';
import { buildGradeTable } from '../../src/domain/reports/gradeTable';
import { subjectBanEntries } from '../../src/domain/placement';
import { ExamRoom, PlacementSlot, Student } from '../../src/domain/types';

/**
 * 학년 배치표(1번)의 인원.
 *
 * 예전에는 칸 이름만 보고 적었습니다. 학번순으로 나눈 칸(`수학(4)-1실`)은
 * 편성현황에 없어 인원이 점으로 빠지고 인원계까지 어긋났습니다.
 * 이제 실제로 앉은 사람을 셉니다.
 */
const rooms: ExamRoom[] = [
  { id: 'r1', banName: '1반', stuCount: 30, maxClassSize: 30, roomName: '3-1', capacity: 30 },
  { id: 'r2', banName: '2반', stuCount: 30, maxClassSize: 30, roomName: '3-2', capacity: 30 },
];
const days = [{ day: 1 as never, date: '2026-07-01' }];
const times = [{ day: 1 as never, period: 1 as never, time: '09:00~10:00' }];
const slots: PlacementSlot[] = [{
  index: 1, day: 1 as never, period: 1 as never, title: '1일차 1교시',
  subjects: ['수학(4)'], banCounts: [], banCountTotal: 0, takers: 30, nonTakers: 0,
}];
const students: Student[] = Array.from({ length: 30 }, (_, i) => ({
  grade: '3', ban: '1반', num: i + 1, name: '', subjects: ['수학(4)'],
}));
const entries = subjectBanEntries([{ subject: '수학(4)', room: 'g1', stuCount: 30, subjectSeq: 1 }]);

describe('학년 배치표 인원', () => {
  it('학번순으로 나눈 칸도 인원과 인원계가 나온다', () => {
    const placement = { 1: { r1: '수학(4)-1실', r2: '수학(4)-2실' } };
    const sp = { 1: Object.fromEntries(students.map((st, i) => [`${st.ban}-${st.num}`, i < 16 ? 'r1' : 'r2'])) };

    const 옛것 = buildGradeTable(rooms, days, times, slots, placement, entries);
    expect(옛것.rows[0].cells.map(c => c.stuCount)).toEqual(['·', '·']);   // 점으로 빠지던 것
    expect(옛것.rows[0].totalStuCount).toBe(0);

    const 새것 = buildGradeTable(rooms, days, times, slots, placement, entries, undefined, students, sp);
    expect(새것.rows[0].cells.map(c => c.stuCount)).toEqual([16, 14]);
    expect(새것.rows[0].totalStuCount).toBe(30);
  });

  it('손으로 옮긴 뒤에도 실제 인원을 보여 준다', () => {
    // 칸은 30명짜리 분반인데 실제로는 한 명이 옆 방으로 옮겨 갔습니다.
    const placement = { 1: { r1: '수학(4)-1반', r2: '대기 - 0명' } };
    const sp = { 1: Object.fromEntries(students.map((st, i) => [`${st.ban}-${st.num}`, i < 29 ? 'r1' : 'r2'])) };

    const 옛것 = buildGradeTable(rooms, days, times, slots, placement, entries);
    expect(옛것.rows[0].cells[0].stuCount).toBe(30);    // 편성현황의 분반 인원
    expect(옛것.rows[0].cells[1].stuCount).toBe(0);     // 대기 칸 이름의 숫자

    const 새것 = buildGradeTable(rooms, days, times, slots, placement, entries, undefined, students, sp);
    expect(새것.rows[0].cells[0].stuCount).toBe(29);
    expect(새것.rows[0].cells[1].stuCount).toBe(1);
    expect(새것.rows[0].totalStuCount).toBe(30);
  });
});
