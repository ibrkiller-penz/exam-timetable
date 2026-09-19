import { AttendanceRow, ExamDay, ExamTime, ExamRoom, DayIdx, PeriodIdx, DayLabel, PeriodLabel } from '../types';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export interface RoomTimetableCell {
  subject: string;
  /** 실제로 이 교실에 앜는 인원. 별도 고사실로 간 학생은 뺄 수입니다. */
  stuCount: number | '';
  /** 그중 별도 고사실에서 보는 학생 수. 감독 선생님이 인원을 맞추는 데 씌니다. */
  separateCount: number;
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
        // 별도 고사실로 간 학생은 이 교실에 없습니다. 자리를 잡지 않으므로
        // 응시자수에서 빼고, 몇 명이 나갔는지를 따로 알립니다.
        const sep = matched.filter(r => r.separateRoom).length;
        grid[p][d.day] = {
          subject: first.subject === '미응시' ? '대기실' : first.subject,
          stuCount: matched.length - sep,
          separateCount: sep,
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
            separateCount: 0,
            timeStr,
          };
        } else {
          grid[p][d.day] = {
            subject: '',
            stuCount: '',
            separateCount: 0,
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
