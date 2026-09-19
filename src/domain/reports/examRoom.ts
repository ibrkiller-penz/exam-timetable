import { AttendanceRow, DayLabel, PeriodLabel, ExamRoom } from '../types';
import { calcPhysicalSeatNum } from './seatMap';
import { hakbun } from '../util/text';

export interface ExamRoomReportData {
  day: DayLabel;
  period: PeriodLabel;
  examRoom: string;
  subject: string;
  isWaitRoom: boolean;
  totalStudents: number;
  students: Array<{
    seq: number;
    hakbun: string;
    name: string;
    seat: number | null;
    note: string;
  }>;
}

export function buildExamRoomReport(
  attendance: AttendanceRow[],
  day: DayLabel,
  period: PeriodLabel,
  examRoom: string,
  rooms: ExamRoom[]
): ExamRoomReportData | null {
  const filtered = attendance.filter(
    r => r.day === day && r.period === period && r.examRoom === examRoom
  );
  if (filtered.length === 0) return null;

  const first = filtered[0];
  const isWaitRoom = first.subject === '미응시';

  const students = filtered
    .sort((a, b) => a.seq - b.seq)
    .map(r => {
      let pSeat = r.seat;
      if (r.seat !== null) {
        const roomObj = rooms.find(rm => rm.roomName === r.examRoom);
        if (roomObj) {
          const total = filtered.length;
          pSeat = calcPhysicalSeatNum(r.seat, roomObj.cols || 5, total, roomObj.layoutDirection || 'col', roomObj.rows);
        }
      }
      return {
        seq: r.seq,
        hakbun: hakbun(r.grade, r.ban, r.num),
        name: r.name,
        seat: pSeat,
        note: '',
      };
    });

  return {
    day,
    period,
    examRoom,
    subject: first.subject,
    isWaitRoom,
    totalStudents: students.length,
    students,
  };
}
