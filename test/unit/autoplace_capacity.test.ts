import { describe, it, expect } from 'vitest';
import { autoPlaceSlot } from '../../src/domain/autoPlace';
import { subjectBanEntries } from '../../src/domain/placement';
import { ExamRoom, Student, PlacementSlot, isWaitCell } from '../../src/domain/types';

/**
 * 7. 고사장 배치의 자동배치가 분반 크기와 고사실 정원을 맞춰 보는지.
 *
 * 실제로 겪은 일입니다. 29명짜리 분반 둘이 24석 방에 들어가고, 28석 방에는
 * 24명·22명이 앉았습니다. 자동배치가 '자기 반 교실'만 보고 정원을 보지
 * 않았기 때문입니다. 분반은 큰 것부터, 방은 그 분반이 들어가는 것 중에서
 * 골라야 합니다.
 */

/** 화면에서 본 그대로. 1~3반은 큰 교실, 4~7반은 작은 교실입니다. */
const ROOM_SEATS = [28, 28, 27, 24, 24, 24, 24];
/** 반마다 한국사 수강 인원. 6반·7반이 29명으로 가장 많습니다. */
const BAN_SIZES = [24, 22, 17, 22, 20, 29, 29];

const rooms: ExamRoom[] = ROOM_SEATS.map((cap, i) => ({
  id: `room_${i + 1}`,
  banName: `${i + 1}반`,
  stuCount: cap,
  maxClassSize: cap,
  roomName: `3-${i + 1}`,
  capacity: cap,
}));

/** 학생은 반 순서대로 늘어놓습니다. 분반 인원을 반 인원과 같게 두면 분반 하나가 반 하나가 됩니다. */
const students: Student[] = [];
BAN_SIZES.forEach((n, bi) => {
  for (let num = 1; num <= n; num++) {
    students.push({ grade: '3', ban: `${bi + 1}반`, num, name: '', subjects: ['한국사(1)'] });
  }
});

const entries = subjectBanEntries(
  BAN_SIZES.map((n, i) => ({ subject: '한국사(1)', room: `강의실${i + 1}`, stuCount: n, subjectSeq: 1 })),
);

const ps: PlacementSlot = {
  index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시',
  subjects: ['한국사(1)'], banCounts: BAN_SIZES, banCountTotal: BAN_SIZES.length,
  takers: students.length, nonTakers: 0,
};

/** 각 방에 앉은 분반의 인원과 정원을 견줍니다. */
function seatReport(row: Record<string, string>) {
  return rooms.map(r => {
    const cell = row[r.id];
    if (!cell || isWaitCell(cell) || cell === '배치금지') return null;
    const size = entries.get(cell)?.stuCount ?? 0;
    return { room: r.roomName, cap: r.capacity, size, over: Math.max(0, size - r.capacity) };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

describe('자동배치는 분반 크기와 고사실 정원을 맞춰 본다', () => {
  const row = autoPlaceSlot(1, 'room_1', { 1: {} }, [ps], rooms, entries, students, false)[1];
  const report = seatReport(row);

  it('분반이 모두 자리를 받는다', () => {
    expect(report).toHaveLength(BAN_SIZES.length);
    expect(report.map(x => x.size).sort((a, b) => a - b)).toEqual([...BAN_SIZES].sort((a, b) => a - b));
  });

  it('29명 분반이 24석 방에 들어가지 않는다 — 넘치는 인원이 확 줄어든다', () => {
    const totalOver = report.reduce((a, x) => a + x.over, 0);
    // 고치기 전에는 29명 둘이 24석 방에 들어가 5+5 = 10명이 넘쳤습니다.
    // 방이 최대 28석이라 29명은 어디에 넣어도 1명은 넘지만, 그 이상은 안 됩니다.
    expect(totalOver).toBeLessThanOrEqual(2);
    for (const x of report) {
      if (x.size === 29) expect(x.cap).toBe(28); // 가장 큰 방으로
    }
  });

  it('큰 분반이 작은 방에, 작은 분반이 큰 방에 앉는 짝이 없다', () => {
    // 둘을 맞바꾸면 나아지는 짝이 하나라도 있으면 줄세우기가 안 된 것입니다.
    for (const a of report) {
      for (const b of report) {
        if (a.size > b.size && a.cap < b.cap) {
          const nowOver = a.over + b.over;
          const swapOver = Math.max(0, a.size - b.cap) + Math.max(0, b.size - a.cap);
          expect(swapOver).toBeGreaterThanOrEqual(nowOver);
        }
      }
    }
  });
});
