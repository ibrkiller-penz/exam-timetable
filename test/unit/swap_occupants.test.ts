import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

/**
 * 8. 학생 배치에서 칸을 끌어 두 고사실을 맞바꾸는 동작.
 *
 * 정원이 다른데 큰 무리가 좁은 방에 들어간 경우를 바로잡는 길입니다.
 * 고사장 구성(쓰는 방·정원)은 건드리지 않고 두 방의 짝만 바꿉니다.
 *
 * 스토어는 브라우저 것들(window·localStorage·indexedDB)을 건드리므로,
 * 이 파일에서만 쓰는 만큼의 껍데기를 두고 불러옵니다. jsdom 을 끌어들이면
 * 모든 테스트가 느려집니다.
 */
let useAppStore: any;

beforeAll(async () => {
  const g = globalThis as any;
  g.window = { location: { protocol: 'http:' }, addEventListener() {}, removeEventListener() {} };
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  g.window.localStorage = g.localStorage;
  g.indexedDB = { open: () => ({ addEventListener() {} }), databases: async () => [] };
  g.document = { documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } } };
  ({ useAppStore } = await import('../../src/store/appStore'));
});

describe('두 고사실의 내용 맞바꾸기', () => {
  const rooms: any[] = [
    { id: 'A', banName: '1반', stuCount: 24, maxClassSize: 24, roomName: '3-1', capacity: 24 },
    { id: 'B', banName: '2반', stuCount: 40, maxClassSize: 40, roomName: '세미나실', capacity: 40 },
    { id: 'C', banName: '3반', stuCount: 28, maxClassSize: 28, roomName: '3-3', capacity: 28 },
  ];
  const students: any[] = [];
  for (let n = 1; n <= 30; n++) students.push({ grade: '3', ban: '1반', num: n, name: '', subjects: ['수학'] });
  for (let n = 1; n <= 10; n++) students.push({ grade: '3', ban: '2반', num: n, name: '', subjects: ['수학'] });

  const baseRow = { A: '수학-1반', B: '수학-2반', C: '대기 - 0명' };
  const basePlacements: Record<string, string> = {};
  for (let n = 1; n <= 30; n++) basePlacements[`1반-${n}`] = 'A'; // 30명이 24석 방에
  for (let n = 1; n <= 10; n++) basePlacements[`2반-${n}`] = 'B'; // 10명이 40석 방에

  beforeEach(() => {
    useAppStore.setState({
      rooms, students,
      placement: { 1: { ...baseRow } },
      studentPlacements: { 1: { ...basePlacements } },
      lockedCells: {},
      stages: { ...useAppStore.getState().stages, stage4: false, step7: true },
    });
  });

  it('학생과 칸 이름이 함께 옮겨간다 — 인쇄물의 응시분반이 어긋나지 않게', () => {
    useAppStore.getState().swapSlotRoomOccupants(1, 'A', 'B');
    const s = useAppStore.getState();

    expect(s.placement[1].A).toBe('수학-2반');
    expect(s.placement[1].B).toBe('수학-1반');
    expect(s.studentPlacements[1]['1반-1']).toBe('B'); // 30명이 40석 방으로
    expect(s.studentPlacements[1]['2반-1']).toBe('A'); // 10명이 24석 방으로
    expect(Object.values(s.studentPlacements[1]).filter(r => r === 'B')).toHaveLength(30);
  });

  it('7단계가 확정되어 있어도 된다 — 고사장 구성은 그대로이기 때문', () => {
    expect(useAppStore.getState().stages.step7).toBe(true);
    expect(() => useAppStore.getState().swapSlotRoomOccupants(1, 'A', 'B')).not.toThrow();

    const s = useAppStore.getState();
    expect(s.rooms.map((r: any) => r.id)).toEqual(['A', 'B', 'C']);      // 쓰는 방 그대로
    expect(s.rooms.map((r: any) => r.capacity)).toEqual([24, 40, 28]);   // 정원 그대로
    expect(Object.keys(s.placement[1]).sort()).toEqual(['A', 'B', 'C']);
  });

  it('8단계가 확정되면 거절한다', () => {
    useAppStore.setState({ stages: { ...useAppStore.getState().stages, stage4: true } });
    expect(() => useAppStore.getState().swapSlotRoomOccupants(1, 'A', 'B')).toThrow();
  });

  it('잠근 칸과 배치금지는 맞바꾸지 않는다', () => {
    useAppStore.setState({ lockedCells: { 1: { A: true } } });
    useAppStore.getState().swapSlotRoomOccupants(1, 'A', 'B');
    expect(useAppStore.getState().placement[1].A).toBe('수학-1반'); // 그대로

    useAppStore.setState({ lockedCells: {}, placement: { 1: { ...baseRow, C: '배치금지' } } });
    useAppStore.getState().swapSlotRoomOccupants(1, 'A', 'C');
    expect(useAppStore.getState().placement[1].C).toBe('배치금지');
    expect(useAppStore.getState().placement[1].A).toBe('수학-1반');
  });
});
