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

  for (let d = 1; d <= 5; d++) {
    for (let p = 1; p <= 5; p++) {
      const subs = safeTimetable[slotKey(d as DayIdx, p as PeriodIdx)]?.subjects ?? [];
      if (subs.length === 0) continue;
      index++;

      const banCounts = subs.map(s => evalMap.get(s)?.banCount ?? 0);
      const banCountTotal = banCounts.reduce((a, b) => a + b, 0);
      const takers = safeStudents.filter(st => st.subjects.some(x => subs.includes(x))).length;
      const nonTakers = Math.max(0, safeStudents.length - takers);

      out.push({
        index,
        day: d as DayIdx,
        period: p as PeriodIdx,
        title: `${d}일차 ${p}교시`,
        subjects: subs,
        banCounts,
        banCountTotal,
        takers,
        nonTakers,
      });
    }
  }

  return out;
}
