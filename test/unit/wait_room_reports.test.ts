import { describe, it, expect } from 'vitest';
import { isWaitSubject, isTakingRow } from '../../src/domain/separate';
import { buildRoomTimetableReport } from '../../src/domain/reports/roomTimetable';
import { buildExamRoomReport } from '../../src/domain/reports/examRoom';
import { buildSeatMapReport } from '../../src/domain/reports/seatMap';
import { AttendanceRow, ExamRoom } from '../../src/domain/types';

/**
 * 대기실을 가려내는 자리.
 *
 * 응시현황의 과목 자리에는 `대기`, `대기2반`, `자습(대기)` 가 들어갑니다.
 * 예전 코드는 `미응시` 를 기다리고 있어서 대기실 분기가 전부 죽어 있었습니다.
 */
const row = (over: Partial<AttendanceRow> = {}): AttendanceRow => ({
  key1: 'k', key2: 'k', key3: 'k',
  day: '1일차', period: '1교시', examRoom: '3-4', subject: '대기2반',
  grade: '3', ban: '4반', num: 1, name: '가나다', classRoom: '4반',
  seq: 1, seat: 1, separateRoom: undefined, ...over,
});

describe('대기실 가려내기', () => {
  it('칸 이름에서 온 값들을 모두 대기로 본다', () => {
    for (const v of ['대기', '대기2반', '대기 - 24명', '자습(대기)', '자습', '미응시']) {
      expect(isWaitSubject(v)).toBe(true);
    }
    for (const v of ['한국사(1)', '수학(4)', '']) expect(isWaitSubject(v)).toBe(false);
  });

  it('대기 줄에는 별도 고사실을 달지 않는다', () => {
    expect(isTakingRow({ subject: '대기2반' })).toBe(false);
    expect(isTakingRow({ subject: '한국사(1)' })).toBe(true);
  });

  it('고사실 시간표에 과목 대신 대기실이라고 적는다', () => {
    const room = { id: 'r4', banName: '4반', stuCount: 28, maxClassSize: 28, roomName: '3-4', capacity: 28 };
    const rep = buildRoomTimetableReport(
      room as never,
      [row(), row({ num: 2, seq: 2, seat: 2 })],
      [{ day: 1 as never, date: '2026-07-01' }],
      [{ day: 1 as never, period: 1 as never, time: '09:00' }],
    );
    expect(rep.grid[1][1]?.subject).toBe('대기실');
  });

  it('대기실 명단과 좌석배치도가 스스로를 대기실이라고 안다', () => {
    const rooms: ExamRoom[] = [{ id: 'r4', banName: '4반', stuCount: 28, maxClassSize: 28, roomName: '3-4', capacity: 28 }];
    const rows = [row(), row({ num: 2, seq: 2, seat: 2 })];
    const rep = buildExamRoomReport(rows, '1일차', '1교시', '3-4', rooms);
    expect(rep?.isWaitRoom).toBe(true);
    const map = buildSeatMapReport(rows, '1일차', '1교시', '3-4', 5, 'col');
    expect(map?.isWaitRoom).toBe(true);
  });
});
