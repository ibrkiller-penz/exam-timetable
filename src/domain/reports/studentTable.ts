import { Student, AttendanceRow, ExamDay, ExamTime, ExamRoom, DayIdx, PeriodIdx, DayLabel, PeriodLabel, PlacementSlot } from '../types';
import { isWaitSubject } from '../separate';
import { onlySubject, hakbun } from '../util/text';
import { calcPhysicalSeatNum } from './seatMap';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export interface StudentTableCell {
  subject: string;
  examRoom: string;
  seat: number | null;
  timeStr: string;
}

export interface StudentTableReportData {
  student: Student;
  hakbun: string;
  activeDays: Array<{ day: DayIdx; dateText: string }>;
  activePeriods: PeriodIdx[];
  grid: Record<PeriodIdx, Record<DayIdx, StudentTableCell>>;
  unplacedSubjects: string[];
}

export function buildStudentTableReport(
  student: Student,
  attendance: AttendanceRow[],
  days: ExamDay[],
  times: ExamTime[],
  rooms: ExamRoom[],
  placementSlots: PlacementSlot[],
  showSeat: boolean = true
): StudentTableReportData {
  const activeDays = days
    .filter(d => d.date && d.date.trim() !== '')
    .map(d => {
      const parsed = dayjs(d.date).locale('ko');
      return {
        day: d.day,
        dateText: `${parsed.format('M. D.')}(${parsed.format('dd')})`,
      };
    });

  const activePeriods = [1, 2, 3, 4, 5].filter(p =>
    times.some(t => t.period === p && t.time && t.time.trim() !== '')
  ) as PeriodIdx[];

  const defaultRoom = rooms.find(r => r.banName === student.ban)?.roomName ?? '';
  const grid: Record<PeriodIdx, Record<DayIdx, StudentTableCell>> = {} as any;
  const placedSubjects = new Set<string>();

  for (const p of activePeriods) {
    grid[p] = {} as any;
    for (const d of activeDays) {
      const dayLabel: DayLabel = `${d.day}일차`;
      const pLabel: PeriodLabel = `${p}교시`;
      const k3 = `${student.ban}${student.num}번${dayLabel}${pLabel}`;
      const att = attendance.find(a => a.key3 === k3);

      const timeObj = times.find(t => t.day === d.day && t.period === p);
      const timeStr = timeObj?.time ? timeObj.time.replace(/\s/g, '') : '';

      if (att) {
        if (!isWaitSubject(att.subject)) {
          placedSubjects.add(att.subject);
        }
        let pSeat = att.seat;
        if (showSeat && att.seat !== null) {
          const roomObj = rooms.find(r => r.roomName === att.examRoom);
          if (roomObj) {
            // 별도 응시자는 그 교실에 앞지 않으므로 좌표 계산에서도 뺀니다.
            const roomAtts = attendance.filter(a => a.day === att.day && a.period === att.period && a.examRoom === att.examRoom && !a.separateRoom);
            pSeat = calcPhysicalSeatNum(att.seat, roomObj.cols || 5, roomAtts.length, roomObj.layoutDirection || 'col', roomObj.rows);
          }
        }
        grid[p][d.day] = {
          subject: isWaitSubject(att.subject) ? '자습' : onlySubject(att.subject),
          // 별도 고사실에서 보는 교시는 '(별)'을 붙여, 그 시간에는
          // 소속 교실에 없다는 것을 학생이 알게 합니다.
          examRoom: att.separateRoom ? `${att.examRoom}(별)` : att.examRoom,
          seat: showSeat ? pSeat : null,
          timeStr,
        };
      } else {
        grid[p][d.day] = {
          subject: '자습',
          examRoom: defaultRoom,
          seat: null,
          timeStr: '',
        };
      }
    }
  }

  const allExamSubjects = new Set<string>();
  for (const ps of placementSlots) {
    for (const sub of ps.subjects) {
      allExamSubjects.add(sub);
    }
  }
  const unplacedSubjects = student.subjects.filter(s => allExamSubjects.has(s) && !placedSubjects.has(s));

  return {
    student,
    hakbun: hakbun(student.grade, student.ban, student.num),
    activeDays,
    activePeriods,
    grid,
    unplacedSubjects,
  };
}
