import { AttendanceRow, ExamDay, ExamTime, ExamRoom, Student, DayIdx, PeriodIdx, DayLabel, PeriodLabel } from '../types';
import { isWaitSubject } from '../separate';
import { onlySubject } from '../util/text';

export interface ClassTableStudentRow {
  num: number;
  name: string;
  periods: Record<PeriodIdx, { subject: string; room: string }>;
  /** 비고. 그날 별도 고사실에서 보는 교시가 있으면 '별도', 위탁 학생이면 '위탁'. */
  note: string;
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
    let separate = false;
    let consigned = false;

    for (const p of activePeriods) {
      const pLabel: PeriodLabel = `${p}교시`;
      const k3 = `${s.ban}${s.num}번${dayLabel}${pLabel}`;
      const att = attendance.find(a => a.key3 === k3);

      if (att) {
        if (att.separateRoom) separate = true;
        if (att.consigned) consigned = true;
        periodMap[p] = {
          subject: isWaitSubject(att.subject) ? '미응시' : onlySubject(att.subject),
          // 별도 고사실에서 보는 교시는 '(별)'을 붙입니다. 소속은 그대로 이 고사실이지만,
          // 그 시간에는 그 교실에 없다는 것을 학생과 담임이 알아야 합니다.
          room: att.separateRoom ? `${att.examRoom}(별)` : att.examRoom,
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
      note: [separate ? '별도' : '', consigned ? '위탁' : ''].filter(Boolean).join('·'),
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
