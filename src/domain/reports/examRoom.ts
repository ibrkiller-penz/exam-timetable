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

  // 좌석 좌표는 실제로 그 교실에 앞는 사람 수로 계산해야
  // 좌석배치도와 번호가 어긋나지 않습니다. 별도 응시자는 뺀 수입니다.
  const seatedCount = filtered.filter(r => !r.separateRoom).length;

  const students = filtered
    .sort((a, b) => a.seq - b.seq)
    .map(r => {
      let pSeat = r.seat;
      if (r.seat !== null) {
        const roomObj = rooms.find(rm => rm.roomName === r.examRoom);
        if (roomObj) {
          const total = seatedCount;
          pSeat = calcPhysicalSeatNum(r.seat, roomObj.cols || 5, total, roomObj.layoutDirection || 'col', roomObj.rows);
        }
      }
      return {
        seq: r.seq,
        hakbun: hakbun(r.grade, r.ban, r.num),
        name: r.name,
        seat: pSeat,
        // 별도 고사장에서 따로 보는 학생입니다. 명단에는 남기고 좌석만 비웁니다.
        // 감독 선생님이 입실할 때 이 명렬을 보고 누가 어디 있는지 압니다.
        note: r.separateRoom
          ? (r.separateRoom > 1 ? `별도고사실 응시중(${r.separateRoom}실)` : '별도고사실 응시중')
          : '',
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
