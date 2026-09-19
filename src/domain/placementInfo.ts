import { Timetable, Student, SubjectSummary, PlacementSlot, DayIdx, PeriodIdx, slotKey } from './types';

export function buildPlacementInfo(
  timetable: Timetable,
  students: Student[],
  evalSubjects: SubjectSummary[]
): PlacementSlot[] {
  const out: PlacementSlot[] = [];
  let index = 0;
  const safeEval = evalSubjects || [];
  const safeStudents = students || [];
  const safeTimetable = timetable || {};
  const evalMap = new Map(safeEval.map(e => [e.subject, e]));

  // 시험이 있는 날은 그날 마지막 시험 교시까지가 모두 배치 대상입니다.
  // 중간에 과목이 없는 교시(예: 2일차 1교시)에도 학생들은 등교해 있으므로
  // 전교생이 자기 반에서 대기하는 교시로 잡습니다.
  const lastExamPeriodByDay = new Map<number, number>();
  for (let d = 1; d <= 5; d++) {
    for (let p = 5; p >= 1; p--) {
      if ((safeTimetable[slotKey(d as DayIdx, p as PeriodIdx)]?.subjects ?? []).length > 0) {
        lastExamPeriodByDay.set(d, p);
        break;
      }
    }
  }

  const makeSlot = (d: number, p: number, subs: string[], slotIndex: number): PlacementSlot => {
    const banCounts = subs.map(s => evalMap.get(s)?.banCount ?? 0);
    const takers = safeStudents.filter(st => st.subjects.some(x => subs.includes(x))).length;
    return {
      index: slotIndex,
      day: d as DayIdx,
      period: p as PeriodIdx,
      title: `${d}일차 ${p}교시`,
      subjects: subs,
      banCounts,
      banCountTotal: banCounts.reduce((a, b) => a + b, 0),
      takers,
      nonTakers: Math.max(0, safeStudents.length - takers),
    };
  };

  // index는 배치 데이터(placement / studentPlacements / lockedCells / slotRoomCapacity)의 키로
  // 그대로 저장됩니다. 그래서 시험이 있는 교시에 먼저 예전과 똑같은 번호를 매기고,
  // 새로 포함되는 '전원 대기' 교시는 그 뒤 번호를 씁니다.
  // 중간에 번호를 끼워 넣으면 이미 저장된 배치가 통째로 한 칸씩 밀립니다.
  const waitOnly: { d: number; p: number }[] = [];

  for (let d = 1; d <= 5; d++) {
    const lastExamPeriod = lastExamPeriodByDay.get(d);
    if (!lastExamPeriod) continue; // 시험이 하나도 없는 날은 고사장 배치 대상이 아닙니다.

    for (let p = 1; p <= lastExamPeriod; p++) {
      const subs = safeTimetable[slotKey(d as DayIdx, p as PeriodIdx)]?.subjects ?? [];
      if (subs.length === 0) {
        waitOnly.push({ d, p });
        continue;
      }
      index++;
      out.push(makeSlot(d, p, subs, index));
    }
  }

  for (const { d, p } of waitOnly) {
    index++;
    out.push(makeSlot(d, p, [], index));
  }

  // 화면에는 날짜·교시 순으로 보여줍니다.
  return out.sort((a, b) => (a.day !== b.day ? a.day - b.day : a.period - b.period));
}
