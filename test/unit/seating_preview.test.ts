import { describe, it, expect } from 'vitest';
import { summarizeSeating, replanAndPlaceSlot } from '../../src/domain/assignRooms';
import { subjectBanEntries } from '../../src/domain/placement';
import { ExamRoom, Student, PlacementSlot } from '../../src/domain/types';

/**
 * 누르기 전에 결과를 보여 주는 요약.
 *
 * '재배치 하니 이상하다'는 말이 나오는 까닭은 대개 누른 뒤에야 결과를 보기
 * 때문입니다. 미리보기와 실제 적용이 같은 함수를 써야 서로 어긋나지 않습니다.
 */
const rooms: ExamRoom[] = [28, 24, 24].map((cap, i) => ({
  id: `room_${i + 1}`, banName: `${i + 1}반`, stuCount: cap,
  maxClassSize: cap, roomName: `3-${i + 1}`, capacity: cap,
}));

const SIZES = [26, 20, 14]; // 60명
const students: Student[] = [];
SIZES.forEach((n, bi) => {
  for (let num = 1; num <= n; num++) {
    students.push({ grade: '3', ban: `${bi + 1}반`, num, name: '', subjects: ['수학(4)'] });
  }
});

const entries = subjectBanEntries(
  SIZES.map((n, i) => ({ subject: '수학(4)', room: `강의실${i + 1}`, stuCount: n, subjectSeq: 1 })),
);

const ps: PlacementSlot = {
  index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시',
  subjects: ['수학(4)'], banCounts: SIZES, banCountTotal: 3,
  takers: 60, nonTakers: 0,
};

describe('재배치 미리보기', () => {
  it('방마다 몇 명이 앉고 정원이 얼마인지 알려 준다', () => {
    const res = replanAndPlaceSlot({ ps, placement: { 1: {} }, rooms, entries, students });
    const sum = summarizeSeating({
      ps, row: res.placement[1] ?? {}, placements: res.slotStudentPlacements, rooms, students,
    });

    expect(sum.rows).toHaveLength(3);
    expect(sum.rows.every(r => !r.wait)).toBe(true);
    // 26명은 28석 방으로. 정원을 넘기지 않습니다.
    expect(sum.rows.find(r => r.seated === 26)?.capacity).toBe(28);
    expect(sum.overTotal).toBe(0);
    expect(sum.unplaced).toBe(0);
    expect(sum.rows.reduce((a, r) => a + r.seated, 0)).toBe(60);
  });

  it('정원을 넘기면 몇 명 넘쳤는지 센다', () => {
    // 방을 좁히면 다 앉지 못합니다.
    // 자기 반이 앉는 칸은 '학급 인원'이 정원 기준이라 maxClassSize 도 같이 줄입니다.
    const tiny = rooms.map(r => ({ ...r, capacity: 15, maxClassSize: 15, stuCount: 15 }));
    const res = replanAndPlaceSlot({ ps, placement: { 1: {} }, rooms: tiny, entries, students });
    const sum = summarizeSeating({
      ps, row: res.placement[1] ?? {}, placements: res.slotStudentPlacements, rooms: tiny, students,
    });

    expect(sum.overTotal + sum.unplaced).toBeGreaterThan(0);
  });

  it('미리보기와 실제 적용이 같은 결과를 낸다', () => {
    // 같은 입력으로 두 번 돌리면 같아야 합니다. 미리보기가 거짓말하지 않게.
    const a = replanAndPlaceSlot({ ps, placement: { 1: {} }, rooms, entries, students, mode: 'student_id' });
    const b = replanAndPlaceSlot({ ps, placement: { 1: {} }, rooms, entries, students, mode: 'student_id' });
    expect(b.placement[1]).toEqual(a.placement[1]);
    expect(b.slotStudentPlacements).toEqual(a.slotStudentPlacements);
  });

  it('keepRooms 면 고사실 칸을 그대로 두고 학생만 다시 나눈다', () => {
    const row = { room_1: '수학(4)-1반', room_2: '수학(4)-2반', room_3: '수학(4)-3반' };
    const res = replanAndPlaceSlot({
      ps, placement: { 1: { ...row } }, rooms, entries, students, keepRooms: true, mode: 'student_id',
    });
    expect(res.placement[1]).toEqual(row); // 칸은 그대로
    const sum = summarizeSeating({ ps, row, placements: res.slotStudentPlacements, rooms, students });
    expect(sum.rows.reduce((a, r) => a + r.seated, 0)).toBe(60);
  });
});
