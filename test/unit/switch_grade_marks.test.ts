import { describe, it, expect, beforeAll } from 'vitest';

/**
 * 학년을 바꿀 때 별도·위탁 지정이 앞 학년 것으로 따라오던 것.
 * 예전에 저장된 학년 자료에는 그 칸이 없어서, 펼쳐 덮어도 앞 학년 값이 남았습니다.
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

describe('학년 전환', () => {
  it('예전 자료(칸 없음)로 넘어가도 앞 학년의 위탁·별도 지정이 따라오지 않는다', () => {
    const st = useAppStore.getState();
    const g3 = { ...st.gradeData?.['3'] };
    delete g3.consignedStudents;
    delete g3.separateExaminers;
    useAppStore.setState({
      activeGrade: '2',
      consignedStudents: { '1반-1': true },
      separateExaminers: { '1반-2': { room: 1, slots: 'all' } },
      gradeData: { ...(st.gradeData ?? {}), '3': g3 },
    });
    useAppStore.getState().switchGrade('3');
    const after = useAppStore.getState();
    expect(after.consignedStudents).toEqual({});
    expect(after.separateExaminers).toEqual({});
  });

  it('제 학년 지정은 돌아오면 그대로 있다', () => {
    useAppStore.setState({ consignedStudents: { '3반-3': true } });
    useAppStore.getState().switchGrade('2');
    expect(useAppStore.getState().consignedStudents).toEqual({ '1반-1': true });
    useAppStore.getState().switchGrade('3');
    expect(useAppStore.getState().consignedStudents).toEqual({ '3반-3': true });
  });
});
