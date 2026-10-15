import { describe, it, expect } from 'vitest';
import { applyConsigned, attendanceNote } from '../../src/domain/separate';
import { buildExamRoomReport } from '../../src/domain/reports/examRoom';
import type { AttendanceRow, ExamRoom } from '../../src/domain/types';

const row = (ban: string, num: number, seq: number): AttendanceRow => ({
  key1: '', key2: '', key3: '',
  day: '1일차', period: '1교시', examRoom: '3-1', subject: '국어',
  grade: '3', ban, num, name: `학생${num}`, classRoom: '3-1', seq, seat: seq,
});

describe('위탁 학생 표시', () => {
  it('표시한 학생만 고사실 명단 비고에 위탁으로 나간다', () => {
    const rows = applyConsigned([row('1', 1, 1), row('1', 2, 2)], { '1-2': true });
    const rooms = [{ id: 'r', banName: '1', stuCount: 2, maxClassSize: 2, roomName: '3-1', capacity: 30 }] as ExamRoom[];
    const rep = buildExamRoomReport(rows, '1일차', '1교시', '3-1', rooms)!;
    expect(rep.students.map(s => s.note)).toEqual(['', '위탁']);
  });

  it('표시를 풀면 비고가 지워지고, 좌석은 그대로다', () => {
    const marked = applyConsigned([row('1', 1, 1)], { '1-1': true });
    const cleared = applyConsigned(marked, {});
    expect(cleared[0].consigned).toBeFalsy();
    expect(cleared[0].seat).toBe(1);
  });

  it('별도와 위탁을 함께 적는다', () => {
    expect(attendanceNote({ separateRoom: 2, consigned: true })).toBe('별도 2실 · 위탁');
    expect(attendanceNote({ consigned: true })).toBe('위탁');
  });
});
