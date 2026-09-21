import { describe, it, expect } from 'vitest';
import { planRooms, SeatRoom, SeatBan } from '../../src/domain/assignRooms';

/** 이 학교의 실제 고사실. 크기가 제각각이라 짝을 잘못 지으면 바로 티가 납니다. */
const ROOMS: SeatRoom[] = [
  { id: 'room_1', name: '3-1', capacity: 28 },
  { id: 'room_2', name: '3-2', capacity: 28 },
  { id: 'room_3', name: '3-3', capacity: 27 },
  { id: 'room_4', name: '3-4', capacity: 24 },
  { id: 'room_5', name: '3-5', capacity: 24 },
  { id: 'room_6', name: '3-6', capacity: 24 },
  { id: 'room_7', name: '3-7', capacity: 24 },
  { id: 'extra_8', name: '2층 넘나들 1실', capacity: 30 },
  { id: 'extra_9', name: '3층 세미나실', capacity: 40 },
];

const seatedCount = (plan: ReturnType<typeof planRooms>, bans: SeatBan[]) =>
  Object.values(plan.exam).reduce((a, cell) => a + (bans.find(b => b.cell === cell)?.size ?? 0), 0);

describe('분반을 고사실에 앉히기', () => {
  it('큰 분반부터 자리를 잡아, 앉힐 수 있으면 반드시 앉힌다', () => {
    // 작은 것부터 넣으면 31명이 갈 곳을 잃는 배치입니다.
    const bans: SeatBan[] = [
      { cell: 'A-1반', size: 24 },
      { cell: 'A-2반', size: 31 },
      { cell: 'A-3반', size: 28 },
    ];
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 0 });

    expect(plan.unseated).toEqual([]);
    expect(plan.ok).toBe(true);
    // 31명은 40석에만 들어갑니다.
    expect(plan.exam['extra_9']).toBe('A-2반');
    expect(seatedCount(plan, bans)).toBe(83);
  });

  it('정원을 넘겨 억지로 앉히지 않는다 — 좌석 합계로도 모자라면 몇 석인지 말한다', () => {
    // 30·30·31명인데 방을 셋만 쓸 수 있고 그 셋이 24·24·24석이면 어떻게 해도 72석.
    const small: SeatRoom[] = ROOMS.filter(r => r.capacity === 24).slice(0, 3);
    const bans: SeatBan[] = [
      { cell: '심화 영어 독해Ⅰ(4)-1반', size: 30 },
      { cell: '심화 영어 독해Ⅰ(4)-2반', size: 30 },
      { cell: '심화 영어 독해Ⅰ(4)-3반', size: 31 },
    ];
    const plan = planRooms({ bans, rooms: small, nonTakers: 0 });

    expect(plan.ok).toBe(false);
    expect(plan.seatShort).toBe(91 - 72);
    expect(plan.notes.join(' ')).toMatch(/시험 좌석이 19석 모자랍니다/);
    // 그래도 방은 다 채워 둡니다. 칸을 비워 두면 표에서 분반이 사라집니다.
    expect(Object.keys(plan.exam)).toHaveLength(3);
  });

  it('지금 자리로도 되면 그대로 둔다 — 학생을 공연히 옮기지 않는다', () => {
    const bans: SeatBan[] = [
      { cell: 'B-1반', size: 20 },
      { cell: 'B-2반', size: 20 },
    ];
    const current = { room_5: 'B-1반', room_6: 'B-2반' }; // 24석 방 두 곳. 20명이면 충분합니다.
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 0, current });

    expect(plan.ok).toBe(true);
    expect(plan.moves).toBe(0);
    expect(plan.exam['room_5']).toBe('B-1반');
    expect(plan.exam['room_6']).toBe('B-2반');
    expect(plan.notes.join(' ')).toMatch(/바꿀 것이 없습니다/);
  });

  it('지금 자리로는 안 되면 자리를 새로 짠다 — 이것이 재배치가 못 하던 일이다', () => {
    // 30명 분반이 24석 방에 들어가 있는 상태. 예전에는 여기서 멈췄습니다.
    const bans: SeatBan[] = [
      { cell: 'C-1반', size: 30 },
      { cell: 'C-2반', size: 26 },
    ];
    const current = { room_4: 'C-1반', room_5: 'C-2반' }; // 둘 다 24석
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 0, current });

    expect(plan.ok).toBe(true);
    expect(plan.unseated).toEqual([]);
    expect(plan.exam['extra_8']).toBe('C-1반'); // 30 -> 30석으로 옮겨 앉힘
    expect(plan.moves).toBeGreaterThan(0);
  });

  it('대기 자리가 모자라면 그것도 짚는다', () => {
    const bans: SeatBan[] = [{ cell: 'D-1반', size: 40 }];
    // 40석 방을 시험에 쓰면 남는 방은 28+28+27+24*4 = 179석.
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 400 });

    expect(plan.unseated).toEqual([]);
    expect(plan.waitShort).toBe(400 - (28 + 28 + 27 + 24 * 4 + 30));
    expect(plan.ok).toBe(false);
    expect(plan.notes.join(' ')).toMatch(/대기 자리가 .*명분 모자랍니다/);
  });

  it('잠근 칸과 배치금지는 건드리지 않는다', () => {
    const bans: SeatBan[] = [
      { cell: 'E-1반', size: 26 },
      { cell: 'E-2반', size: 26 },
    ];
    const plan = planRooms({
      bans,
      rooms: ROOMS,
      nonTakers: 0,
      fixed: { room_1: { exam: 'E-1반' }, room_2: 'forbidden' }, // 3-1 고정, 3-2 배치금지
    });

    expect(plan.exam['room_1']).toBe('E-1반');    // 고정된 그대로
    expect(plan.exam['room_2']).toBeUndefined();  // 배치금지에는 안 넣음
    expect(plan.waitRoomIds).not.toContain('room_2'); // 대기로도 안 씀
    expect(plan.unseated).toEqual([]);
  });

  it('방이 모자라면 방을 더 열라고 말한다', () => {
    const bans: SeatBan[] = Array.from({ length: 10 }, (_, i) => ({ cell: `F-${i}반`, size: 10 }));
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 0 }); // 방은 9개뿐

    expect(plan.unseated).toHaveLength(1);
    expect(plan.notes.join(' ')).toMatch(/고사실을 더 열어야 합니다|모자랍니다/);
  });
});

describe('정원이 무엇을 넣느냐에 따라 달라질 때', () => {
  it('capacityFor 를 주면 방마다 하나의 정원이 아니라 (방, 분반) 쌍으로 본다', () => {
    // room_4 는 좌석 24석이지만 '자기 반'(4반) 분반이 앉으면 학급 인원 30명 기준이 됩니다.
    const rooms: SeatRoom[] = [
      { id: 'room_4', name: '3-4', capacity: 24 },
      { id: 'room_9', name: '세미나실', capacity: 40 },
    ];
    const bans: SeatBan[] = [{ cell: 'X-4반', size: 30 }, { cell: 'X-1반', size: 30 }];
    const capacityFor = (roomId: string, cell: string | null) =>
      roomId === 'room_4' && cell === 'X-4반' ? 30 : (rooms.find(r => r.id === roomId)!.capacity);

    const plan = planRooms({ bans, rooms, nonTakers: 0, capacityFor });

    expect(plan.ok).toBe(true);
    expect(plan.exam['room_4']).toBe('X-4반');   // 자기 반이라 30명이 들어갑니다
    expect(plan.exam['room_9']).toBe('X-1반');
  });

  it('capacityFor 없이 방 정원 하나로만 보면 같은 입력이 실패한다 — 그래서 넘겨야 한다', () => {
    // 24석 + 30석 = 54석 < 60명. 자기 반 보정(24→30)이 있어야만 60석이 됩니다.
    const rooms: SeatRoom[] = [
      { id: 'room_4', name: '3-4', capacity: 24 },
      { id: 'extra_8', name: '넘나들', capacity: 30 },
    ];
    const bans: SeatBan[] = [{ cell: 'X-4반', size: 30 }, { cell: 'X-1반', size: 30 }];

    expect(planRooms({ bans, rooms, nonTakers: 0 }).ok).toBe(false);

    const capacityFor = (roomId: string, cell: string | null) =>
      roomId === 'room_4' && cell === 'X-4반' ? 30 : rooms.find(r => r.id === roomId)!.capacity;
    expect(planRooms({ bans, rooms, nonTakers: 0, capacityFor }).ok).toBe(true);
  });

  it('0명 분반은 방을 차지하지 않는다', () => {
    const bans: SeatBan[] = [{ cell: 'Y-1반', size: 0 }, { cell: 'Y-2반', size: 20 }];
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 0 });
    expect(Object.values(plan.exam)).toEqual(['Y-2반']);
    expect(plan.unseated).toEqual([]);
  });
});

describe('분반을 통째로는 못 앉혀도 좌석 합계로 되는 경우', () => {
  it('2일차 3교시 — 30·30·31명을 40·30·28석에 나눠 앉히면 된다 (책상을 더 넣을 필요가 없다)', () => {
    const bans: SeatBan[] = [
      { cell: '심화 영어 독해Ⅰ(4)-1반', size: 30 },
      { cell: '심화 영어 독해Ⅰ(4)-2반', size: 30 },
      { cell: '심화 영어 독해Ⅰ(4)-3반', size: 31 },
    ];
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 72 });

    expect(plan.ok).toBe(true);
    expect(plan.seatShort).toBe(0);
    expect(plan.unseated).toEqual([]);
    // 큰 방 셋: 세미나실 40 · 넘나들 30 · 3-1 28 = 98석 ≥ 91명
    expect(new Set(Object.keys(plan.exam))).toEqual(new Set(['extra_9', 'extra_8', 'room_1']));
    expect(plan.notes.join(' ')).toMatch(/나눠 앉히면 됩니다 \(좌석 98석 \/ 응시 91명\)/);
    expect(plan.notes.join(' ')).toMatch(/3-1에 2명이 넘쳐/);
  });

  it('좌석 합계로도 모자라면 몇 석이 모자란지 말한다', () => {
    const bans: SeatBan[] = [
      { cell: 'Z-1반', size: 40 },
      { cell: 'Z-2반', size: 40 },
      { cell: 'Z-3반', size: 40 },
    ];
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 0 });
    // 가장 큰 셋 40+30+28 = 98 < 120
    expect(plan.ok).toBe(false);
    expect(plan.seatShort).toBe(22);
    expect(plan.notes.join(' ')).toMatch(/시험 좌석이 22석 모자랍니다/);
  });

  it('과목이 둘이면 서로 다른 과목 방으로는 넘기지 않는다', () => {
    // A 과목은 좌석 합계로 해결, B 과목은 그대로 통째로 앉는다.
    const bans: SeatBan[] = [
      { cell: 'A-1반', size: 30 }, { cell: 'A-2반', size: 30 }, { cell: 'A-3반', size: 31 },
      { cell: 'B-1반', size: 20 },
    ];
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 0 });
    expect(plan.ok).toBe(true);
    const roomOf = (cell: string) => Object.entries(plan.exam).find(([, c]) => c === cell)?.[0];
    expect(roomOf('B-1반')).toBeDefined();
    expect(['extra_9', 'extra_8', 'room_1']).not.toContain(roomOf('B-1반'));
  });
});

import { spillOverCapacity } from '../../src/domain/assignRooms';
import { subjectBanEntries } from '../../src/domain/placement';

describe('정원을 넘긴 방의 학생을 같은 과목 방으로 넘기기', () => {
  const rooms: any[] = [
    { id: 'A', banName: '1반', stuCount: 28, maxClassSize: 28, roomName: '3-1', capacity: 28 },
    { id: 'B', banName: '2반', stuCount: 28, maxClassSize: 28, roomName: '3-2', capacity: 40 },
    { id: 'C', banName: '3반', stuCount: 28, maxClassSize: 28, roomName: '3-3', capacity: 24 },
  ];
  const entries = subjectBanEntries([
    { subject: '영어', room: 'r1', stuCount: 30, subjectSeq: 1 },
    { subject: '영어', room: 'r2', stuCount: 20, subjectSeq: 1 },
    { subject: '수학', room: 'r3', stuCount: 10, subjectSeq: 2 },
  ]);
  const row = { A: '영어-1반', B: '영어-2반', C: '수학-1반' };
  const students: any[] = [];
  const placements: Record<string, string> = {};
  for (let n = 1; n <= 30; n++) { students.push({ grade: '3', ban: '1반', num: n, name: '', subjects: ['영어'] }); placements[`1반-${n}`] = 'A'; }
  for (let n = 1; n <= 20; n++) { students.push({ grade: '3', ban: '2반', num: n, name: '', subjects: ['영어'] }); placements[`2반-${n}`] = 'B'; }
  for (let n = 1; n <= 30; n++) { students.push({ grade: '3', ban: '3반', num: n, name: '', subjects: ['수학'] }); placements[`3반-${n}`] = 'C'; }
  const capacityOf = (r: any) => r.capacity;

  it('넘친 2명을 같은 과목의 여유 있는 방으로만 옮긴다 — 뒷번호부터', () => {
    const res = spillOverCapacity({ row, placements, rooms, students, entries, capacityOf });
    expect(res.moved.map(m => m.key)).toEqual(['1반-29', '1반-30']);
    expect(res.moved.every(m => m.to === 'B')).toBe(true);
    expect(Object.values(res.placements).filter(r => r === 'A')).toHaveLength(28);
  });

  it('다른 과목 방으로는 넘기지 않는다 — 받아 줄 방이 없으면 그대로 둔다', () => {
    // 수학은 방이 C 하나뿐이라 30명 중 6명이 넘쳐도 갈 곳이 없습니다.
    const res = spillOverCapacity({ row, placements, rooms, students, entries, capacityOf });
    expect(res.moved.some(m => m.from === 'C')).toBe(false);
    expect(Object.values(res.placements).filter(r => r === 'C')).toHaveLength(30);
  });

  it('잠근 방에서는 빼지 않고, 잠근 방으로 넣지도 않는다', () => {
    const res = spillOverCapacity({ row, placements, rooms, students, entries, capacityOf, lockedRow: { B: true } });
    expect(res.moved).toEqual([]); // 받아 줄 유일한 방 B 가 잠겨 있으니 아무도 안 움직입니다.
  });
});

describe('학번순으로 고르게 나누기', () => {
  const BANS: SeatBan[] = [
    { cell: 'K(4)-1반', size: 30 },
    { cell: 'K(4)-2반', size: 30 },
    { cell: 'K(4)-3반', size: 31 },
  ];

  it('분반을 보지 않고 과목 단위로 실을 잡는다 — 칸 이름은 분반이 아니라 N실', () => {
    const plan = planRooms({ bans: BANS, rooms: ROOMS, nonTakers: 0, mode: 'student_id' });

    expect(plan.mode).toBe('student_id');
    expect(plan.ok).toBe(true);
    // 큰 방부터 40+30+28 = 98석 >= 91명 이므로 3실.
    expect(Object.keys(plan.exam)).toHaveLength(3);
    expect(Object.values(plan.exam).sort()).toEqual(['K(4)-1실', 'K(4)-2실', 'K(4)-3실']);
    expect(plan.notes.join(' ')).toMatch(/학번순으로 3실에 고르게 앉힙니다/);
  });

  it('실을 더 열어 두었으면 그만큼 쓴다 — 늘린 실이 놀지 않게', () => {
    // 이미 4실에 이 과목이 열려 있는 상태.
    const current = { extra_9: 'K(4)-1반', extra_8: 'K(4)-2반', room_1: 'K(4)-3반', room_2: 'K(4)-4반' };
    const plan = planRooms({ bans: BANS, rooms: ROOMS, nonTakers: 0, mode: 'student_id', current });

    expect(Object.keys(plan.exam)).toHaveLength(4);
    expect(plan.notes.join(' ')).toMatch(/학번순으로 4실에 고르게 앉힙니다/);
  });

  it('좌석이 모자라면 학번순이어도 모자란다고 말한다', () => {
    const tiny: SeatRoom[] = [{ id: 'room_4', name: '3-4', capacity: 24 }];
    const plan = planRooms({ bans: BANS, rooms: tiny, nonTakers: 0, mode: 'student_id' });

    expect(plan.ok).toBe(false);
    expect(plan.seatShort).toBe(91 - 24);
    expect(plan.notes.join(' ')).toMatch(/시험 좌석이 67석 모자랍니다/);
  });

  it('과목이 둘이면 과목마다 따로 실을 잡는다', () => {
    const bans: SeatBan[] = [...BANS, { cell: 'M(4)-1반', size: 20 }];
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 0, mode: 'student_id' });

    const cells = Object.values(plan.exam);
    expect(cells.filter(c => c.startsWith('K(4)'))).toHaveLength(3);
    expect(cells.filter(c => c.startsWith('M(4)'))).toHaveLength(1);
  });
});

describe('검토에서 찾은 반례', () => {
  it('학번순: 과목이 들어온 차례에 따라 되고 안 되고가 갈리지 않는다', () => {
    // 방 40석·10석, A과목 5명·B과목 38명.
    // 5명짜리가 40석을 먼저 차지하면 38명이 10석밖에 못 받습니다.
    const rooms: SeatRoom[] = [
      { id: 'big', name: '세미나실', capacity: 40 },
      { id: 'small', name: '3-1', capacity: 10 },
    ];
    const size: Record<string, number> = { 'A(4)-1반': 5, 'B(4)-1반': 38 };
    for (const order of [['A(4)-1반', 'B(4)-1반'], ['B(4)-1반', 'A(4)-1반']]) {
      const bans: SeatBan[] = order.map(cell => ({ cell, size: size[cell] }));
      const plan = planRooms({ bans, rooms, nonTakers: 0, mode: 'student_id' });
      expect(plan.ok).toBe(true);
      expect(plan.seatShort).toBe(0);
      expect(plan.exam['big']).toBe('B(4)-1실');   // 많은 쪽이 큰 방
      expect(plan.exam['small']).toBe('A(4)-1실');
    }
  });

  it('학번순: 칸 이름만 바뀐 것은 고사실이 바뀐 것으로 세지 않는다', () => {
    const rooms: SeatRoom[] = [
      { id: 'r1', name: '3-1', capacity: 30 },
      { id: 'r2', name: '3-2', capacity: 30 },
    ];
    const bans: SeatBan[] = [
      { cell: '수학(4)-1반', size: 25 },
      { cell: '수학(4)-2반', size: 25 },
    ];
    const current = { r1: '수학(4)-1반', r2: '수학(4)-2반' };
    const plan = planRooms({ bans, rooms, nonTakers: 0, mode: 'student_id', current });

    expect(plan.moves).toBe(2);         // 칸 글자는 바뀝니다('-1실')
    expect(plan.roomsChanged).toBe(0);  // 그래도 고사실 구성은 그대로입니다
  });

  it('분반대로: 큰 분반이 작은 방에 있으면 합계가 맞아도 다시 짠다', () => {
    // 28명이 25석에, 25명이 30석에. 합계로는 되지만(55>=53) 바꿔 앉히면 그냥 풀립니다.
    const rooms: SeatRoom[] = [
      { id: 'r30', name: '3-1', capacity: 30 },
      { id: 'r25', name: '3-2', capacity: 25 },
    ];
    const bans: SeatBan[] = [{ cell: 'X-1반', size: 28 }, { cell: 'X-2반', size: 25 }];
    const current = { r25: 'X-1반', r30: 'X-2반' };
    const plan = planRooms({ bans, rooms, nonTakers: 0, current });

    expect(plan.exam['r30']).toBe('X-1반'); // 28명은 30석으로
    expect(plan.exam['r25']).toBe('X-2반'); // 25명은 25석으로
    expect(plan.moves).toBeGreaterThan(0);
  });
});
