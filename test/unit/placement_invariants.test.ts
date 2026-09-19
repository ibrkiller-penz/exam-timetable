import { describe, it, expect } from 'vitest';
import { autoPlaceAll, initSlotStudentPlacements } from '../../src/domain/autoPlace';
import { buildPlacementInfo } from '../../src/domain/placementInfo';
import { subjectBanEntries } from '../../src/domain/placement';
import { normalizeNeisRooms, buildSubjectTables, buildRooms } from '../../src/domain/baseData';
import { buildStudents } from '../../src/domain/subjects';
import { isWaitCell, isForbiddenCell } from '../../src/domain/types';
import type { NeisRow, AppState, ExamRoom, PlacementSlot, Student, SubjectBanEntry } from '../../src/domain/types';

/**
 * 배치가 어떤 경우에도 지켜야 하는 약속들.
 *
 * 기능 테스트는 '이 경우에 이렇게 되나'를 봅니다.
 * 이 파일은 반대로 '무슨 일이 있어도 깨지면 안 되는 것'을 봅니다.
 * 실제로 겪은 사고가 모두 여기 걸립니다.
 *  - 응시자가 대기실에 앉아 인쇄물에 대기로 찍히던 일
 *  - 대기실에 자리가 남는데 학생이 미배치로 떠 있던 일
 *  - 분반이 쪼개져 편성현황과 명단이 어긋나던 일
 */

const capOf = (r: ExamRoom) =>
  r.capacity && r.capacity > 0 ? r.capacity : (r.maxClassSize && r.maxClassSize > 0 ? r.maxClassSize : 28);

/** 한 교시의 배치 결과를 검사해, 어긴 것을 말로 돌려줍니다. */
function violations(
  ps: PlacementSlot,
  row: Record<string, string>,
  sp: Record<string, string>,
  rooms: ExamRoom[],
  students: Student[],
  entries: Map<string, SubjectBanEntry>,
  neis?: NeisRow[]
): string[] {
  const out: string[] = [];
  const isTaker = (st: Student) => st.subjects.some(sub => ps.subjects.includes(sub));
  const seatedIn = (roomId: string) => students.filter(st => sp[`${st.ban}-${st.num}`] === roomId);

  for (const st of students) {
    const rId = sp[`${st.ban}-${st.num}`];
    if (!rId) continue;
    const val = row[rId] ?? '';
    if (!val || isForbiddenCell(val)) {
      out.push(`${st.ban}-${st.num}이(가) 쓰지 않는 칸에 앉음`);
      continue;
    }
    if (isTaker(st) && isWaitCell(val)) out.push(`응시자 ${st.ban}-${st.num}이(가) 대기실에 앉음`);
    if (!isTaker(st) && !isWaitCell(val)) out.push(`대기자 ${st.ban}-${st.num}이(가) 고사장에 앉음`);
  }

  // 대기실은 정원을 넘기지 않습니다.
  for (const r of rooms) {
    const val = row[r.id] ?? '';
    if (!val || !isWaitCell(val)) continue;
    const used = seatedIn(r.id).length;
    if (used > capOf(r)) out.push(`대기실 ${r.roomName} 정원 초과 (${used}/${capOf(r)})`);
  }

  // 자리가 남아 있는데 학생을 떠 있게 두지 않습니다.
  const unplaced = students.filter(st => !sp[`${st.ban}-${st.num}`]);
  if (unplaced.length > 0) {
    const spare = rooms.reduce((acc, r) => {
      const val = row[r.id] ?? '';
      if (!val || !isWaitCell(val)) return acc;
      return acc + Math.max(0, capOf(r) - seatedIn(r.id).length);
    }, 0);
    const waitingUnplaced = unplaced.filter(st => !isTaker(st)).length;
    if (waitingUnplaced > 0 && spare > 0) {
      out.push(`대기실에 ${spare}석 남았는데 대기자 ${waitingUnplaced}명이 미배치`);
    }
  }

  // 한 분반은 한 고사실에 모여 앉습니다.
  if (neis) {
    for (const r of rooms) {
      const val = row[r.id] ?? '';
      if (!val || isWaitCell(val) || isForbiddenCell(val)) continue;
      const banRoom = entries.get(val)?.room;
      if (!banRoom) continue;
      const members = neis.filter(n => ps.subjects.includes(n.subject) && (n.room ?? '').endsWith(banRoom));
      if (members.length === 0) continue;
      const scattered = members.filter(m => {
        const rId = sp[`${m.ban}-${m.num}`];
        return rId && rId !== r.id;
      });
      if (scattered.length > 0) {
        out.push(`${r.roomName}의 분반 ${banRoom} 학생 ${scattered.length}명이 다른 실에 앉음`);
      }
    }
  }

  return out;
}

function buildNeis(): NeisRow[] {
  const neis: NeisRow[] = [];
  const banSizes = [28, 27, 28, 27, 26, 27];
  const push = (subject: string, room: string, ban: string, num: number) =>
    neis.push({
      year: '2026', semester: '1', grade: '3학년', curriculum: '2015',
      subject, room, room2: room, track: '', ban, num, name: `학생${ban}_${num}`,
    });

  // 한국사: 전교생이 자기 반에서 봅니다.
  banSizes.forEach((size, b) => {
    for (let n = 1; n <= size; n++) push('한국사', `7차일반 ${b + 1}`, `${b + 1}반`, n);
  });

  // 생활과 윤리: 3명 중 1명만 봅니다. 이동수업이라 여러 학급에 흩어져 있습니다.
  let seq = 0;
  banSizes.forEach((size, b) => {
    for (let n = 1; n <= size; n++) {
      seq++;
      if (seq % 3 !== 0) continue;
      push('생활과 윤리', `학교지정-${'FGH'[(seq / 3) % 3]}`, `${b + 1}반`, n);
    }
  });

  return neis;
}

describe('배치가 항상 지켜야 하는 것', () => {
  const neis = normalizeNeisRooms(buildNeis());
  const { subjectSummary, subjectBans } = buildSubjectTables(neis, 1);
  const students = buildStudents(neis, subjectSummary);
  const entries = subjectBanEntries(subjectBans);
  const rooms = buildRooms(neis, subjectSummary, subjectBans);

  const timetable: AppState['timetable'] = {
    '1_1': { subjects: ['한국사'] },
    '1_2': { subjects: ['생활과 윤리'] },
    '1_3': { subjects: [] },
  };
  const slots = buildPlacementInfo(timetable, students, subjectSummary);

  it('검사가 헛돌지 않는다 (자료가 실제로 들어 있다)', () => {
    expect(students.length).toBeGreaterThan(100);
    expect(rooms.length).toBeGreaterThan(3);
    expect(slots.length).toBeGreaterThan(1);
    expect(entries.size).toBeGreaterThan(3);
  });

  it('전 교시 자동배치가 약속을 하나도 어기지 않는다', () => {
    const grid = autoPlaceAll({}, slots, rooms, entries, students);
    for (const ps of slots) {
      const row = grid[ps.index] ?? {};
      const sp = initSlotStudentPlacements(ps.index, row, slots, rooms, entries, students, neis);
      expect(`${ps.title}: ${violations(ps, row, sp, rooms, students, entries, neis).join(' / ')}`)
        .toBe(`${ps.title}: `);
    }
  });
});

/**
 * 좁은 교실만 주어 일부러 자리를 모자라게 만든 경우.
 * 실제 사고는 모두 이런 상황에서 났습니다.
 */
describe('자리가 모자랄 때도 약속을 지킨다', () => {
  const sub = '확률과 통계(4)';
  const students: Student[] = [
    ...Array.from({ length: 30 }, (_, i) => ({
      grade: '3', ban: `${(i % 3) + 1}반`, num: i + 1, name: `응시${i + 1}`, subjects: [sub],
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      grade: '3', ban: `${(i % 3) + 1}반`, num: 100 + i, name: `대기${i + 1}`, subjects: ['다른과목(4)'],
    })),
  ];

  // 고사장은 10석 하나뿐 — 응시자 30명 중 20명은 앉을 자리가 없습니다.
  const rooms: ExamRoom[] = [
    { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 10, maxClassSize: 10, capacity: 10 },
    { id: 'r2', roomName: '3-2', banName: '2반', stuCount: 25, maxClassSize: 25, capacity: 25 },
    { id: 'r3', roomName: '3-3', banName: '3반', stuCount: 25, maxClassSize: 25, capacity: 25 },
  ];

  // 분반은 둘인데 고사장은 하나뿐입니다. 분반과 고사실 수가 맞지 않으므로
  // 학번순으로 나눠 앉히게 되고, 정원을 넘는 학생이 생깁니다.
  const entries = new Map<string, SubjectBanEntry>([
    [`${sub}-1반`, { key: `${sub}-1반`, subject: sub, room: '1반', stuCount: 15, subjectSeq: 1, index: 1 }],
    [`${sub}-2반`, { key: `${sub}-2반`, subject: sub, room: '2반', stuCount: 15, subjectSeq: 1, index: 2 }],
  ]);

  const slots: PlacementSlot[] = [{
    index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시',
    subjects: [sub], banCounts: [2], banCountTotal: 2, takers: 30, nonTakers: 20,
  }];

  // r3는 담당자가 방금 연 빈 대기실입니다.
  const row = { r1: `${sub}-1반`, r2: '대기 - 20명', r3: '대기 - 0명' };

  it('자리 없는 응시자를 대기실에 앉히지 않는다', () => {
    const sp = initSlotStudentPlacements(1, row, slots, rooms, entries, students);
    expect(violations(slots[0], row, sp, rooms, students, entries).join(' / ')).toBe('');

    // 자리가 없으니 미배치로 남습니다. 담당자가 직접 옮기라는 뜻입니다.
    const unplacedTakers = students.filter(st => st.subjects.includes(sub) && !sp[`${st.ban}-${st.num}`]);
    expect(unplacedTakers.length).toBeGreaterThan(0);
  });

  it('대기자는 빈 대기실까지 모두 앉는다', () => {
    const sp = initSlotStudentPlacements(1, row, slots, rooms, entries, students);
    const unplacedWaiters = students.filter(st => !st.subjects.includes(sub) && !sp[`${st.ban}-${st.num}`]);
    expect(unplacedWaiters.length).toBe(0);
  });
});
