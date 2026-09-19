import { NeisRow, Student, ExamRoom, PlacementSlot, PlacementGrid, SubjectBanKey, SubjectBanEntry, AttendanceRow, DayLabel, PeriodLabel, isWaitCell, SeparateExaminers, separateRoomFor } from './types';
import { initSlotStudentPlacements } from './autoPlace';
import { MSG } from './messages';

export function buildAttendance(
  neis: NeisRow[],
  students: Student[],
  rooms: ExamRoom[],
  placementSlots: PlacementSlot[],
  placement: PlacementGrid,
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  studentPlacements: Record<number, Record<string, string>> = {},
  /** 별도 고사장에서 따로 보는 학생들 (`반-번호` → 별도실 번호). */
  separateExaminers: SeparateExaminers = {}
): { rows: AttendanceRow[]; notices: string[] } {
  const rows: AttendanceRow[] = [];
  const notices: string[] = [];

  for (const ps of placementSlots) {
    const placementRow = placement[ps.index] || {};
    const slotPlacements = studentPlacements[ps.index] 
      ? studentPlacements[ps.index] 
      : initSlotStudentPlacements(ps.index, placementRow, placementSlots, rooms, entries, students);

    for (const r of rooms) {
      const cellVal = placementRow[r.id];
      if (!cellVal || cellVal === '') continue;

      if (r.roomName === '' || r.roomName === '0') throw new Error(MSG.S7_ROOM_MISSING);

      const assignedStudents = students.filter(st => slotPlacements[`${st.ban}-${st.num}`] === r.id);

      assignedStudents.sort((a, b) => {
        if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
        return a.num - b.num;
      });

      // 연번은 모두에게 붙이고, 좌석은 실제로 그 교실에 앉는 학생에게만 줍니다.
      // 별도 응시자는 명단에 남아 있어야 담당 교사가 존재를 압니다.
      let seq = 1;
      let seatNo = 1;
      for (const st of assignedStudents) {
        const DD = `${ps.day}일차` as DayLabel;
        const TT = `${ps.period}교시` as PeriodLabel;
        const key1 = `${DD}${TT}${r.roomName}_${seq}`;
        const separateRoom = separateRoomFor(`${st.ban}-${st.num}`, ps.index, separateExaminers);
        const key3 = `${st.ban}${st.num}번${DD}${TT}`;

        const stSlotSubjects = st.subjects.filter(sub => ps.subjects.includes(sub));
        const isWaitStudent = stSlotSubjects.length === 0;
        const stSubject = isWaitStudent 
          ? (isWaitCell(cellVal) ? (cellVal.split(' - ')[0] || '미응시') : '자습(대기)') 
          : stSlotSubjects[0];

        const neisRow = neis.find(row => row.subject === stSubject && row.ban === st.ban && row.num === st.num);
        const classRoom = neisRow ? neisRow.room : (st.ban.replace('반', '') + '반');

        rows.push({
          key1,
          key2: key1,
          key3,
          day: DD,
          period: TT,
          examRoom: r.roomName,
          subject: stSubject,
          grade: st.grade,
          ban: st.ban.replace(/\s/g, ''),
          num: st.num,
          name: st.name,
          classRoom: classRoom,
          seq,
          seat: separateRoom ? null : seatNo,
          separateRoom,
        });
        seq++;
        if (!separateRoom) seatNo++;
      }
    }
  }

  return { rows, notices };
}

export function seatBySeq(rows: AttendanceRow[]): AttendanceRow[] {
  // 별도 응시자는 그 교실에 없으므로 좌석을 건너뜁니다.
  // 그래야 남은 학생들의 좌석 번호가 빈 자리 없이 이어집니다.
  let seat = 0;
  return rows.map(r => {
    if (r.separateRoom) return { ...r, seat: null, key2: `${r.day}${r.period}${r.examRoom}_` };
    seat++;
    return { ...r, seat, key2: `${r.day}${r.period}${r.examRoom}_${seat}` };
  });
}

export function seatRandom(rows: AttendanceRow[], rng: () => number = Math.random): AttendanceRow[] {
  const cloned = rows.map(r => ({ ...r }));
  const groups = new Map<string, AttendanceRow[]>();

  for (const r of cloned) {
    const k = `${r.day}_${r.period}_${r.examRoom}_${r.subject}`;
    if (!groups.has(k)) {
      groups.set(k, []);
    }
    groups.get(k)!.push(r);
  }

  for (const [k, g] of groups.entries()) {
    if (k.endsWith('_미응시')) continue;
    const sittable = g.filter(r => !r.separateRoom); // 별도 응시자는 섞지 않습니다.
    const perm = sittable.map((_, i) => i + 1);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = perm[i];
      perm[i] = perm[j];
      perm[j] = temp;
    }
    sittable.forEach((r, idx) => {
      r.seat = perm[idx];
      r.key2 = `${r.day}${r.period}${r.examRoom}_${r.seat}`;
    });
    g.filter(r => r.separateRoom).forEach(r => {
      r.seat = null;
      r.key2 = `${r.day}${r.period}${r.examRoom}_`;
    });
  }

  return cloned;
}

export function hasErrorSeat(
  attendance: AttendanceRow[],
  rooms: ExamRoom[],
  placementSlots: PlacementSlot[],
  students: Student[]
): void {
  const roomNames = rooms.map(r => r.roomName).filter(Boolean);
  const roomNameSet = new Set(roomNames);
  if (roomNames.length !== roomNameSet.size) {
    const dup = roomNames.find((name, idx) => roomNames.indexOf(name) !== idx) || '';
    throw new Error(MSG.S8_ERR_ROOM_DUP(dup));
  }

  const titles = placementSlots.map(ps => ps.title.replace(/\s/g, ''));
  const byKey3 = new Map<string, AttendanceRow>();
  for (const row of attendance) {
    byKey3.set(row.key3, row);
  }

  const allExamSubjects = new Set<string>();
  for (const ps of placementSlots) {
    for (const sub of ps.subjects) {
      allExamSubjects.add(sub);
    }
  }

  for (const s of students) {
    let placedSubjects = new Set<string>();
    for (const t of titles) {
      const k = `${s.ban}${s.num}번${t}`;
      const row = byKey3.get(k);
      if (!row) throw new Error(MSG.S8_ERR_MISSING(k));
      if (row.subject !== '미응시' && !row.subject.startsWith('대기') && row.subject !== '자습(대기)') {
        if (!s.subjects.includes(row.subject)) {
          throw new Error(MSG.S8_ERR_WRONG_SUBJ(k, row.subject));
        }
        placedSubjects.add(row.subject);
      }
      if (!roomNameSet.has(row.examRoom)) {
        throw new Error(MSG.S8_ERR_WRONG_ROOM(k, row.examRoom));
      }
      // 별도 응시자는 그 교실에 앞지 않으므로 좌석이 없는 것이 맞습니다.
      if (!row.separateRoom && (typeof row.seat !== 'number' || isNaN(row.seat) || row.seat <= 0)) {
        throw new Error(MSG.S8_ERR_WRONG_SEAT(k, row.seat));
      }
    }
    
    const expectedSubjects = s.subjects.filter(sub => allExamSubjects.has(sub));
    if (expectedSubjects.length !== placedSubjects.size) {
      const missing = expectedSubjects.filter(sub => !placedSubjects.has(sub));
      if (missing.length > 0) {
        throw new Error(`${s.ban}${s.num}번 배치되지 않은 과목이 있습니다. (누락: ${missing.join(', ')})`);
      }
    }
  }

  const noSeatCount = attendance.filter(r => !r.separateRoom && (r.seat === null || r.seat <= 0)).length;
  if (noSeatCount > 0) {
    throw new Error(MSG.S8_NO_SEAT(noSeatCount));
  }
}
