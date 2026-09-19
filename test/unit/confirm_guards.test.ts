import { describe, it, expect } from 'vitest';
import { confirmStage4 } from '../../src/domain/stages';
import type { AppState } from '../../src/domain/types';

/**
 * 8. 학생 배치 확정은 '인쇄물에 나오지 않는 학생'을 만들지 않아야 합니다.
 *
 * 응시현황은 고사실에 앉은 학생만으로 만들어집니다. 미배치 학생은
 * 명단에도 수험표에도 좌석배치도에도 없습니다. 그대로 확정하면
 * 시험 당일 갈 곳이 없는 학생이 생기고, 인쇄물만 봐서는 알 수 없습니다.
 */
function baseState(): AppState {
  const sub = '한국사(1)';
  const students = Array.from({ length: 4 }, (_, i) => ({
    grade: '3', ban: '1반', num: i + 1, name: `학생${i + 1}`, subjects: [sub],
  }));

  return {
    stages: { stage1: true, stage2: true, stage3: true, stage4: false, stage5: false,
              step1: true, step2: true, step3: true, step4: true, step5: true, step6: true, step7: true, step8: false },
    students,
    neis: students.map(st => ({
      year: '2026', semester: '1', grade: '3', curriculum: '사회', subject: sub,
      room: '1반', room2: '1반', track: '3학년', ban: st.ban, num: st.num, name: st.name,
    })),
    rooms: [{ id: 'r1', roomName: '3-1', banName: '1반', stuCount: 4, maxClassSize: 4, capacity: 4 }],
    subjectBans: [{ subject: sub, room: '1반', stuCount: 4, subjectSeq: 1 }],
    evalSubjects: [{ subject: sub, banCount: 1, stuCount: 4 }],
    timetable: { '1_1': { subjects: [sub] } },
    placement: { 1: { r1: `${sub}-1반` } },
    studentPlacements: { 1: { '1반-1': 'r1', '1반-2': 'r1', '1반-3': 'r1', '1반-4': 'r1' } },
    attendance: [],
  } as unknown as AppState;
}

describe('8. 학생 배치 확정이 막아야 하는 것', () => {
  it('전원이 자리를 받았으면 확정된다', () => {
    const res = confirmStage4(baseState());
    expect(res.state.stages.stage4).toBe(true);
    expect(res.state.attendance.length).toBe(4);
  });

  it('자리를 못 받은 학생이 있으면 확정을 막는다', () => {
    const s = baseState();
    delete (s.studentPlacements as any)[1]['1반-4']; // 한 명을 미배치로 둡니다.
    expect(() => confirmStage4(s)).toThrow(/자리를 받지 못한 학생/);
  });

  it('정원을 넘긴 고사실이 있으면 확정을 막는다', () => {
    const s = baseState();
    s.rooms[0].capacity = 3;
    s.rooms[0].maxClassSize = 3;
    expect(() => confirmStage4(s)).toThrow(/정원을 넘긴 고사실/);
  });
});
