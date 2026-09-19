import { describe, it, expect } from 'vitest';
import { initSlotStudentPlacements } from '../../src/domain/autoPlace';
import { ExamRoom, PlacementSlot, Student, SubjectBanEntry, NeisRow, capacityForSlot, roomsForSlot } from '../../src/domain/types';

/**
 * 분반 위주 배치는 NEIS 분반 그대로 묶여야 합니다.
 * 실제로 겪은 문제: 분반 크기가 28·28·26·20·22·17·22인데
 * 배치 결과가 24·29·20·22·17·29·22로 어긋났습니다.
 */
describe('분반 위주 배치는 NEIS 분반대로 묶는다', () => {
  const sub = '한국사(1)';
  const banRooms = ['G1', 'J1', 'F', 'G2', 'H1', 'H2', 'J2'];
  const banSizes = [28, 28, 26, 20, 22, 17, 22]; // 합계 163

  const students: Student[] = [];
  const neis: NeisRow[] = [];
  let n = 0;
  banRooms.forEach((banRoom, bi) => {
    for (let k = 0; k < banSizes[bi]; k++) {
      n++;
      const ban = `${(n % 7) + 1}반`;
      const num = n;
      students.push({ grade: '3', ban, num, name: `학생${n}`, subjects: [sub] });
      neis.push({
        year: '2026', semester: '1', grade: '3', curriculum: '일반',
        subject: sub, room: `이동수업 ${banRoom}`, room2: banRoom,
        track: '3학년', ban, num, name: `학생${n}`,
      });
    }
  });

  const rooms: ExamRoom[] = [
    { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 28, maxClassSize: 28, capacity: 28 },
    { id: 'r2', roomName: '3-2', banName: '2반', stuCount: 28, maxClassSize: 28, capacity: 28 },
    { id: 'r3', roomName: '3-3', banName: '3반', stuCount: 27, maxClassSize: 27, capacity: 27 },
    { id: 'r4', roomName: '3-4', banName: '4반', stuCount: 24, maxClassSize: 24, capacity: 24 },
    { id: 'r5', roomName: '3-5', banName: '5반', stuCount: 24, maxClassSize: 24, capacity: 24 },
    { id: 'r6', roomName: '3-6', banName: '6반', stuCount: 24, maxClassSize: 24, capacity: 24 },
    { id: 'r7', roomName: '3-7', banName: '7반', stuCount: 24, maxClassSize: 24, capacity: 24 },
  ];

  const entries = new Map<string, SubjectBanEntry>(
    banRooms.map((banRoom, i) => [
      `${sub}-${banRoom}`,
      { key: `${sub}-${banRoom}`, subject: sub, room: banRoom, stuCount: banSizes[i], subjectSeq: 1, index: i + 1 },
    ])
  );

  const slots: PlacementSlot[] = [{
    index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시',
    subjects: [sub], banCounts: [7], banCountTotal: 7, takers: 163, nonTakers: 0,
  }];

  const row: Record<string, string> = {};
  rooms.forEach((r, i) => { row[r.id] = `${sub}-${banRooms[i]}`; });

  const countsOf = (sp: Record<string, string>) =>
    rooms.map(r => students.filter(st => sp[`${st.ban}-${st.num}`] === r.id).length);

  it('NEIS 정보가 있으면 분반 인원 그대로 배치된다', () => {
    const sp = initSlotStudentPlacements(1, row, slots, rooms, entries, students, neis);
    expect(countsOf(sp)).toEqual(banSizes);
  });

  it('NEIS 정보가 없어도 최소한 분반 인원 수는 맞춘다', () => {
    const sp = initSlotStudentPlacements(1, row, slots, rooms, entries, students);
    expect(countsOf(sp)).toEqual(banSizes);
  });

  it('이동수업 분반이 앉는 칸은 학급 인원이 아니라 고사실 정원을 쓴다', () => {
    // 1반 교실(좌석 28)에 학급 인원이 24명이라도, 이동수업 G1(28명)이 앉으면
    // 정원을 24로 잘라서는 안 됩니다. 그러면 분반이 쪼개집니다.
    const room: ExamRoom = { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 24, maxClassSize: 24, capacity: 28 };
    expect(capacityForSlot(room, 1, {}, slots[0], `${sub}-G1`)).toBe(28);

    // 학급이 통째로 앉는 칸(분반 이름이 곧 그 반)은 반 인원이 정원입니다.
    expect(capacityForSlot(room, 1, {}, slots[0], `${sub}-1반`)).toBe(24);

    // 아무도 시험을 보지 않는 교시도 반 인원이 정원입니다.
    const selfStudy = { ...slots[0], takers: 0, nonTakers: 163 };
    expect(capacityForSlot(room, 1, {}, selfStudy)).toBe(24);
  });

  it('분반이 정원에 잘리지 않고 그대로 배치된다', () => {
    const adjusted = roomsForSlot(rooms, 1, {}, slots[0], row);
    const sp = initSlotStudentPlacements(1, row, slots, adjusted, entries, students, neis);
    expect(countsOf(sp)).toEqual(banSizes);
  });
});
