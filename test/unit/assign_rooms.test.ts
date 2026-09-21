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

  it('정원을 넘겨 억지로 앉히지 않는다 — 안 되면 무엇이 모자란지 말한다', () => {
    // 2일차 3교시의 실제 모습입니다. 30·30·31명인데 30석 이상 방은 둘뿐입니다.
    const bans: SeatBan[] = [
      { cell: '심화 영어 독해Ⅰ(4)-1반', size: 30 },
      { cell: '심화 영어 독해Ⅰ(4)-2반', size: 30 },
      { cell: '심화 영어 독해Ⅰ(4)-3반', size: 31 },
    ];
    const plan = planRooms({ bans, rooms: ROOMS, nonTakers: 72 });

    expect(plan.ok).toBe(false);
    // 큰 둘은 앉고 하나만 못 앉습니다. 손해를 최소로 봅니다.
    expect(plan.unseated).toHaveLength(1);
    expect(plan.unseated[0].size).toBe(30);
    expect(plan.exam['extra_9']).toBe('심화 영어 독해Ⅰ(4)-3반'); // 31명은 40석에만 들어갑니다
    // 30명짜리가 둘이라 어느 쪽이 30석 방에 가든 같습니다. 크기만 봅니다.
    expect(bans.find(b => b.cell === plan.exam['extra_8'])?.size).toBe(30);
    // 무엇을 하면 되는지 숫자로 알려 줍니다.
    expect(plan.notes.join(' ')).toMatch(/2석 모자랍니다/);
    expect(plan.notes.join(' ')).toMatch(/정원을 30석으로 올리거나/);
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
