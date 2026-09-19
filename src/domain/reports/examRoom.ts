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
    // 별도 고사실에서 보는 학생은 명단 끝으로 보냅니다.
    // 앞쪽은 이 교실에 실제로 앜는 학생들이라 연번과 좌석이 나란히 떨어집니다.
    .sort((a, b) => {
      const sa = a.separateRoom ? 1 : 0;
      const sb = b.separateRoom ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return a.seq - b.seq;
    })
    .map((r, idx) => {
      let pSeat = r.seat;
      if (r.seat !== null) {
        const roomObj = rooms.find(rm => rm.roomName === r.examRoom);
        if (roomObj) {
          const total = seatedCount;
          pSeat = calcPhysicalSeatNum(r.seat, roomObj.cols || 5, total, roomObj.layoutDirection || 'col', roomObj.rows);
        }
      }
      return {
        seq: idx + 1,
        hakbun: hakbun(r.grade, r.ban, r.num),
        name: r.name,
        seat: pSeat,
        // 비고 칸이 좁아 짧게 씨고, 별도실이 여럿이면 번호를 붙입니다.
        note: r.separateRoom ? (r.separateRoom > 1 ? `별도 ${r.separateRoom}실` : '별도') : '',
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
