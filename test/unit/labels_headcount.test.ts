import { describe, it, expect } from 'vitest';
import { buildLabels } from '../../src/domain/reports/labels';
import type { ExamRoom, ExamDay, ExamTime, PlacementSlot, Student, SubjectBanEntry } from '../../src/domain/types';

/**
 * 봉투 라벨의 응시인원은 실제로 그 고사실에 앉은 학생 수여야 합니다.
 *
 * 예전에는 편성현황 분반 인원(entry.stuCount)을 그대로 찍었습니다. 그래서
 * 담당자가 8단계에서 손으로 학생을 옮겨도 봉투 인원이 그대로라, 넣을 시험지
 * 수가 어긋났습니다.
 */
describe('봉투 라벨 응시인원', () => {
  const sub = '한국사(1)';

  // 분반 둘: F 3명, G 3명. 편성현황상으로는 3 / 3 입니다.
  const students: Student[] = [
    ...[1, 2, 3].map(n => ({ grade: '3', ban: '1반', num: n, name: `F${n}`, subjects: [sub] })),
    ...[1, 2, 3].map(n => ({ grade: '3', ban: '2반', num: n, name: `G${n}`, subjects: [sub] })),
  ];

  const entries = new Map<string, SubjectBanEntry>([
    [`${sub}-F`, { key: `${sub}-F`, subject: sub, room: 'F', stuCount: 3, subjectSeq: 1, index: 1 }],
    [`${sub}-G`, { key: `${sub}-G`, subject: sub, room: 'G', stuCount: 3, subjectSeq: 1, index: 2 }],
  ]);

  const rooms: ExamRoom[] = [
    { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 30, maxClassSize: 30, capacity: 30 },
    { id: 'r2', roomName: '3-2', banName: '2반', stuCount: 30, maxClassSize: 30, capacity: 30 },
  ];

  const slots: PlacementSlot[] = [{
    index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시',
    subjects: [sub], banCounts: [2], banCountTotal: 2, takers: 6, nonTakers: 0,
  }];
  const placement = { 1: { r1: `${sub}-F`, r2: `${sub}-G` } };
  const days: ExamDay[] = [{ day: 1 as any, date: '2026-10-12' }];
  const times: ExamTime[] = [{ day: 1 as any, period: 1 as any, time: '08:50~09:40' }];

  const countOf = (labels: ReturnType<typeof buildLabels>, room: string) =>
    labels.find(l => l.examRoom === room)!.stuCount;

  it('손으로 한 명을 옮기면 라벨 인원도 따라 바뀐다', () => {
    // 1반 3번 학생을 3-1 에서 3-2 로 옮겼습니다. 이제 2명 / 4명입니다.
    const moved = {
      1: {
        '1반-1': 'r1', '1반-2': 'r1', '1반-3': 'r2',
        '2반-1': 'r2', '2반-2': 'r2', '2반-3': 'r2',
      },
    };
    const labels = buildLabels(slots, placement, rooms, days, times, entries, undefined, students, moved);

    expect(countOf(labels, '3-1')).toBe(2);
    expect(countOf(labels, '3-2')).toBe(4);
  });

  it('학생 배치를 아직 안 했으면 편성현황 분반 인원으로 어림잡는다', () => {
    const labels = buildLabels(slots, placement, rooms, days, times, entries);
    expect(countOf(labels, '3-1')).toBe(3);
    expect(countOf(labels, '3-2')).toBe(3);
  });

  it('별도 고사실로 가는 인원을 따로 알려 준다', () => {
    const seated = {
      1: {
        '1반-1': 'r1', '1반-2': 'r1', '1반-3': 'r1',
        '2반-1': 'r2', '2반-2': 'r2', '2반-3': 'r2',
      },
    };
    const labels = buildLabels(
      slots, placement, rooms, days, times, entries, undefined, students, seated,
      { '1반-2': { room: 1, slots: 'all' } }
    );

    const r1 = labels.find(l => l.examRoom === '3-1')!;
    // 명단에는 그대로 있으므로 인원은 3명, 그중 1명이 별도실로 나갑니다.
    expect(r1.stuCount).toBe(3);
    expect(r1.separateCount).toBe(1);

    expect(labels.find(l => l.examRoom === '3-2')!.separateCount).toBe(0);
  });
});
