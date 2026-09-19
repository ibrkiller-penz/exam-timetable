import { AttendanceRow, DayLabel, PeriodLabel, ExamRoom } from '../types';
import { calcPhysicalSeatNum } from './seatMap';
import { hakbun } from '../util/text';

export interface ExamRoomReportData {
  day: DayLabel;
  period: PeriodLabel;
  examRoom: string;
  subject: string;
  isWaitRoom: boolean;
  /** 이 교실에 배정된 전체 인원 (별도 응시자 포함). */
  totalStudents: number;
  /** 실제로 이 교실에 앉는 학생 (연번·좌석이 나란히). */
  students: Array<{
    seq: number;
    hakbun: string;
    name: string;
    seat: number | null;
    note: string;
  }>;
  /** 이 교실 소속이지만 별도 고사실에서 보는 학생. 명단에서 빼고 아래에 따로 알립니다. */
  separate: Array<{
    hakbun: string;
    name: string;
    room: number;
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

  // 별도 고사실에서 보는 학생은 이 교실에 앉지 않습니다.
  // 좌석 명단에서 빼고, 아래 안내로 따로 알립니다. 명단에 섞어 두면
  // 연번이 학번 순서를 벗어나고(30123이 맨 끝) 좌석 없는 줄이 끼어 헷갈립니다.
  const seated = filtered.filter(r => !r.separateRoom).sort((a, b) => a.seq - b.seq);
  const seatedCount = seated.length;

  const roomObj = rooms.find(rm => rm.roomName === examRoom);
  const students = seated.map((r, idx) => {
    let pSeat = r.seat;
    if (r.seat !== null && roomObj) {
      pSeat = calcPhysicalSeatNum(r.seat, roomObj.cols || 5, seatedCount, roomObj.layoutDirection || 'col', roomObj.rows);
    }
    return {
      seq: idx + 1,
      hakbun: hakbun(r.grade, r.ban, r.num),
      name: r.name,
      seat: pSeat,
      note: '',
    };
  });

  const separate = filtered
    .filter(r => r.separateRoom)
    .sort((a, b) => a.ban.localeCompare(b.ban, 'ko', { numeric: true }) || a.num - b.num)
    .map(r => ({
      hakbun: hakbun(r.grade, r.ban, r.num),
      name: r.name,
      room: r.separateRoom!,
    }));

  return {
    day,
    period,
    examRoom,
    subject: first.subject,
    isWaitRoom,
    totalStudents: filtered.length,
    students,
    separate,
  };
}
