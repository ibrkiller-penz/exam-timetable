import { AttendanceRow, ExamDay, ExamTime, ExamRoom, DayIdx, PeriodIdx, DayLabel, PeriodLabel } from '../types';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export interface RoomTimetableCell {
  subject: string;
  stuCount: number | '';
  timeStr: string;
}

export interface RoomTimetableReportData {
  room: ExamRoom;
  activeDays: Array<{ day: DayIdx; label: string; dateText: string }>;
  activePeriods: PeriodIdx[];
  grid: Record<PeriodIdx, Record<DayIdx, RoomTimetableCell>>;
}

export function buildRoomTimetableReport(
  room: ExamRoom,
  attendance: AttendanceRow[],
  days: ExamDay[],
  times: ExamTime[]
): RoomTimetableReportData {
  const activeDays = days
    .filter(d => d.date && d.date.trim() !== '')
    .map(d => {
      const parsed = dayjs(d.date).locale('ko');
      return {
        day: d.day,
        label: `${d.day}일차`,
        dateText: `${parsed.format('M. D.')}(${parsed.format('dd')})`,
      };
    });

  const activePeriods = [1, 2, 3, 4, 5].filter(p =>
    times.some(t => t.period === p && t.time && t.time.trim() !== '')
  ) as PeriodIdx[];

  const grid: Record<PeriodIdx, Record<DayIdx, RoomTimetableCell>> = {} as any;

  for (const p of activePeriods) {
    grid[p] = {} as any;
    for (const d of activeDays) {
      const timeObj = times.find(t => t.day === d.day && t.period === p);
      const timeStr = timeObj?.time ? timeObj.time.replace(/\s/g, '') : '';

      const dayLabel: DayLabel = `${d.day}일차`;
      const periodLabel: PeriodLabel = `${p}교시`;
      const matched = attendance.filter(
        r => r.day === dayLabel && r.period === periodLabel && r.examRoom === room.roomName
      );

      if (matched.length > 0) {
        const first = matched[0];
        grid[p][d.day] = {
          subject: first.subject === '미응시' ? '대기실' : first.subject,
          stuCount: matched.length,
          timeStr,
        };
      } else {
        const anyInSlot = attendance.some(
          r => r.day === dayLabel && r.period === periodLabel
        );
        if (!anyInSlot && room.banName && room.banName !== '위탁학생') {
          grid[p][d.day] = {
            subject: '자습',
            stuCount: room.stuCount ?? '',
            timeStr,
          };
        } else {
          grid[p][d.day] = {
            subject: '',
            stuCount: '',
            timeStr: '',
          };
        }
      }
    }
  }

  return {
    room,
    activeDays,
    activePeriods,
    grid,
  };
}
