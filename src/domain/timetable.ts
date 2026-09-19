import { DayIdx, PeriodIdx, SlotKey, slotKey, Timetable, SlotStatus, DayLoad, Student, SubjectSummary, ExamDay, ExamTime, StudentKey } from './types';
import { MSG } from './messages';

export function canSameTime(
  subs: string[],
  takers: Map<string, Set<StudentKey>>
): boolean {
  const validSubs = Array.from(new Set(subs.filter(s => takers.has(s))));
  for (let i = 0; i < validSubs.length; i++) {
    const setA = takers.get(validSubs[i])!;
    for (let j = i + 1; j < validSubs.length; j++) {
      const setB = takers.get(validSubs[j])!;
      for (const st of setA) {
        if (setB.has(st)) return false;
      }
    }
  }
  return true;
}

export function slotStatus(
  d: DayIdx,
  p: PeriodIdx,
  timetable: Timetable,
  days: ExamDay[],
  times: ExamTime[],
  takers: Map<string, Set<StudentKey>>
): SlotStatus {
  const subs = timetable[slotKey(d, p)]?.subjects ?? [];
  if (subs.length === 0) return { kind: 'empty' };

  // Loose rule check: is there any time configured for period p in any day?
  const hasAnyTimeForPeriod = times.some(t => t.period === p && t.time && t.time.trim() !== '');
  if (!hasAnyTimeForPeriod) {
    return { kind: 'error', code: 'NO_TIME', message: MSG.S6_ST_NO_TIME };
  }

  const dayDate = days[d - 1]?.date;
  if (!dayDate || dayDate.trim() === '') {
    return { kind: 'error', code: 'NO_DATE', message: MSG.S6_ST_NO_DATE };
  }

  if (!canSameTime(subs, takers)) {
    return { kind: 'error', code: 'CONFLICT', message: MSG.S6_ST_CONFLICT };
  }

  return { kind: 'ok' };
}

export function duplicateSubjects(timetable: Timetable): string[] {
  const counts = new Map<string, number>();
  for (const slot of Object.values(timetable)) {
    for (const sub of slot.subjects) {
      counts.set(sub, (counts.get(sub) ?? 0) + 1);
    }
  }
  const duplicates: string[] = [];
  for (const [sub, count] of counts.entries()) {
    if (count > 1) duplicates.push(sub);
  }
  return duplicates;
}

export function remainSubjects(
  evalSubjects: SubjectSummary[],
  timetable: Timetable
): string[] {
  const placed = new Set<string>();
  for (const slot of Object.values(timetable)) {
    for (const sub of slot.subjects) {
      placed.add(sub);
    }
  }
  return evalSubjects.filter(e => !placed.has(e.subject)).map(e => e.subject);
}

export function canSubjectsForSlot(
  slot: SlotKey | null,
  evalSubjects: SubjectSummary[],
  timetable: Timetable,
  takers: Map<string, Set<StudentKey>>
): string[] {
  if (!slot) return [];
  const remain = remainSubjects(evalSubjects, timetable);
  if (remain.length === 0) return [];
  const cur = timetable[slot]?.subjects ?? [];
  if (cur.length === 0) return remain;
  return remain.filter(s => canSameTime([...cur, s], takers));
}

export function dayLoad(
  day: DayIdx,
  timetable: Timetable,
  students: Student[]
): DayLoad {
  const daySubs = new Set<string>();
  for (let p = 1; p <= 5; p++) {
    const subs = timetable[slotKey(day, p as PeriodIdx)]?.subjects ?? [];
    for (const s of subs) daySubs.add(s);
  }

  const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const st of students) {
    let count = 0;
    for (const s of st.subjects) {
      if (daySubs.has(s)) count++;
    }
    if (count > 5) {
      return { counts, error: MSG.S6_LOAD_ERR };
    }
    counts[count]++;
  }

  return { counts, error: null };
}

export function studentsWithLoad(
  day: DayIdx,
  n: number,
  timetable: Timetable,
  students: Student[]
): string[] {
  const daySubs = new Set<string>();
  for (let p = 1; p <= 5; p++) {
    const subs = timetable[slotKey(day, p as PeriodIdx)]?.subjects ?? [];
    for (const s of subs) daySubs.add(s);
  }

  const results: string[] = [];
  for (const st of students) {
    const stSubsInDay = st.subjects.filter(s => daySubs.has(s));
    if (stSubsInDay.length === n) {
      const banStr = st.ban.padStart(3, ' ');
      const numStr = st.num < 10 ? ` ${st.num}` : `${st.num}`;
      const subNames = stSubsInDay
        .map(s => {
          const idx = s.indexOf('(');
          return idx !== -1 ? s.slice(0, idx).trim() : s.trim();
        })
        .join('  ');
      results.push(`${banStr} ${numStr}번 ${st.name}: ${subNames}`);
    }
  }
  return results;
}
