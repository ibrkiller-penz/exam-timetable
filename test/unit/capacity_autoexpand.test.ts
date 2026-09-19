import { describe, it, expect } from 'vitest';
import { autoPlaceSlot, initSlotStudentPlacements } from '../../src/domain/autoPlace';
import { ExamRoom, PlacementSlot, Student, SubjectBanEntry } from '../../src/domain/types';

/**
 * 응시자가 고사장 정원 총합보다 많을 때 자동배치가 고사장을 더 쓰는지 확인합니다.
 * 실제로 겪은 문제: 91명 / 3실 × 24석 = 72석이라 22명이 미배치로 남았습니다.
 */
describe('정원이 모자라면 고사장을 자동으로 더 쓴다', () => {
  const sub = '심화 영어 독해Ⅰ(4)';

  const students: Student[] = [
    // 91명은 이 과목 응시, 72명은 미응시(대기)
    ...Array.from({ length: 91 }, (_, i) => ({
      grade: '3',
      ban: `${(i % 7) + 1}반`,
      num: Math.floor(i / 7) + 1,
      name: `응시${i + 1}`,
      subjects: [sub],
    })),
    ...Array.from({ length: 72 }, (_, i) => ({
      grade: '3',
      ban: `${(i % 7) + 1}반`,
      num: 100 + i,
      name: `대기${i + 1}`,
      subjects: ['다른과목(4)'],
    })),
  ];

  const rooms: ExamRoom[] = [
    { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 28, maxClassSize: 28, capacity: 28 },
    { id: 'r2', roomName: '3-2', banName: '2반', stuCount: 28, maxClassSize: 28, capacity: 28 },
    { id: 'r3', roomName: '3-3', banName: '3반', stuCount: 27, maxClassSize: 27, capacity: 27 },
    { id: 'r4', roomName: '3-4', banName: '4반', stuCount: 24, maxClassSize: 24, capacity: 24 },
    { id: 'r5', roomName: '3-5', banName: '5반', stuCount: 24, maxClassSize: 24, capacity: 24 },
    { id: 'r6', roomName: '3-6', banName: '6반', stuCount: 24, maxClassSize: 24, capacity: 24 },
    { id: 'r7', roomName: '3-7', banName: '7반', stuCount: 24, maxClassSize: 24, capacity: 24 },
  ];

  // NEIS 분반은 3개뿐 — 3실 × 24석 = 72석으로는 91명을 담지 못합니다.
  const entries = new Map<string, SubjectBanEntry>([
    [`${sub}-1반`, { key: `${sub}-1반`, subject: sub, room: '1반', stuCount: 31, subjectSeq: 1, index: 1 }],
    [`${sub}-2반`, { key: `${sub}-2반`, subject: sub, room: '2반', stuCount: 30, subjectSeq: 1, index: 2 }],
    [`${sub}-3반`, { key: `${sub}-3반`, subject: sub, room: '3반', stuCount: 30, subjectSeq: 1, index: 3 }],
  ]);

  const slots: PlacementSlot[] = [{
    index: 1,
    day: 2 as any,
    period: 3 as any,
    title: '2일차 3교시',
    subjects: [sub],
    banCounts: [3],
    banCountTotal: 3,
    takers: 91,
    nonTakers: 72,
  }];

  it('91명을 3실(72석)에 넣지 않고 고사장을 늘려 전원 배치한다', () => {
    const placed = autoPlaceSlot(1, 'r1', {}, slots, rooms, entries, students, false);
    const row = placed[1] ?? {};

    const examRooms = rooms.filter(r => {
      const v = row[r.id];
      return v && v.startsWith(sub);
    });
    const seats = examRooms.reduce((sum, r) => sum + r.capacity, 0);

    expect(examRooms.length).toBeGreaterThan(3);
    expect(seats).toBeGreaterThanOrEqual(91);

    const sp = initSlotStudentPlacements(1, row, slots, rooms, entries, students);
    const placedTakers = students.filter(
      st => st.subjects.includes(sub) && examRooms.some(r => r.id === sp[`${st.ban}-${st.num}`])
    ).length;

    expect(placedTakers).toBe(91);
  });
});
