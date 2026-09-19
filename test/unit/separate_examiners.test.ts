import { describe, it, expect } from 'vitest';
import { buildAttendance, seatBySeq, hasErrorSeat } from '../../src/domain/attendance';
import { buildSeatMapReport } from '../../src/domain/reports/seatMap';
import { applySeparate } from '../../src/domain/separate';
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

  it('고사실 명단의 좌석 목록에서는 빠지고, 별도 안내로 따로 나온다', () => {
    const rows = build({ '1반-2': { room: 1, slots: 'all' } });
    const report = buildExamRoomReport(rows, '1일차', '1교시', '3-1', rooms)!;

    // 좌석 목록은 실제로 앉는 세 명뿐이고, 연번·좌석이 1부터 나란히 이어집니다.
    expect(report.students.map(s => s.hakbun.slice(-2))).toEqual(['01', '03', '04']);
    expect(report.students.map(s => s.seq)).toEqual([1, 2, 3]);
    expect(report.students.map(s => s.seat)).toEqual([1, 2, 3]);

    // 별도 응시자는 아래 안내로 따로 나옵니다. 명단에서 사라지지 않습니다.
    expect(report.separate.length).toBe(1);
    expect(report.separate[0].hakbun.endsWith('02')).toBe(true);
    expect(report.separate[0].room).toBe(1);

    // 응시인원 합계에는 별도 학생도 포함됩니다.
    expect(report.totalStudents).toBe(4);
  });

  it('좌석배치도에서는 빠지고, 그 자리는 빈 칸으로 남는다', () => {
    const rows = build({ '1반-2': { room: 1, slots: 'all' } });
    const map = buildSeatMapReport(rows, '1일차', '1교시', '3-1', 2)!;
    const names = map.grid.flat().map(c => c.name);

    expect(names).not.toContain('학생2');
    expect(names.filter(Boolean).length).toBe(3); // 앜는 사람은 세 명.

    // 빈 자리도 칸은 그립니다. 줄마다 칸 수가 같아야
    // 실제 교실 모양과 맞아 학생이 자리를 세어 찾을 수 있습니다.
    const colLengths = map.grid.map(c => c.length);
    expect(new Set(colLengths).size).toBe(1);
  });

  it('좌석이 없어도 9단계 확정을 막지 않는다', () => {
    const rows = seatBySeq(build({ '1반-2': { room: 1, slots: 'all' } }));
    expect(rows.find(r => r.period === '1교시' && r.num === 2)!.seat).toBe(null);
    expect(() => hasErrorSeat(rows, rooms, slots, students)).not.toThrow();
  });
});

/**
 * 별도 지정은 8단계를 확정한 '뒤'에 하게 됩니다.
 * 저장된 응시현황만 믿으면 명단 비고가 비고 좌석배치도에도 그대로 남습니다.
 * 인쇄물은 볼 때마다 지정을 다시 입혀야 합니다.
 */
describe('지정을 나중에 해도 인쇄물에 반영된다', () => {
  const sub = '한국사(1)';
  const slots = [
    { index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시', subjects: [sub], banCounts: [1], banCountTotal: 1, takers: 4, nonTakers: 0 },
  ];

  // 8단계 확정 때 만들어진 줄 — 아직 별도 표시가 없습니다.
  const saved = [1, 2, 3, 4].map(n => ({
    key1: `1일차1교시3-1_${n}`, key2: `1일차1교시3-1_${n}`, key3: `1반${n}번1일차1교시`,
    day: '1일차' as const, period: '1교시' as const, examRoom: '3-1', subject: sub,
    grade: '3', ban: '1반', num: n, name: `학생${n}`, classRoom: '1반', seq: n, seat: n,
  }));

  it('나중에 지정해도 좌석이 빠지고 번호가 다시 이어진다', () => {
    const out = applySeparate(saved, slots, { '1반-2': { room: 1, slots: 'all' } });

    const me = out.find((r: any) => r.num === 2)!;
    expect(me.separateRoom).toBe(1);
    expect(me.seat).toBe(null);

    // 남은 세 명은 1,2,3번 자리를 받습니다. 빈 자리가 생기면 안 됩니다.
    expect(out.filter((r: any) => r.num !== 2).map((r: any) => r.seat)).toEqual([1, 2, 3]);
  });

  it('지정을 풀면 표시가 걷히고 좌석이 되돌아온다', () => {
    const marked = applySeparate(saved, slots, { '1반-2': { room: 1, slots: 'all' } });
    const back = applySeparate(marked, slots, {});
    expect(back.every((r: any) => !r.separateRoom)).toBe(true);
    expect(back.map((r: any) => r.seat)).toEqual([1, 2, 3, 4]);
  });
});
