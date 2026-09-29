import { describe, it, expect, beforeAll } from 'vitest';
import { sanitizePlacementGrid } from '../../src/domain/autoPlace';
import { subjectBanEntries } from '../../src/domain/placement';
import { ExamRoom } from '../../src/domain/types';

/**
 * 손으로 맞춘 배치가 파일을 다시 열면 풀리던 것.
 *
 * 제보(최희정 선생님): 분반 2개를 손으로 3개 고사실로 나누고, 인원을 맞춰
 * 옮기고, 잠그고, 저장했다. 닫았다 다시 열면 그 과목들이 빨간 미배치로 돌아간다.
 * 새 버전에서 옛 저장 파일을 열어도 같다.
 *
 * 원인: 파일을 열 때마다 sanitizePlacementGrid 가 '편성현황의 분반 이름과
 * 똑같지 않은 시험 칸' 을 지웠다. 그런데 정상인 칸도 분반 이름과 다르다.
 *  - 손으로 시험실을 하나 더 열면 생기는 세 번째 칸: `일본어-3반`
 *  - 학번순(원반)으로 나눈 칸: `일본어-1실`
 * 칸이 지워지면 거기 옮겨 둔 학생이 갈 방을 잃어 미배치가 된다.
 */

const room = (id: string, name: string, ban: string): ExamRoom =>
  ({ id, banName: ban, stuCount: 28, maxClassSize: 28, roomName: name, capacity: 28 });
const rooms = [room('r1', '2-1', '1반'), room('r2', '2-2', '2반'), room('r3', '2-3', '3반'), room('r4', '2-4', '4반')];

// 일본어는 편성현황에 분반이 2개뿐입니다.
const subjectBans = [
  { subject: '일본어Ⅰ(4)', room: 'g1', stuCount: 40, subjectSeq: 1 },
  { subject: '일본어Ⅰ(4)', room: 'g2', stuCount: 40, subjectSeq: 1 },
  { subject: '법과 사회(4)', room: 'h1', stuCount: 25, subjectSeq: 1 },
];
const entries = subjectBanEntries(subjectBans);

describe('파일을 다시 열어도 손으로 맞춘 칸이 남는다', () => {
  it('손으로 연 세 번째 시험실(`-3반`)을 지우지 않는다', () => {
    const placement = { 1: { r1: '일본어Ⅰ(4)-1반', r2: '일본어Ⅰ(4)-2반', r3: '일본어Ⅰ(4)-3반', r4: '대기4반 - 20명' } };
    const out = sanitizePlacementGrid(placement, rooms, entries);
    expect(out[1].r3).toBe('일본어Ⅰ(4)-3반');
  });

  it('원반(학번순)으로 나눈 칸(`-N실`)을 지우지 않는다', () => {
    const placement = { 2: { r1: '법과 사회(4)-1실', r2: '법과 사회(4)-2실', r3: '대기3반 - 20명' } };
    const out = sanitizePlacementGrid(placement, rooms, entries);
    expect(out[2].r1).toBe('법과 사회(4)-1실');
    expect(out[2].r2).toBe('법과 사회(4)-2실');
  });

  it('편성현황에서 아예 사라진 과목의 칸만 지운다', () => {
    // NEIS 를 다시 받아 '중국어' 가 없어졌다면, 그 칸은 남겨 둘 이유가 없습니다.
    const placement = { 3: { r1: '중국어Ⅰ(4)-1반', r2: '일본어Ⅰ(4)-1반' } };
    const out = sanitizePlacementGrid(placement, rooms, entries);
    expect(out[3].r1).toBeUndefined();
    expect(out[3].r2).toBe('일본어Ⅰ(4)-1반');
  });
});

describe('예전 판에서 이미 칸이 지워진 파일도 되살린다', () => {
  it('학생은 있는데 칸이 빈 방에 칸을 다시 적는다', async () => {
    const { restoreOrphanRooms } = await import('../../src/domain/autoPlace');
    const students = [
      ...Array.from({ length: 10 }, (_, i) => ({ grade: '2', ban: '1반', num: i + 1, name: '', subjects: ['일본어Ⅰ(4)'] })),
      ...Array.from({ length: 5 }, (_, i) => ({ grade: '2', ban: '4반', num: i + 1, name: '', subjects: ['국어(4)'] })),
    ];
    const ps = { index: 1, day: 1 as never, period: 1 as never, title: '1일차 1교시', subjects: ['일본어Ⅰ(4)'], banCounts: [], banCountTotal: 0, takers: 10, nonTakers: 5 };
    // 칸은 지워졌는데 학생 자리는 남은 상태: r3 에 일본어 10명, r4 에 미응시 5명.
    const placement = { 1: { r1: '일본어Ⅰ(4)-1반' } };
    const sp = { 1: Object.fromEntries(students.map(st => [`${st.ban}-${st.num}`, st.ban === '4반' ? 'r4' : 'r3'])) };

    const { placement: out, restored } = restoreOrphanRooms(placement, sp, rooms, students, [ps as never]);
    expect(restored).toBe(2);
    expect(out[1].r3).toBe('일본어Ⅰ(4)-1실');          // 시험실로 되살림
    expect(out[1].r4).toBe('대기4반 - 5명');             // 미응시자만 있으면 대기실로
    expect(out[1].r1).toBe('일본어Ⅰ(4)-1반');           // 멀쩡한 칸은 그대로
  });
});

describe('저장 파일 열기(loadSavedState) — 손으로 옮긴 학생이 미배치가 되지 않는다', () => {
  let useAppStore: any;
  beforeAll(async () => {
    const g = globalThis as any;
    g.window = { location: { protocol: 'http:' }, addEventListener() {}, removeEventListener() {} };
    const mem = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() };
    g.window.localStorage = g.localStorage;
    g.indexedDB = { open: () => ({ addEventListener() {} }), databases: async () => [] };
    g.document = { documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } } };
    ({ useAppStore } = await import('../../src/store/appStore'));
  });

  it('세 번째 고사실로 옮긴 학생이 다시 열어도 그 방에 있다', async () => {
    const students = [
      ...Array.from({ length: 30 }, (_, i) => ({ grade: '2', ban: '1반', num: i + 1, name: '', subjects: ['일본어Ⅰ(4)'] })),
      ...Array.from({ length: 10 }, (_, i) => ({ grade: '2', ban: '2반', num: i + 1, name: '', subjects: ['일본어Ⅰ(4)'] })),
    ];
    // 손으로: 1분반 30명 중 10명을 세 번째 고사실(r3)로 옮겨 20·10·10 으로 맞췄습니다.
    const sp: Record<string, string> = {};
    students.forEach((st, i) => { sp[`${st.ban}-${st.num}`] = st.ban === '2반' ? 'r2' : (i < 20 ? 'r1' : 'r3'); });

    const base = useAppStore.getState();
    const saved = {
      ...base,
      activeGrade: '2',
      neis: [],
      rooms,
      subjectBans,
      students,
      placement: { 1: { r1: '일본어Ⅰ(4)-1반', r2: '일본어Ⅰ(4)-2반', r3: '일본어Ⅰ(4)-3반' } },
      studentPlacements: { 1: sp },
      lockedCells: { 1: { r1: true, r2: true, r3: true } },
    };
    // 상태는 저장(IndexedDB)보다 먼저 바뀝니다. 시험용 가짜 저장소는 끝나지 않으므로 기다리지 않습니다.
    void useAppStore.getState().loadSavedState(saved);
    await new Promise(r => setTimeout(r, 0));

    const st = useAppStore.getState();
    const row = st.placement[1] ?? {};
    const 미배치 = students.filter(s => {
      const rid = st.studentPlacements?.[1]?.[`${s.ban}-${s.num}`];
      return !rid || !row[rid];
    });
    expect(row.r3).toBe('일본어Ⅰ(4)-3반');
    expect(미배치).toHaveLength(0);
    expect(st.lockedCells?.[1]?.r3).toBe(true);   // 잠금도 그대로
  });
});
