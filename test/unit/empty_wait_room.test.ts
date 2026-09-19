import { describe, it, expect } from 'vitest';
import { sanitizePlacementGrid } from '../../src/domain/autoPlace';
import { ExamRoom } from '../../src/domain/types';

/**
 * 담당자가 빈 대기실을 열어 두고 한두 명만 손으로 옮기는 쓰임새가 있습니다.
 * 예전에는 인원이 0명인 대기 칸을 자동으로 지웠기 때문에,
 * 방금 만든 대기실이 곧바로 사라져 학생을 옮길 곳이 없었습니다.
 */
describe('빈 대기실은 지워지지 않는다', () => {
  const rooms: ExamRoom[] = [
    { id: 'r1', roomName: '3-1', banName: '1반', stuCount: 28, maxClassSize: 28, capacity: 28 },
    { id: 'x1', roomName: '별도실1', banName: '', stuCount: 0, maxClassSize: 0, capacity: 10 },
  ];

  it('일반 교실을 빈 대기실로 열어 두어도 남는다', () => {
    const next = sanitizePlacementGrid({ 1: { r1: '대기 - 0명' } }, rooms);
    expect(next[1].r1).toBe('대기 - 0명');
  });

  it('별도실도 빈 대기실로 남고, 이름만 바로잡는다', () => {
    const next = sanitizePlacementGrid({ 1: { x1: '대기1반 - 0명' } }, rooms);
    expect(next[1].x1).toBe('대기 - 0명');
  });
});
