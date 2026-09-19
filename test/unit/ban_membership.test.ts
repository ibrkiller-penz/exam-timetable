import { describe, it, expect } from 'vitest';
import { initSlotStudentPlacements } from '../../src/domain/autoPlace';
import { ExamRoom, PlacementSlot, Student, SubjectBanEntry, NeisRow } from '../../src/domain/types';

/**
 * 실제 데이터 모양 그대로: 편성현황의 강의실은 '학교지정-F'인데
 * 분반 목록에는 'F'로 줄여 저장됩니다. 이 둘이 같은 분반임을 알아봐야
 * 각 고사실에 그 분반 학생이 정확히 들어갑니다.
 */
describe('분반 명단은 편성현황에서 읽는다', () => {
  const sub = '한국사(1)';
  const bans = [
    { room: 'F', size: 24 },
    { room: 'G1', size: 29 },
    { room: 'G2', size: 20 },
    { room: 'H1', size: 22 },
    { room: 'H2', size: 17 },
    { room: 'J1', size: 29 },
    { room: 'J2', size: 22 },
  ];

  const students: Student[] = [];
  const neis: NeisRow[] = [];
  let seq = 0;
  bans.forEach(b => {
    for (let k = 0; k < b.size; k++) {
      seq++;
      // 이동수업이라 한 분반 학생이 여러 학급에 흩어져 있습니다.
      const ban = `${(seq % 7) + 1}반`;
      const num = seq;
      students.push({ grade: '3', ban, num, name: `학생${seq}`, subjects: [sub] });
      neis.push({
        year: '2026', semester: '1', grade: '3', curriculum: '사회',
        subject: sub,
        room: `학교지정-${b.room}`,   // 편성현황 원본
        room2: `학교지정-${b.room}`,
        track: '3학년', ban, num, name: `학생${seq}`,
      });
    }
  });

  // 분반 목록에는 접두어가 빠진 짧은 이름으로 저장됩니다.
  const entries = new Map<string, SubjectBanEntry>(
    bans.map((b, i) => [
      `${sub}-${b.room}`,
      { key: `${sub}-${b.room}`, subject: sub, room: b.room, stuCount: b.size, subjectSeq: 1, index: i + 1 },
    ])
  );

  const rooms: ExamRoom[] = bans.map((_, i) => ({
    id: `r${i + 1}`, roomName: `3-${i + 1}`, banName: `${i + 1}반`,
    stuCount: 30, maxClassSize: 30, capacity: 30,
  }));

  const slots: PlacementSlot[] = [{
    index: 1, day: 1 as any, period: 1 as any, title: '1일차 1교시',
    subjects: [sub], banCounts: [7], banCountTotal: 7, takers: students.length, nonTakers: 0,
  }];

  // 방 순서와 분반 순서를 일부러 다르게 놓습니다 (G1이 3-1에, J1이 3-2에 …).
  const roomOrder = ['G1', 'J1', 'F', 'G2', 'H1', 'H2', 'J2'];
  const row: Record<string, string> = {};
  rooms.forEach((r, i) => { row[r.id] = `${sub}-${roomOrder[i]}`; });

  it('칸에 적힌 분반의 학생이 그 칸에 들어간다', () => {
    const sp = initSlotStudentPlacements(1, row, slots, rooms, entries, students, neis);

    rooms.forEach((r, i) => {
      const banRoom = roomOrder[i];
      const expected = bans.find(b => b.room === banRoom)!.size;
      const actual = students.filter(st => sp[`${st.ban}-${st.num}`] === r.id).length;
      expect(`${r.roomName}(${banRoom})=${actual}`).toBe(`${r.roomName}(${banRoom})=${expected}`);

      // 인원 수뿐 아니라 '그 분반 학생인지'까지 확인합니다.
      const wrong = students.filter(st => {
        if (sp[`${st.ban}-${st.num}`] !== r.id) return false;
        const myBan = neis.find(n => n.ban === st.ban && n.num === st.num && n.subject === sub);
        return myBan?.room !== `학교지정-${banRoom}`;
      });
      expect(wrong.length).toBe(0);
    });
  });
});
