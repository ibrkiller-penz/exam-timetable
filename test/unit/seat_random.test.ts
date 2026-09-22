import { describe, it, expect, beforeAll } from 'vitest';

/**
 * 좌석 무작위.
 *
 * 예전에는 연번(seq)을 좌석에 뿌렸습니다. 연번은 별도 응시자까지 세는 번호라,
 * 그 교실에 별도 응시자가 있으면 좌석 번호가 실제 인원보다 커집니다.
 * 좌석배치도는 인원을 넘는 번호를 그리지 않으므로 그 학생이 종이에서 사라졌습니다.
 *
 * 스토어는 브라우저 것들을 건드리므로 이 파일에서만 쓸 껍데기를 두고 불러옵니다.
 */
let useAppStore: any;

beforeAll(async () => {
  const g = globalThis as any;
  g.window = { location: { protocol: 'http:' }, addEventListener() {}, removeEventListener() {} };
  const mem = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  g.window.localStorage = g.localStorage;
  g.indexedDB = { open: () => ({ addEventListener() {} }), databases: async () => [] };
  g.document = { documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } } };
  ({ useAppStore } = await import('../../src/store/appStore'));
});

const att = (over: any = {}) => ({
  key1: 'k', key2: 'k', key3: 'k',
  day: '1일차', period: '1교시', examRoom: '3-1', subject: '한국사(1)',
  grade: '3', ban: '1반', num: 1, name: '', classRoom: '1반',
  seq: 1, seat: 1, separateRoom: undefined, ...over,
});

describe('좌석 무작위', () => {
  it('별도 응시자가 있어도 좌석 번호가 인원을 넘지 않는다', () => {
    // 다섯 명 중 둘째가 별도 고사실. 연번은 1~5, 좌석은 1~4 입니다.
    const rows = [
      att({ num: 1, seq: 1, seat: 1 }),
      att({ num: 2, seq: 2, seat: null, separateRoom: '별도실1' }),
      att({ num: 3, seq: 3, seat: 2 }),
      att({ num: 4, seq: 4, seat: 3 }),
      att({ num: 5, seq: 5, seat: 4 }),
    ];
    useAppStore.setState({ attendance: rows, stages: { ...useAppStore.getState().stages, stage5: false } });

    for (let i = 0; i < 30; i++) {
      useAppStore.getState().setAttendanceRandom();
      const now = useAppStore.getState().attendance;
      const seats = now.filter((r: any) => !r.separateRoom).map((r: any) => r.seat);
      expect(seats.every((s: number) => s >= 1 && s <= 4)).toBe(true);
      expect(new Set(seats).size).toBe(4);              // 겹치지 않습니다
      expect(now[1].seat).toBe(null);                    // 별도 응시자는 좌석이 없습니다
    }
  });

  it('대기실은 섞지 않는다', () => {
    const rows = [
      att({ examRoom: '3-4', subject: '대기4반', num: 1, seq: 1, seat: 1 }),
      att({ examRoom: '3-4', subject: '대기4반', num: 2, seq: 2, seat: 2 }),
      att({ examRoom: '3-4', subject: '대기4반', num: 3, seq: 3, seat: 3 }),
    ];
    useAppStore.setState({ attendance: rows, stages: { ...useAppStore.getState().stages, stage5: false } });
    for (let i = 0; i < 20; i++) useAppStore.getState().setAttendanceRandom();
    expect(useAppStore.getState().attendance.map((r: any) => r.seat)).toEqual([1, 2, 3]);
  });
});
