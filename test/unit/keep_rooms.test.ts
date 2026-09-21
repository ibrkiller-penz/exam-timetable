import { describe, it, expect } from 'vitest';
import { replanAndPlaceSlot } from '../../src/domain/assignRooms';
import { subjectBanEntries } from '../../src/domain/placement';
import { isWaitCell, PlacementSlot, ExamRoom, Student } from '../../src/domain/types';

/**
 * 8. 학생 배치의 재배치(keepRooms).
 *
 * 고사실은 7단계 것이라 손대지 않고 학생만 다시 나눕니다. 여기가 한 번
 * 깨졌습니다 — 학번순일 때 계획이 새로 잡은 줄을 기준으로 대기를 다시
 * 나누는 바람에 시험 칸이 '대기 - N명'으로 덮여 쓰이고, 그 줄로 학생을
 * 앉히니 응시자 절반이 자리를 잃었습니다. 잠근 방의 학생도 통째로
 * 빠졌습니다(지금 자리를 안 넘겨서).
 */
const ROOMS: ExamRoom[] = [
  { id: 'r1', banName: '1반', stuCount: 30, maxClassSize: 30, roomName: '3-1', capacity: 30 },
  { id: 'r2', banName: '2반', stuCount: 30, maxClassSize: 30, roomName: '3-2', capacity: 30 },
  { id: 'r3', banName: '3반', stuCount: 30, maxClassSize: 30, roomName: '3-3', capacity: 30 },
  { id: 'r4', banName: '4반', stuCount: 30, maxClassSize: 30, roomName: '3-4', capacity: 30 },
];

const entries = subjectBanEntries([
  { subject: '수학(4)', room: 'g1', stuCount: 25, subjectSeq: 1 },
  { subject: '수학(4)', room: 'g2', stuCount: 25, subjectSeq: 1 },
]);

const ps: PlacementSlot = {
  index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시',
  subjects: ['수학(4)'], banCounts: [25, 25], banCountTotal: 2, takers: 50, nonTakers: 20,
};

const students: Student[] = [];
for (let n = 1; n <= 50; n++) students.push({ grade: '3', ban: '1반', num: n, name: '', subjects: ['수학(4)'] });
for (let n = 51; n <= 70; n++) students.push({ grade: '3', ban: '2반', num: n, name: '', subjects: ['국어(4)'] });

/** r1·r2 가 시험실, r3·r4 가 대기. 응시자 50명은 시험실에 앉아 있습니다. */
const row = { r1: '수학(4)-1반', r2: '수학(4)-2반', r3: '대기 - 10명', r4: '대기 - 10명' };
const placements: Record<string, string> = {};
students.forEach((st, i) => { placements[`${st.ban}-${st.num}`] = i < 25 ? 'r1' : i < 50 ? 'r2' : i < 60 ? 'r3' : 'r4'; });

const run = (mode: 'ban' | 'student_id', lockedRow?: Record<string, boolean>) =>
  replanAndPlaceSlot({
    ps, placement: { 1: { ...row } }, rooms: ROOMS, entries, students,
    mode, keepRooms: true, lockedRow, existingPlacements: { ...placements },
  });

describe('8단계 재배치는 고사실을 건드리지 않는다', () => {
  for (const mode of ['ban', 'student_id'] as const) {
    it(`${mode} — 고사실 줄이 한 글자도 바뀌지 않는다`, () => {
      const res = run(mode);
      expect(res.placement[1]).toEqual(row);
    });

    it(`${mode} — 응시자가 모두 시험실에 앉는다`, () => {
      const res = run(mode);
      const sp = res.slotStudentPlacements;
      const takers = students.filter(st => st.subjects.includes('수학(4)'));
      const inExam = takers.filter(st => {
        const rid = sp[`${st.ban}-${st.num}`];
        const cell = rid ? row[rid as keyof typeof row] : undefined;
        return cell && !isWaitCell(cell);
      }).length;
      expect(inExam).toBe(takers.length);
    });
  }

  it('학번순 — 잠근 고사실의 학생이 그대로 남는다', () => {
    // r1 을 잠급니다. 지금 자리를 넘기지 않으면 r1 의 25명이 통째로 미배치가 됐습니다.
    const res = run('student_id', { r1: true });
    const sp = res.slotStudentPlacements;
    const inR1 = Object.values(sp).filter(r => r === 'r1').length;
    expect(inR1).toBe(25);
    const unplaced = students.filter(st => !sp[`${st.ban}-${st.num}`]).length;
    expect(unplaced).toBe(0);
  });
});
