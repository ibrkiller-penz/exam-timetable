import { describe, it, expect } from 'vitest';
import { buildAttendance, seatBySeq, hasErrorSeat } from '../../src/domain/attendance';
import { buildSeatMapReport } from '../../src/domain/reports/seatMap';
import { buildExamRoomReport } from '../../src/domain/reports/examRoom';
import type { ExamRoom, PlacementSlot, Student, SubjectBanEntry, NeisRow, SeparateExaminers } from '../../src/domain/types';

/**
 * 별도 고사실에서 따로 보는 학생 (틱·장애 등).
 *
 * 담당 선생님이 실제로 하던 방식 그대로입니다:
 * "그 아이들은 원고사실에 그대로 두고, 입실할 때 명렬에 별도고사실 응시중이라고 써서 드렸어요."
 * 명단에서 빼 버리면 감독 선생님이 그 학생의 존재를 알 수 없습니다.
 */
describe('별도 고사실 응시자', () => {
  const sub = '한국사(1)';
  const students: Student[] = Array.from({ length: 4 }, (_, i) => ({
    grade: '3', ban: '1반', num: i + 1, name: `학생${i + 1}`, subjects: [sub],
  }));
  const neis: NeisRow[] = students.map(st => ({
    year: '2026', semester: '1', grade: '3', curriculum: '사회', subject: sub,
    room: '1반', room2: '1반', track: '3학년', ban: st.ban, num: st.num, name: st.name,
  }));
  const rooms: ExamRoom[] = [
    { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 4, maxClassSize: 4, capacity: 4, cols: 2 },
  ];
  const entries = new Map<string, SubjectBanEntry>([
    [`${sub}-1반`, { key: `${sub}-1반`, subject: sub, room: '1반', stuCount: 4, subjectSeq: 1, index: 1 }],
  ]);
  const slots: PlacementSlot[] = [
    { index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시', subjects: [sub], banCounts: [1], banCountTotal: 1, takers: 4, nonTakers: 0 },
    { index: 2, day: 1 as any, period: 2 as any, title: '1일차 2교시', subjects: [sub], banCounts: [1], banCountTotal: 1, takers: 4, nonTakers: 0 },
  ];
  const placement = { 1: { r1: `${sub}-1반` }, 2: { r1: `${sub}-1반` } };
  const sp = { 1: { '1반-1': 'r1', '1반-2': 'r1', '1반-3': 'r1', '1반-4': 'r1' },
               2: { '1반-1': 'r1', '1반-2': 'r1', '1반-3': 'r1', '1반-4': 'r1' } };

  const build = (sep: SeparateExaminers) =>
    buildAttendance(neis, students, rooms, slots, placement, entries, sp, sep).rows;

  it('명단에는 남고, 좌석만 받지 않는다', () => {
    const rows = build({ '1반-2': { room: 1, slots: 'all' } });
    const slot1 = rows.filter(r => r.period === '1교시');

    expect(slot1.length).toBe(4); // 네 명 모두 명단에 있습니다.
    const sepRow = slot1.find(r => r.num === 2)!;
    expect(sepRow.seat).toBe(null);
    expect(sepRow.separateRoom).toBe(1);

    // 남은 세 명의 좌석은 빈 자리 없이 1,2,3으로 이어집니다.
    expect(slot1.filter(r => r.num !== 2).map(r => r.seat)).toEqual([1, 2, 3]);
  });

  it("'이 교시만' 별도는 그 교시에만 적용된다", () => {
    const rows = build({ '1반-3': { room: 2, slots: [2] } });
    expect(rows.find(r => r.period === '1교시' && r.num === 3)!.separateRoom).toBeUndefined();
    expect(rows.find(r => r.period === '2교시' && r.num === 3)!.separateRoom).toBe(2);
  });

  it('고사실 명단 비고에 별도고사실 응시중이라고 적힌다', () => {
    const rows = build({ '1반-2': { room: 1, slots: 'all' } });
    const report = buildExamRoomReport(rows, '1일차', '1교시', '3-1', rooms)!;
    const me = report.students.find(s => s.hakbun.endsWith('02'))!;
    expect(me.note).toBe('별도고사실 응시중');
    expect(me.seat).toBe(null);
    expect(report.students.length).toBe(4); // 명단에서 빠지지 않습니다.
  });

  it('좌석배치도에서는 빠진다', () => {
    const rows = build({ '1반-2': { room: 1, slots: 'all' } });
    const map = buildSeatMapReport(rows, '1일차', '1교시', '3-1', 2)!;
    const names = map.grid.flat().map(c => c.name);
    expect(names).not.toContain('학생2');
    expect(names.length).toBe(3);
  });

  it('좌석이 없어도 9단계 확정을 막지 않는다', () => {
    const rows = seatBySeq(build({ '1반-2': { room: 1, slots: 'all' } }));
    expect(rows.find(r => r.period === '1교시' && r.num === 2)!.seat).toBe(null);
    expect(() => hasErrorSeat(rows, rooms, slots, students)).not.toThrow();
  });
});
