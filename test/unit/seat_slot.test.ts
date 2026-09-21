import { describe, it, expect } from 'vitest';
import { seatSlot } from '../../src/domain/seatSlot';
import { subjectBanEntries } from '../../src/domain/placement';
import { ExamRoom, PlacementSlot, Student, isWaitCell } from '../../src/domain/types';

/**
 * 한 교시를 백지에서 짜는 규칙.
 *
 * 지켜야 할 것: 아무도 자리를 잃지 않는다 · 정원 초과를 가장 적게, 고르게 ·
 * 분반을 통째로(채점과 입력이 분반 단위라 섞이면 곤란합니다) · 고사실은 적게.
 */
const room = (id: string, name: string, ban: string, cap: number): ExamRoom =>
  ({ id, banName: ban, stuCount: cap, maxClassSize: cap, roomName: name, capacity: cap });

const students = (ban: string, from: number, to: number, subjects: string[]): Student[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ grade: '3', ban, num: from + i, name: '', subjects }));

const slot = (subjects: string[], takers: number, nonTakers: number): PlacementSlot =>
  ({ index: 1, day: 1 as never, period: 1 as never, title: '1일차 1교시', subjects, banCounts: [], banCountTotal: 0, takers, nonTakers });

/** 정원은 좌석 수 그대로. 교시별 조정은 여기서 따지지 않습니다. */
const capOf = (r: ExamRoom) => r.capacity;

const seatedIn = (res: { placements: Record<string, string> }, id: string) =>
  Object.values(res.placements).filter(x => x === id).length;

describe('한 교시를 백지에서 짜기', () => {
  it('분반을 통째로 앉힌다 — 채점과 입력이 분반 단위이기 때문', () => {
    const rooms = [room('r1', '3-1', '1반', 30), room('r2', '3-2', '2반', 30), room('r3', '3-3', '3반', 30)];
    const entries = subjectBanEntries([
      { subject: '수학(4)', room: 'g1', stuCount: 25, subjectSeq: 1 },
      { subject: '수학(4)', room: 'g2', stuCount: 20, subjectSeq: 1 },
    ]);
    const all = [...students('1반', 1, 25, ['수학(4)']), ...students('2반', 1, 20, ['수학(4)'])];
    const res = seatSlot({ ps: slot(['수학(4)'], 45, 0), rooms, entries, students: all, capacityOf: capOf });

    expect(res.ok).toBe(true);
    expect(res.overTotal).toBe(0);
    expect(res.unseated).toEqual([]);
    // 한 방에 한 분반. 같은 분반 학생이 갈라지지 않습니다.
    const examRooms = rooms.filter(r => res.row[r.id] && !isWaitCell(res.row[r.id]));
    expect(examRooms).toHaveLength(2);
    for (const r of examRooms) {
      const inRoom = all.filter(st => res.placements[`${st.ban}-${st.num}`] === r.id);
      expect(new Set(inRoom.map(st => st.ban)).size).toBe(1);
    }
  });

  it('고사실을 적게 쓴다 — 남는 방은 대기로 돌린다', () => {
    const rooms = [room('r1', '3-1', '1반', 30), room('r2', '3-2', '2반', 30),
                   room('r3', '3-3', '3반', 30), room('r4', '3-4', '4반', 30)];
    const entries = subjectBanEntries([{ subject: '수학(4)', room: 'g1', stuCount: 20, subjectSeq: 1 }]);
    const all = [...students('1반', 1, 20, ['수학(4)']), ...students('2반', 1, 20, ['국어(4)'])];
    const res = seatSlot({ ps: slot(['수학(4)'], 20, 20), rooms, entries, students: all, capacityOf: capOf });

    const exam = rooms.filter(r => res.row[r.id] && !isWaitCell(res.row[r.id]));
    expect(exam).toHaveLength(1);                       // 분반이 하나면 시험실도 하나
    expect(res.overTotal).toBe(0);
    // 미응시자는 대기실에. 아무도 빠지지 않습니다.
    expect(Object.keys(res.placements)).toHaveLength(40);
  });

  it('자리가 모자라면 미배치로 두지 않고 최소로 넘겨 고르게 흩는다', () => {
    // 60명인데 20석 방 둘뿐 = 40석. 20명이 넘칩니다.
    const rooms = [room('r1', '3-1', '1반', 20), room('r2', '3-2', '2반', 20)];
    const entries = subjectBanEntries([
      { subject: '수학(4)', room: 'g1', stuCount: 30, subjectSeq: 1 },
      { subject: '수학(4)', room: 'g2', stuCount: 30, subjectSeq: 1 },
    ]);
    const all = [...students('1반', 1, 30, ['수학(4)']), ...students('2반', 1, 30, ['수학(4)'])];
    const res = seatSlot({ ps: slot(['수학(4)'], 60, 0), rooms, entries, students: all, capacityOf: capOf });

    expect(res.unseated).toEqual([]);                  // 아무도 자리를 잃지 않습니다
    expect(res.overTotal).toBe(20);                    // 넘긴 인원은 꼭 모자란 만큼만
    // 한 방에 몰지 않고 고르게. 두 방 모두 30명.
    expect(seatedIn(res, 'r1')).toBe(30);
    expect(seatedIn(res, 'r2')).toBe(30);
    expect(res.notes.join(' ')).toMatch(/정원을 모두 20명 넘겼습니다/);
  });

  it('분반이 방보다 커도 쪼개지 않는다 — 넘치는 쪽을 택한다', () => {
    // 40명 분반이 30석 방에. 쪼개면 채점이 두 방으로 갈리므로 통째로 넣고 10명을 넘깁니다.
    const rooms = [room('r1', '3-1', '1반', 30), room('r2', '3-2', '2반', 30)];
    const entries = subjectBanEntries([
      { subject: '수학(4)', room: 'g1', stuCount: 40, subjectSeq: 1 },
      { subject: '수학(4)', room: 'g2', stuCount: 10, subjectSeq: 1 },
    ]);
    const all = [...students('1반', 1, 40, ['수학(4)']), ...students('2반', 1, 10, ['수학(4)'])];
    const res = seatSlot({ ps: slot(['수학(4)'], 50, 0), rooms, entries, students: all, capacityOf: capOf });

    expect(res.unseated).toEqual([]);
    expect(res.overTotal).toBe(10);
    // 40명이 한 방에 그대로. 분반이 갈라지지 않습니다.
    expect(seatedIn(res, 'r1')).toBe(40);
    expect(seatedIn(res, 'r2')).toBe(10);
    expect(res.notes.join(' ')).toMatch(/의자를 더 놓으면 됩니다/);
  });

  it('한국사처럼 반마다 한 분반이면, 제 교실을 쓰고 큰 반만 한 명씩 넘친다', () => {
    // 실제 3학년 자료. 분반 29·29·24·22·22·20·17명 / 정규 교실 28·28·27·24·24·24·24석.
    // 별도실(40석·30석)을 열지 않고 제 교실에 앉히면 29명짜리 둘만 1명씩 넘칩니다.
    const caps = [28, 28, 27, 24, 24, 24, 24];
    const rooms = [
      ...caps.map((c, i) => room(`r${i + 1}`, `3-${i + 1}`, `${i + 1}반`, c)),
      room('extra_8', '2층 넘나들 1실', '', 30),
      room('extra_9', '3층 세미나실', '', 40),
    ];
    const sizes = [24, 29, 20, 22, 17, 29, 22];
    const entries = subjectBanEntries(
      sizes.map((n, i) => ({ subject: '한국사(1)', room: `g${i + 1}`, stuCount: n, subjectSeq: 1 })));
    const all = sizes.flatMap((n, i) => students(`${i + 1}반`, 1, n, ['한국사(1)']));

    const res = seatSlot({ ps: slot(['한국사(1)'], 163, 0), rooms, entries, students: all, capacityOf: capOf });

    expect(res.unseated).toEqual([]);
    expect(res.overTotal).toBe(2);                 // 모두 2명
    expect(res.over).toHaveLength(2);              // 두 방에 1명씩
    expect(res.over.every(o => o.over === 1)).toBe(true);
    // 별도실은 열지 않습니다.
    expect(res.row['extra_8']).toBeUndefined();
    expect(res.row['extra_9']).toBeUndefined();
  });

  it('학번순을 고르면 분반을 섞어 실을 더 적게 쓴다', () => {
    const rooms = [room('r1', '3-1', '1반', 40), room('r2', '3-2', '2반', 40), room('r3', '3-3', '3반', 40)];
    const entries = subjectBanEntries([
      { subject: '수학(4)', room: 'g1', stuCount: 12, subjectSeq: 1 },
      { subject: '수학(4)', room: 'g2', stuCount: 12, subjectSeq: 1 },
      { subject: '수학(4)', room: 'g3', stuCount: 12, subjectSeq: 1 },
    ]);
    const all = [...students('1반', 1, 12, ['수학(4)']), ...students('2반', 1, 12, ['수학(4)']),
                 ...students('3반', 1, 12, ['수학(4)'])];

    const ban = seatSlot({ ps: slot(['수학(4)'], 36, 0), rooms, entries, students: all, capacityOf: capOf, mode: 'ban' });
    const sid = seatSlot({ ps: slot(['수학(4)'], 36, 0), rooms, entries, students: all, capacityOf: capOf, mode: 'student_id' });

    const count = (r: typeof ban) => rooms.filter(x => r.row[x.id] && !isWaitCell(r.row[x.id])).length;
    expect(count(ban)).toBe(3);   // 분반 셋이라 방도 셋
    expect(count(sid)).toBe(1);   // 40석 한 방이면 36명이 들어갑니다
    expect(sid.overTotal).toBe(0);
  });

  it('배치금지 방은 쓰지 않는다', () => {
    const rooms = [room('r1', '3-1', '1반', 30), room('r2', '3-2', '2반', 30)];
    const entries = subjectBanEntries([{ subject: '수학(4)', room: 'g1', stuCount: 20, subjectSeq: 1 }]);
    const all = students('1반', 1, 20, ['수학(4)']);
    const res = seatSlot({
      ps: slot(['수학(4)'], 20, 0), rooms, entries, students: all, capacityOf: capOf,
      forbidden: { r1: true },
    });

    expect(res.row['r1']).toBe('배치금지');
    expect(seatedIn(res, 'r1')).toBe(0);
    expect(seatedIn(res, 'r2')).toBe(20);
  });
});

describe('고사실은 그대로 두고 학생만 다시 앉히기', () => {
  it('시험실 칸을 하나도 바꾸지 않는다 — 손으로 맞춰 둔 구성이 살아 있어야 한다', () => {
    const rooms = [room('r1', '3-1', '1반', 30), room('r2', '3-2', '2반', 30), room('r3', '3-3', '3반', 30)];
    const entries = subjectBanEntries([
      { subject: '수학(4)', room: 'g1', stuCount: 25, subjectSeq: 1 },
      { subject: '수학(4)', room: 'g2', stuCount: 20, subjectSeq: 1 },
    ]);
    const all = [...students('1반', 1, 25, ['수학(4)']), ...students('2반', 1, 20, ['수학(4)']),
                 ...students('3반', 1, 10, ['국어(4)'])];
    const ps = slot(['수학(4)'], 45, 10);

    // 담당자가 손으로 맞춰 둔 줄: 1분반은 3-3 교실, 2분반은 3-1 교실.
    const keepRow = { r3: '수학(4)-1반', r1: '수학(4)-2반', r2: '대기2반 - 10명' } as Record<string, string>;
    const res = seatSlot({ ps, rooms, entries, students: all, capacityOf: capOf, keepRow });

    expect(res.row['r3']).toBe('수학(4)-1반');
    expect(res.row['r1']).toBe('수학(4)-2반');
    expect(res.unseated).toEqual([]);
    expect(res.overTotal).toBe(0);
    // 칸에 적힌 대로 앉습니다. 제 반 교실이 비어 있어도 옮기지 않습니다.
    expect(seatedIn(res, 'r3')).toBe(25);
    expect(seatedIn(res, 'r1')).toBe(20);
    expect(seatedIn(res, 'r2')).toBe(10);
  });

  it('대기실 인원 표시는 실제 수로 고쳐 쓴다', () => {
    const rooms = [room('r1', '3-1', '1반', 30), room('r2', '3-2', '2반', 30)];
    const entries = subjectBanEntries([{ subject: '수학(4)', room: 'g1', stuCount: 20, subjectSeq: 1 }]);
    const all = [...students('1반', 1, 20, ['수학(4)']), ...students('2반', 1, 7, ['국어(4)'])];
    const keepRow = { r1: '수학(4)-1반', r2: '대기2반 - 99명' } as Record<string, string>;
    const res = seatSlot({ ps: slot(['수학(4)'], 20, 7), rooms, entries, students: all, capacityOf: capOf, keepRow });

    expect(res.row['r2']).toBe('대기2반 - 7명');
    expect(seatedIn(res, 'r2')).toBe(7);
  });

  it('쓰지 않는 방(배치금지)도 그대로 둔다', () => {
    const rooms = [room('r1', '3-1', '1반', 30), room('r2', '3-2', '2반', 30), room('r3', '3-3', '3반', 30)];
    const entries = subjectBanEntries([{ subject: '수학(4)', room: 'g1', stuCount: 20, subjectSeq: 1 }]);
    const all = students('1반', 1, 20, ['수학(4)']);
    const keepRow = { r1: '수학(4)-1반', r3: '배치금지' } as Record<string, string>;
    const res = seatSlot({
      ps: slot(['수학(4)'], 20, 0), rooms, entries, students: all, capacityOf: capOf,
      keepRow, forbidden: { r3: true },
    });

    expect(res.row['r3']).toBe('배치금지');
    expect(seatedIn(res, 'r3')).toBe(0);
    expect(seatedIn(res, 'r1')).toBe(20);
    expect(res.row['r2']).toBeUndefined();   // 비어 있던 방은 비어 있는 채로
  });
});
