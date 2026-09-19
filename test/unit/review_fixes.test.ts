import { describe, it, expect } from 'vitest';
import { initSlotStudentPlacements, getSlotPlacementStrategy } from '../../src/domain/autoPlace';
import { applySeparate } from '../../src/domain/separate';
import type { ExamRoom, PlacementSlot, Student, SubjectBanEntry, NeisRow } from '../../src/domain/types';

/** 알고리즘 검토에서 나온 결함 1·2·3의 회귀 테스트. */

describe('1. 고사장을 더 열어도 분반은 흩어지지 않는다', () => {
  const sub = '한국사(1)';
  const bans = [{ room: 'F', size: 10 }, { room: 'G', size: 10 }, { room: 'H', size: 10 }];
  const students: Student[] = [];
  const neis: NeisRow[] = [];
  let seq = 0;
  bans.forEach(b => {
    for (let k = 0; k < b.size; k++) {
      seq++;
      const ban = `${(seq % 3) + 1}반`;
      students.push({ grade: '3', ban, num: seq, name: `s${seq}`, subjects: [sub] });
      neis.push({
        year: '2026', semester: '1', grade: '3', curriculum: '', subject: sub,
        room: `학교지정-${b.room}`, room2: `학교지정-${b.room}`, track: '', ban, num: seq, name: `s${seq}`,
      });
    }
  });
  const entries = new Map<string, SubjectBanEntry>(
    bans.map((b, i) => [`${sub}-${b.room}`, { key: `${sub}-${b.room}`, subject: sub, room: b.room, stuCount: b.size, subjectSeq: 1, index: i + 1 }])
  );
  const rooms: ExamRoom[] = [1, 2, 3, 4].map(i => ({
    id: `r${i}`, roomName: `3-${i}`, banName: `${i}반`, stuCount: 30, maxClassSize: 30, capacity: 30,
  }));
  const slots: PlacementSlot[] = [{
    index: 1, day: 1 as any, period: 1 as any, title: '1-1',
    subjects: [sub], banCounts: [3], banCountTotal: 3, takers: 30, nonTakers: 0,
  }];
  // 담당자가 7번에서 고사장을 1실 더 열었습니다. 분반은 셋뿐입니다.
  const row = { r1: `${sub}-F`, r2: `${sub}-G`, r3: `${sub}-H`, r4: `${sub}-H` };

  it('칸에 분반이 적혀 있으면 수가 달라도 분반 위주로 앉힌다', () => {
    // 예전에는 분반 수(3) ≠ 고사실 수(4)라는 이유만으로 학번순으로 떨어져 분반이 네 방에 흩어졌습니다.
    expect(getSlotPlacementStrategy(1, row, slots, rooms, entries, students).strategy).toBe('ban');
  });

  it('각 방에는 한 분반만 앉고, 더 연 방은 비어 있다', () => {
    const sp = initSlotStudentPlacements(1, row, slots, rooms, entries, students, neis);
    const roomsOf = (rid: string) => new Set(neis.filter(n => sp[`${n.ban}-${n.num}`] === rid).map(n => n.room));
    expect([...roomsOf('r1')]).toEqual(['학교지정-F']);
    expect([...roomsOf('r2')]).toEqual(['학교지정-G']);
    expect([...roomsOf('r3')]).toEqual(['학교지정-H']);
    expect(roomsOf('r4').size).toBe(0); // 담당자가 손으로 옮길 자리입니다.
    expect(students.filter(st => !sp[`${st.ban}-${st.num}`]).length).toBe(0); // 아무도 떠 있지 않습니다.
  });
});

describe('2. 별도 응시는 시험을 보는 교시에만 붙는다', () => {
  const slots: PlacementSlot[] = [{
    index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시',
    subjects: ['한국사(1)'], banCounts: [1], banCountTotal: 1, takers: 1, nonTakers: 1,
  }];
  const rows = [
    { key1: 'a', key2: 'a', key3: '1반1번1일차1교시', day: '1일차' as const, period: '1교시' as const, examRoom: '3-1', subject: '한국사(1)', grade: '3', ban: '1반', num: 1, name: '응시', classRoom: '1반', seq: 1, seat: 1 },
    { key1: 'b', key2: 'b', key3: '1반2번1일차1교시', day: '1일차' as const, period: '1교시' as const, examRoom: '3-2', subject: '미응시', grade: '3', ban: '1반', num: 2, name: '대기', classRoom: '1반', seq: 1, seat: 1 },
  ];

  it("'시험만'(기본)이면 대기 시간 줄에는 표시가 붙지 않는다", () => {
    const out = applySeparate(rows, slots, { '1반-1': { room: 1, slots: 'all' }, '1반-2': { room: 1, slots: 'all' } });
    expect(out.find(r => r.num === 1)!.separateRoom).toBe(1);        // 시험 보는 줄
    expect(out.find(r => r.num === 2)!.separateRoom).toBeUndefined(); // 대기 줄은 제 교실에 있습니다.
    expect(out.find(r => r.num === 2)!.seat).toBe(1);                 // 대기실 좌석도 그대로입니다.
  });

  it("'종일'이면 대기 시간에도 별도실에 있는 것으로 본다", () => {
    // 학생 상태에 따라 하루 종일 별도실에 있는 경우가 있습니다.
    const out = applySeparate(
      rows, slots,
      { '1반-1': { room: 1, slots: 'all' }, '1반-2': { room: 2, slots: 'all' } },
      true
    );
    expect(out.find(r => r.num === 1)!.separateRoom).toBe(1);
    expect(out.find(r => r.num === 2)!.separateRoom).toBe(2); // 대기 줄도 별도실
    expect(out.find(r => r.num === 2)!.seat).toBe(null);      // 대기실 좌석에서 빠집니다.
  });
});

describe('3. 분반 이름 비교는 꼬리가 완전히 같아야 한다', () => {
  const sub = '한국사(1)';
  // 1반과 11반. 예전 endsWith 비교로는 '11반'이 '1반'과 같다고 봤습니다.
  const students: Student[] = [
    { grade: '3', ban: '1반', num: 1, name: '일반', subjects: [sub] },
    { grade: '3', ban: '11반', num: 1, name: '십일반', subjects: [sub] },
  ];
  const neis: NeisRow[] = [
    { year: '2026', semester: '1', grade: '3', curriculum: '', subject: sub, room: '3학년-1반', room2: '3학년-1반', track: '', ban: '1반', num: 1, name: '일반' },
    { year: '2026', semester: '1', grade: '3', curriculum: '', subject: sub, room: '3학년-11반', room2: '3학년-11반', track: '', ban: '11반', num: 1, name: '십일반' },
  ];
  const entries = new Map<string, SubjectBanEntry>([
    [`${sub}-1반`, { key: `${sub}-1반`, subject: sub, room: '1반', stuCount: 1, subjectSeq: 1, index: 1 }],
    [`${sub}-11반`, { key: `${sub}-11반`, subject: sub, room: '11반', stuCount: 1, subjectSeq: 1, index: 2 }],
  ]);
  const rooms: ExamRoom[] = [
    { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 30, maxClassSize: 30, capacity: 30 },
    { id: 'r11', roomName: '3-11', banName: '11반', stuCount: 30, maxClassSize: 30, capacity: 30 },
  ];
  const slots: PlacementSlot[] = [{
    index: 1, day: 1 as any, period: 1 as any, title: '1-1',
    subjects: [sub], banCounts: [2], banCountTotal: 2, takers: 2, nonTakers: 0,
  }];

  it('1반 학생은 1반 방에, 11반 학생은 11반 방에 앉는다', () => {
    const sp = initSlotStudentPlacements(1, { r1: `${sub}-1반`, r11: `${sub}-11반` }, slots, rooms, entries, students, neis);
    expect(sp['1반-1']).toBe('r1');
    expect(sp['11반-1']).toBe('r11');
  });
});
