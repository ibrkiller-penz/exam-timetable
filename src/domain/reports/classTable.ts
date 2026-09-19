import { AttendanceRow, ExamDay, ExamTime, ExamRoom, Student, DayIdx, PeriodIdx, DayLabel, PeriodLabel } from '../types';
import { onlySubject } from '../util/text';

export interface ClassTableStudentRow {
  num: number;
  name: string;
  periods: Record<PeriodIdx, { subject: string; room: string }>;
}

export interface ClassTableReportData {
  ban: string;
  day: DayIdx;
  dayDateText: string;
  roomName: string;
  activePeriods: PeriodIdx[];
  students: ClassTableStudentRow[];
}

export function buildClassTableReport(
  ban: string,
  day: DayIdx,
  students: Student[],
  attendance: AttendanceRow[],
  days: ExamDay[],
  times: ExamTime[],
  rooms: ExamRoom[]
): ClassTableReportData {
  const banStudents = students.filter(s => s.ban === ban).sort((a, b) => a.num - b.num);
  const banRoom = rooms.find(r => r.banName === ban)?.roomName ?? '';
  const dayLabel: DayLabel = `${day}일차`;
  const dayDate = days[day - 1]?.date ?? '';

  const activePeriods = [1, 2, 3, 4, 5].filter(p =>
    times.some(t => t.period === p && t.time && t.time.trim() !== '')
  ) as PeriodIdx[];

  const studentRows: ClassTableStudentRow[] = banStudents.map(s => {
    const periodMap: Record<PeriodIdx, { subject: string; room: string }> = {} as any;

    for (const p of activePeriods) {
      const pLabel: PeriodLabel = `${p}교시`;
      const k3 = `${s.ban}${s.num}번${dayLabel}${pLabel}`;
      const att = attendance.find(a => a.key3 === k3);

      if (att) {
        periodMap[p] = {
          subject: att.subject === '미응시' ? '미응시' : onlySubject(att.subject),
          room: att.examRoom,
        };
      } else {
        periodMap[p] = {
          subject: '자습',
          room: banRoom,
        };
      }
    }

    return {
      num: s.num,
      name: s.name,
      periods: periodMap,
    };
  });

  return {
    ban,
    day,
    dayDateText: dayDate,
    roomName: banRoom,
    activePeriods,
    students: studentRows,
  };
}
