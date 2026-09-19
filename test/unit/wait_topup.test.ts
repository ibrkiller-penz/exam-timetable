import { describe, it, expect } from 'vitest';
import { initSlotStudentPlacements } from '../../src/domain/autoPlace';
import { ExamRoom, PlacementSlot, Student, SubjectBanEntry } from '../../src/domain/types';

/**
 * 실제로 겪은 문제: 5일차 2교시에서 대기 2명이 끝까지 배치되지 않았습니다.
 * 대기실이 받는 인원을 칸에 적힌 숫자로 정하고 있어서, 담당자가 새로 연
 * 빈 대기실(`대기 - 0명`)은 몫이 0이라 아무도 받지 못했습니다.
 */
describe('대기실에 자리가 남으면 학생을 떠 있게 두지 않는다', () => {
  const sub = '생활과 윤리(4)';

  // 응시 2명, 대기 4명.
  const students: Student[] = [
    ...Array.from({ length: 2 }, (_, i) => ({
      grade: '3', ban: '1반', num: i + 1, name: `응시${i + 1}`, subjects: [sub],
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      grade: '3', ban: '2반', num: i + 1, name: `대기${i + 1}`, subjects: ['다른과목(4)'],
    })),
  ];

  const rooms: ExamRoom[] = [
    { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 2, maxClassSize: 2, capacity: 2 },
    { id: 'r2', roomName: '3-2', banName: '2반', stuCount: 2, maxClassSize: 2, capacity: 2 },
    { id: 'r3', roomName: '3-3', banName: '3반', stuCount: 5, maxClassSize: 5, capacity: 5 },
  ];

  const entries = new Map<string, SubjectBanEntry>([
    [`${sub}-1반`, { key: `${sub}-1반`, subject: sub, room: '1반', stuCount: 2, subjectSeq: 1, index: 1 }],
  ]);

  const slots: PlacementSlot[] = [{
    index: 1, day: 5 as any, period: 2 as any, title: '5일차 2교시',
    subjects: [sub], banCounts: [1], banCountTotal: 1, takers: 2, nonTakers: 4,
  }];

  it('빈 대기실(대기 - 0명)도 남은 학생을 받는다', () => {
    // r2는 2명까지만 적혀 있고, r3는 담당자가 방금 연 빈 대기실입니다.
    const row = { r1: `${sub}-1반`, r2: '대기 - 2명', r3: '대기 - 0명' };
    const sp = initSlotStudentPlacements(1, row, slots, rooms, entries, students);

    const unplaced = students.filter(st => !sp[`${st.ban}-${st.num}`]);
    expect(unplaced.map(s => s.name)).toEqual([]);

    // 적힌 몫(2명)을 채우고 남은 2명이 빈 대기실로 갑니다.
    expect(students.filter(st => sp[`${st.ban}-${st.num}`] === 'r3').length).toBe(2);
  });

  it('정원을 모두 더해도 모자라면 미배치로 남긴다', () => {
    const tight: ExamRoom[] = [
      rooms[0],
      { id: 'r2', roomName: '3-2', banName: '2반', stuCount: 3, maxClassSize: 3, capacity: 3 },
    ];
    const row = { r1: `${sub}-1반`, r2: '대기 - 3명' };
    const sp = initSlotStudentPlacements(1, row, slots, tight, entries, students);

    const unplaced = students.filter(st => !sp[`${st.ban}-${st.num}`]);
    expect(unplaced.length).toBe(1); // 대기 4명 중 3명만 들어갑니다.
  });
});
