import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function write(relPath, content) {
  const fullPath = path.join(__dirname, '..', relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Wrote ' + relPath);
}

// 12. placementInfo.ts
write('src/domain/placementInfo.ts', `
import { Timetable, Student, SubjectSummary, PlacementSlot, DayIdx, PeriodIdx, slotKey } from './types';

export function buildPlacementInfo(
  timetable: Timetable,
  students: Student[],
  evalSubjects: SubjectSummary[]
): PlacementSlot[] {
  const out: PlacementSlot[] = [];
  let index = 0;
  const evalMap = new Map(evalSubjects.map(e => [e.subject, e]));

  for (let d = 1; d <= 5; d++) {
    for (let p = 1; p <= 5; p++) {
      const subs = timetable[slotKey(d as DayIdx, p as PeriodIdx)]?.subjects ?? [];
      if (subs.length === 0) continue;
      index++;

      const banCounts = subs.map(s => evalMap.get(s)?.banCount ?? 0);
      const banCountTotal = banCounts.reduce((a, b) => a + b, 0);
      const takers = students.filter(st => st.subjects.some(x => subs.includes(x))).length;
      const nonTakers = Math.max(0, students.length - takers);

      out.push({
        index,
        day: d as DayIdx,
        period: p as PeriodIdx,
        title: \`\${d}일차 \${p}교시\`,
        subjects: subs,
        banCounts,
        banCountTotal,
        takers,
        nonTakers,
      });
    }
  }

  return out;
}
`);

// 13. placement.ts
write('src/domain/placement.ts', `
import { SubjectBan, SubjectBanKey, SubjectBanEntry, CellValue, PlacementSlot, PlacementGrid, SlotSummary, CellInfo, Student, ExamRoom, isWaitCell, parseWaitCount } from './types';
import { MSG } from './messages';

export function subjectBanEntries(subjectBans: SubjectBan[]): Map<SubjectBanKey, SubjectBanEntry> {
  const map = new Map<SubjectBanKey, SubjectBanEntry>();
  let prev = '';
  let idx = 0;

  for (const b of subjectBans) {
    if (b.subject === prev) {
      idx++;
    } else {
      idx = 1;
      prev = b.subject;
    }
    const key = \`\${b.subject}-\${idx}반\`;
    map.set(key, { ...b, key, index: idx });
  }

  return map;
}

export function cellDerived(
  v: CellValue,
  entries: Map<SubjectBanKey, SubjectBanEntry>
): { classRoom: string; stuCount: number | '' } {
  if (!v || v === '') return { classRoom: '', stuCount: '' };
  if (isWaitCell(v)) return { classRoom: '·', stuCount: parseWaitCount(v) };

  const e = entries.get(v);
  if (e) {
    const roomName = e.room.replace('7차일반 ', '');
    return { classRoom: roomName, stuCount: e.stuCount };
  }
  return { classRoom: '오류', stuCount: 0 };
}

export function slotSummary(
  i: number,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  entries: Map<SubjectBanKey, SubjectBanEntry>
): SlotSummary {
  const ps = placementSlots.find(s => s.index === i);
  if (!ps) {
    return {
      total: { ban: 0, takers: 0, nonTakers: 0 },
      placed: { ban: 0, takers: 0, nonTakers: 0 },
      remaining: { ban: 0, takers: 0, nonTakers: 0 },
      errorKey: '',
    };
  }

  const row = placement[i] ?? {};
  let placedBan = 0;
  let placedTakers = 0;
  let placedNon = 0;

  for (const v of Object.values(row)) {
    if (!v || v === '') continue;
    if (isWaitCell(v)) {
      placedNon += parseWaitCount(v);
    } else {
      placedBan++;
      const e = entries.get(v);
      if (e) placedTakers += e.stuCount;
    }
  }

  const total = { ban: ps.banCountTotal, takers: ps.takers, nonTakers: ps.nonTakers };
  const placed = { ban: placedBan, takers: placedTakers, nonTakers: placedNon };
  const remaining = {
    ban: total.ban - placed.ban,
    takers: total.takers - placed.takers,
    nonTakers: total.nonTakers - placed.nonTakers,
  };

  let errorKey: SlotSummary['errorKey'] = 'OK';
  if (remaining.takers < 0) {
    errorKey = '응시초과';
  } else if (remaining.takers > 0) {
    errorKey = '응시미배치';
  } else if (remaining.nonTakers > 0) {
    errorKey = '미응시미배치';
  } else if (remaining.nonTakers < 0) {
    errorKey = '미응시초과';
  }

  return { total, placed, remaining, errorKey };
}

export function cellInfo(
  i: number,
  roomId: string,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>
): CellInfo | null {
  const room = rooms.find(r => r.id === roomId);
  const ps = placementSlots.find(s => s.index === i);
  if (!room || !ps) return null;
  if (room.roomName === '0' || room.roomName === '' || ps.title === '') return null;

  const sum = slotSummary(i, placement, placementSlots, entries);
  const subjectVal = placement[i]?.[roomId] ?? '';
  const derived = cellDerived(subjectVal, entries);

  return {
    slotIndex: i,
    roomId,
    roomIndex: rooms.indexOf(room) + 1,
    roomName: room.roomName,
    ban: room.banName,
    day: ps.day,
    period: ps.period,
    title: ps.title,
    allExamRemainCount: sum.total.nonTakers,
    noExamRemainCount: sum.remaining.nonTakers,
    examRemainCount: sum.remaining.takers,
    subject: subjectVal,
    classRoom: derived.classRoom,
    stuCount: typeof derived.stuCount === 'number' ? derived.stuCount : 0,
  };
}

export function waitByBan(
  i: number,
  placementSlots: PlacementSlot[],
  students: Student[]
): Map<string, number> {
  const ps = placementSlots.find(s => s.index === i);
  if (!ps) return new Map();
  const subs = ps.subjects;
  const m = new Map<string, number>();

  for (const s of students) {
    if (!s.subjects.some(x => subs.includes(x))) {
      m.set(s.ban, (m.get(s.ban) ?? 0) + 1);
    }
  }

  return m;
}

export interface PanelItem {
  type: 'ban' | 'wait';
  key: string;
  room: string;
  count: string;
}

export function panelItems(
  i: number,
  roomId: string,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[]
): PanelItem[] {
  const ci = cellInfo(i, roomId, placement, placementSlots, rooms, entries);
  const ps = placementSlots.find(s => s.index === i);
  const room = rooms.find(r => r.id === roomId);
  if (!ci || !ps || !room) return [];

  const placedSet = new Set(Object.values(placement[i] ?? {}).filter(v => v.endsWith('반')));
  const items: PanelItem[] = [];

  for (let sIdx = 0; sIdx < ps.subjects.length; sIdx++) {
    const s = ps.subjects[sIdx];
    const bCount = ps.banCounts[sIdx] ?? 0;
    for (let n = 1; n <= bCount; n++) {
      const key = \`\${s}-\${n}반\`;
      if (!placedSet.has(key)) {
        const e = entries.get(key);
        items.push({
          type: 'ban',
          key,
          room: e ? e.room : '',
          count: e ? \`\${e.stuCount}명\` : '',
        });
      }
    }
  }

  const capacity = room.capacity;
  const maxWait = Math.min(ci.allExamRemainCount, capacity);
  const w = waitByBan(i, placementSlots, students);

  for (let n = maxWait; n >= 1; n--) {
    const bans: string[] = [];
    for (const [ban, c] of w.entries()) {
      if (c === n) bans.push(ban);
    }
    items.push({
      type: 'wait',
      key: \`대기 - \${n}명\`,
      room: bans.join(' '),
      count: '',
    });
  }

  return items;
}

export function hasErrorBaechi(
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>
): void {
  for (const ps of placementSlots) {
    const sum = slotSummary(ps.index, placement, placementSlots, entries);
    if (sum.errorKey === '응시초과') throw new Error(MSG.S7_ERR_1);
    if (sum.errorKey === '응시미배치') throw new Error(MSG.S7_ERR_2);
    if (sum.errorKey === '미응시미배치') throw new Error(MSG.S7_ERR_3);
    if (sum.errorKey === '미응시초과') throw new Error(MSG.S7_ERR_4);
  }

  const seen = new Set<string>();
  for (const ps of placementSlots) {
    const canSub = ps.subjects;
    const row = placement[ps.index] ?? {};
    for (const [roomId, v] of Object.entries(row)) {
      if (!v || isWaitCell(v)) continue;
      if (seen.has(v)) {
        throw new Error(MSG.S7_DUP_BAN(v));
      }
      seen.add(v);

      const sb = entries.get(v);
      if (!sb || !canSub.includes(sb.subject)) {
        throw new Error(MSG.S7_WRONG_SUBJ(v, canSub.join(',')));
      }
    }
  }
}
`);

// 14. autoPlace.ts
write('src/domain/autoPlace.ts', `
import { PlacementGrid, PlacementSlot, ExamRoom, SubjectBanKey, SubjectBanEntry, Student, isExtraRoom, isWaitCell } from './types';
import { panelItems, cellInfo, waitByBan } from './placement';

export function autoPlaceSlot(
  i: number,
  roomIdSelected: string,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  isExtra: boolean
): PlacementGrid {
  const newPlacement: PlacementGrid = JSON.parse(JSON.stringify(placement));
  if (!newPlacement[i]) newPlacement[i] = {};

  const ps = placementSlots.find(s => s.index === i);
  if (!ps) return newPlacement;

  const extraRooms = rooms.filter(isExtraRoom);
  const items = panelItems(i, roomIdSelected, newPlacement, placementSlots, rooms, entries, students);
  const queue = [...items];
  const selectedRoom = rooms.find(r => r.id === roomIdSelected);
  const capacity = selectedRoom ? selectedRoom.capacity : 28;
  const waitMap = waitByBan(i, placementSlots, students);

  if (isExtra) {
    for (const r of extraRooms) {
      const headIdx = queue.findIndex(it => it.type === 'ban');
      if (headIdx === -1) break;
      const head = queue.splice(headIdx, 1)[0];
      newPlacement[i][r.id] = head.key;
    }
  } else {
    for (const it of items.filter(it => it.type === 'ban')) {
      const m = /7차일반\\s*(\\d+)/.exec(it.room);
      if (!m || !m[1]) continue;
      const T = Number(m[1]);
      const targetRoom = rooms[T - 1];
      if (!targetRoom) continue;
      if (!newPlacement[i][targetRoom.id] || newPlacement[i][targetRoom.id] === '') {
        newPlacement[i][targetRoom.id] = it.key;
        const qIdx = queue.findIndex(x => x.key === it.key);
        if (qIdx !== -1) queue.splice(qIdx, 1);
      }
    }
  }

  for (const r of rooms) {
    const ci = cellInfo(i, r.id, newPlacement, placementSlots, rooms, entries);
    if (!ci) continue;
    if (ci.subject !== '') continue;
    if (queue.length === 0) break;

    const head = queue[0];
    if (head.type === 'wait') {
      if (ci.noExamRemainCount < 1) break;
      if (isExtra) {
        if (waitMap.has(ci.ban)) {
          newPlacement[i][r.id] = \`대기 - \${waitMap.get(ci.ban)}명\`;
        }
      } else if (ci.noExamRemainCount < capacity) {
        newPlacement[i][r.id] = \`대기 - \${ci.noExamRemainCount}명\`;
        break;
      } else {
        newPlacement[i][r.id] = \`대기 - \${capacity}명\`;
      }
    } else {
      newPlacement[i][r.id] = head.key;
      queue.shift();
    }
  }

  return newPlacement;
}

export function autoPlaceAll(
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  extraAnswers?: Record<number, boolean>
): PlacementGrid {
  let currentPlacement = JSON.parse(JSON.stringify(placement));
  const extraRooms = rooms.filter(isExtraRoom);
  const firstUsableRoom = rooms.find(r => r.roomName !== '' && r.roomName !== '0');
  const firstRoomId = firstUsableRoom ? firstUsableRoom.id : rooms[0]?.id ?? '';

  for (const ps of placementSlots) {
    const isExtra = extraAnswers?.[ps.index] ?? false;
    currentPlacement = autoPlaceSlot(
      ps.index,
      firstRoomId,
      currentPlacement,
      placementSlots,
      rooms,
      entries,
      students,
      isExtra
    );
  }

  return currentPlacement;
}
`);

// 15. attendance.ts
write('src/domain/attendance.ts', `
import { NeisRow, Student, ExamRoom, PlacementSlot, PlacementGrid, SubjectBanKey, SubjectBanEntry, AttendanceRow, DayLabel, PeriodLabel, studentKey, isWaitCell, parseWaitCount } from './types';
import { cellDerived } from './placement';
import { MSG } from './messages';
import { hakbun } from './util/text';

interface ExamRoomRec {
  day: number;
  period: number;
  examRoomName: string;
  banName: string;
  stuCount: number;
  subject: string;
  classRoom: string;
  students: Map<string, { ban: string; num: number; name: string; grade: string; classRoom: string }>;
}

export function buildAttendance(
  neis: NeisRow[],
  students: Student[],
  rooms: ExamRoom[],
  placementSlots: PlacementSlot[],
  placement: PlacementGrid,
  entries: Map<SubjectBanKey, SubjectBanEntry>
): { rows: AttendanceRow[]; notices: string[] } {
  const bySubjectRoom = new Map<string, Map<string, { ban: string; num: number; name: string; grade: string; classRoom: string }>>();
  for (const r of neis) {
    if (!r.subject) continue;
    const k = r.subject + '\u0001' + r.room;
    if (!bySubjectRoom.has(k)) {
      bySubjectRoom.set(k, new Map());
    }
    bySubjectRoom.get(k)!.set(studentKey(r), {
      ban: r.ban,
      num: r.num,
      name: r.name,
      grade: r.grade,
      classRoom: r.room,
    });
  }

  const slotsData: Array<{
    ps: PlacementSlot;
    allRooms: Map<string, ExamRoomRec>;
    examOnly: ExamRoomRec[];
    waitOnly: ExamRoomRec[];
  }> = [];

  for (const ps of placementSlots) {
    const allRooms = new Map<string, ExamRoomRec>();
    const examOnly: ExamRoomRec[] = [];
    const waitOnly: ExamRoomRec[] = [];

    for (const r of rooms) {
      const v = placement[ps.index]?.[r.id] ?? '';
      if (!v || v === '') continue;
      if (r.roomName === '' || r.roomName === '0') throw new Error(MSG.S7_ROOM_MISSING);
      if (allRooms.has(r.roomName)) throw new Error(MSG.S7_ROOM_DUP);

      const d = cellDerived(v, entries);
      const stuCount = typeof d.stuCount === 'number' ? d.stuCount : 0;
      const rec: ExamRoomRec = {
        day: ps.day,
        period: ps.period,
        examRoomName: r.roomName,
        banName: r.banName,
        stuCount,
        subject: '',
        classRoom: '',
        students: new Map(),
      };

      allRooms.set(r.roomName, rec);
      if (isWaitCell(v)) {
        rec.subject = '미응시';
        rec.classRoom = '';
        waitOnly.push(rec);
      } else {
        const sb = entries.get(v);
        rec.subject = sb ? sb.subject : '';
        rec.classRoom = sb ? sb.room : '';
        examOnly.push(rec);
      }
    }

    if (allRooms.size > 0) {
      slotsData.push({ ps, allRooms, examOnly, waitOnly });
    }
  }

  for (const sd of slotsData) {
    for (const rec of sd.examOnly) {
      const stMap = bySubjectRoom.get(rec.subject + '\u0001' + rec.classRoom);
      rec.students = stMap ? new Map(stMap) : new Map();
      if (rec.students.size !== rec.stuCount) {
        throw new Error(MSG.S7_STU_COUNT(rec.subject, rec.stuCount));
      }
    }
  }

  const notices: string[] = [];
  for (const sd of slotsData) {
    const dWait = new Map<string, { ban: string; num: number; name: string; grade: string; classRoom: string }>();
    const dicStu = new Map<string, number>();

    for (const s of students) {
      if (sd.examOnly.some(rec => s.subjects.includes(rec.subject))) continue;
      const k = studentKey(s);
      dWait.set(k, { ban: s.ban, num: s.num, name: s.name, grade: s.grade, classRoom: '' });
      dicStu.set(s.ban, (dicStu.get(s.ban) ?? 0) + 1);
    }

    for (const rec of sd.waitOnly) {
      let cnt = dicStu.get(rec.banName) ?? 0;
      let cnt2 = rec.stuCount - cnt;
      if (cnt2 < 0) {
        cnt = cnt + cnt2;
      }

      const snapshotKeys = Array.from(dWait.keys());
      for (const k of snapshotKeys) {
        if (rec.students.size >= rec.stuCount) break;
        const st = dWait.get(k);
        if (!st) continue;

        if (st.ban === rec.banName) {
          rec.students.set(k, st);
          dWait.delete(k);
          dicStu.set(st.ban, (dicStu.get(st.ban) ?? 1) - 1);
          cnt--;
        } else if (cnt2 > 0) {
          rec.students.set(k, st);
          dWait.delete(k);
          dicStu.set(st.ban, (dicStu.get(st.ban) ?? 1) - 1);
          cnt2--;
        }

        if (cnt2 < 1 && cnt < 1) break;
      }

      if (cnt2 < 0) {
        notices.push(MSG.S7_WAIT_MOVED(rec.day, rec.period, rec.examRoomName, rec.banName, -cnt2));
      }
    }

    if (dWait.size > 0) {
      throw new Error(MSG.S7_WAIT_UNPLACED);
    }
  }

  const rows: AttendanceRow[] = [];
  for (const sd of slotsData) {
    for (const rec of sd.allRooms.values()) {
      let seq = 1;
      for (const st of rec.students.values()) {
        const DD: DayLabel = \`\${rec.day}일차\`;
        const TT: PeriodLabel = \`\${rec.period}교시\`;
        const key1 = \`\${DD}\${TT}\${rec.examRoomName}_\${seq}\`;
        const key3 = \`\${st.ban}\${st.num}번\${DD}\${TT}\`;

        rows.push({
          key1,
          key2: key1,
          key3,
          day: DD,
          period: TT,
          examRoom: rec.examRoomName,
          subject: rec.subject,
          grade: st.grade,
          ban: st.ban.replace(/\\s/g, ''),
          num: st.num,
          name: st.name,
          classRoom: st.classRoom,
          seq,
          seat: seq,
        });
        seq++;
      }
    }
  }

  return { rows, notices };
}

export function seatBySeq(rows: AttendanceRow[]): AttendanceRow[] {
  return rows.map(r => ({
    ...r,
    seat: r.seq,
    key2: \`\${r.day}\${r.period}\${r.examRoom}_\${r.seq}\`,
  }));
}

export function seatRandom(rows: AttendanceRow[], rng: () => number = Math.random): AttendanceRow[] {
  const cloned = rows.map(r => ({ ...r }));
  const groups = new Map<string, AttendanceRow[]>();

  for (const r of cloned) {
    const k = \`\${r.day}_\${r.period}_\${r.examRoom}_\${r.subject}\`;
    if (!groups.has(k)) {
      groups.set(k, []);
    }
    groups.get(k)!.push(r);
  }

  for (const [k, g] of groups.entries()) {
    if (k.endsWith('_미응시')) continue;
    const perm = g.map(r => r.seq);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = perm[i];
      perm[i] = perm[j];
      perm[j] = temp;
    }
    g.forEach((r, idx) => {
      r.seat = perm[idx];
      r.key2 = \`\${r.day}\${r.period}\${r.examRoom}_\${r.seat}\`;
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

  const titles = placementSlots.map(ps => ps.title.replace(/\\s/g, ''));
  const byKey3 = new Map<string, AttendanceRow>();
  for (const row of attendance) {
    byKey3.set(row.key3, row);
  }

  for (const s of students) {
    let cnt = 0;
    for (const t of titles) {
      const k = \`\${s.ban}\${s.num}번\${t}\`;
      const row = byKey3.get(k);
      if (!row) throw new Error(MSG.S8_ERR_MISSING(k));
      if (row.subject !== '미응시') {
        if (!s.subjects.includes(row.subject)) {
          throw new Error(MSG.S8_ERR_WRONG_SUBJ(k, row.subject));
        }
        cnt++;
      }
      if (!roomNameSet.has(row.examRoom)) {
        throw new Error(MSG.S8_ERR_WRONG_ROOM(k, row.examRoom));
      }
      if (typeof row.seat !== 'number' || isNaN(row.seat) || row.seat <= 0) {
        throw new Error(MSG.S8_ERR_WRONG_SEAT(k, row.seat));
      }
    }
    if (s.subjects.length !== cnt) {
      throw new Error(MSG.S8_ERR_UNPLACED_SUBJ(s.ban, s.num));
    }
  }

  const noSeatCount = attendance.filter(r => r.seat === null || r.seat <= 0).length;
  if (noSeatCount > 0) {
    throw new Error(MSG.S8_NO_SEAT(noSeatCount));
  }
}
`);

// 16. stages.ts
write('src/domain/stages.ts', `
import { AppState } from './types';
import { MSG } from './messages';
import { buildSubjectTables, buildRooms } from './baseData';
import { buildTakers, findCompatGroups, buildStudents } from './subjects';
import { duplicateSubjects, slotStatus, remainSubjects } from './timetable';
import { buildPlacementInfo } from './placementInfo';
import { subjectBanEntries, hasErrorBaechi, cellDerived, isWaitCell } from './placement';
import { buildAttendance, hasErrorSeat } from './attendance';
import { buildGradeTable } from './reports/gradeTable';
import { buildLabels } from './reports/labels';

export function confirmStage1(state: AppState): AppState {
  if (!state.neis || state.neis.length === 0 || state.neis.every(r => r.name === '')) {
    throw new Error(MSG.S1_NO_FILE);
  }

  let { subjectSummary, subjectBans } = buildSubjectTables(state.neis, 1);
  const rooms = buildRooms(state.neis, subjectSummary, subjectBans);

  if (state.neis.some(r => r.room.includes('편의'))) {
    const res2 = buildSubjectTables(state.neis, 2);
    subjectSummary = res2.subjectSummary;
    subjectBans = res2.subjectBans;
  }

  const evalTargets: Record<string, boolean> = {};
  for (const s of subjectSummary) {
    evalTargets[s.subject] = false;
  }

  return {
    ...state,
    subjectSummary,
    subjectBans,
    rooms,
    evalTargets,
    stages: { ...state.stages, stage1: true },
  };
}

export function cancelStage1(state: AppState): AppState {
  const s2 = cancelStage2(state);
  return {
    ...s2,
    subjectSummary: [],
    subjectBans: [],
    evalTargets: {},
    stages: { ...s2.stages, stage1: false },
  };
}

export function confirmStage2(state: AppState): AppState {
  if (!state.stages.stage1) throw new Error(MSG.S4_NEED_S1);
  const targets = state.subjectSummary.filter(s => state.evalTargets[s.subject]);
  if (targets.length === 0) throw new Error(MSG.S4_NEED_O);

  const evalSubjects = targets;
  const takers = buildTakers(state.neis, evalSubjects);
  const totalStudents = state.rooms.reduce((acc, r) => acc + (r.stuCount ?? 0), 0);
  const { groups: compat, overflow: compatOverflow } = findCompatGroups(evalSubjects, takers, totalStudents);
  const students = buildStudents(state.neis, evalSubjects);

  const timetable: AppState['timetable'] = {};
  for (let d = 1; d <= 5; d++) {
    for (let p = 1; p <= 5; p++) {
      timetable[\`\${d}_\${p}\`] = { subjects: [] };
    }
  }

  return {
    ...state,
    evalSubjects,
    compat,
    compatOverflow,
    students,
    timetable,
    stages: { ...state.stages, stage2: true },
  };
}

export function cancelStage2(state: AppState): AppState {
  const s3 = cancelStage3(state);
  return {
    ...s3,
    evalSubjects: [],
    compat: [],
    compatOverflow: false,
    students: [],
    stages: { ...s3.stages, stage2: false },
  };
}

export function confirmStage3(state: AppState): AppState {
  if (!state.stages.stage2) throw new Error(MSG.S6_NEED_S2);

  const dups = duplicateSubjects(state.timetable);
  if (dups.length > 0) throw new Error(MSG.S6_DUP);

  const takers = buildTakers(state.neis, state.evalSubjects);
  for (let d = 1; d <= 5; d++) {
    for (let p = 1; p <= 5; p++) {
      const st = slotStatus(d as any, p as any, state.timetable, state.days, state.times, takers);
      if (st.kind === 'error') {
        throw new Error(st.message || MSG.S6_HAS_ERROR);
      }
    }
  }

  const remain = remainSubjects(state.evalSubjects, state.timetable);
  if (remain.length > 0) {
    throw new Error(MSG.S6_REMAIN(remain.join(', ')));
  }

  const placementSlots = buildPlacementInfo(state.timetable, state.students, state.evalSubjects);
  const entries = subjectBanEntries(state.subjectBans);
  const newPlacement: AppState['placement'] = JSON.parse(JSON.stringify(state.placement));

  for (let i = 1; i <= 25; i++) {
    const slot = placementSlots.find(s => s.index === i);
    const canSub = slot?.subjects ?? [];
    const row = newPlacement[i] ?? {};
    let shouldClear = false;

    for (const v of Object.values(row)) {
      if (!v || v === '') continue;
      if (canSub.length === 0) {
        shouldClear = true;
        break;
      }
      if (!isWaitCell(v)) {
        const sb = entries.get(v);
        if (!sb || !canSub.includes(sb.subject)) {
          shouldClear = true;
          break;
        }
      }
    }

    if (shouldClear) {
      newPlacement[i] = {};
    }
  }

  return {
    ...state,
    placement: newPlacement,
    stages: { ...state.stages, stage3: true },
  };
}

export function cancelStage3(state: AppState): AppState {
  const s4 = cancelStage4(state);
  return {
    ...s4,
    stages: { ...s4.stages, stage3: false },
  };
}

export function confirmStage4(state: AppState): { state: AppState; notices: string[] } {
  if (!state.stages.stage3) throw new Error(MSG.S7_NEED_S3);

  const placementSlots = buildPlacementInfo(state.timetable, state.students, state.evalSubjects);
  const entries = subjectBanEntries(state.subjectBans);
  hasErrorBaechi(state.placement, placementSlots, state.rooms, entries);

  const { rows: attendance, notices } = buildAttendance(
    state.neis,
    state.students,
    state.rooms,
    placementSlots,
    state.placement,
    entries
  );

  return {
    state: {
      ...state,
      attendance,
      stages: { ...state.stages, stage4: true },
    },
    notices,
  };
}

export function cancelStage4(state: AppState): AppState {
  const s5 = cancelStage5(state);
  return {
    ...s5,
    attendance: [],
    stages: { ...s5.stages, stage4: false },
  };
}

export function confirmStage5(state: AppState): AppState {
  if (!state.stages.stage4) throw new Error(MSG.S8_NEED_S4);

  const placementSlots = buildPlacementInfo(state.timetable, state.students, state.evalSubjects);
  hasErrorSeat(state.attendance, state.rooms, placementSlots, state.students);

  const codes: Record<string, string> = { ...state.subjectCodes };
  for (const s of state.evalSubjects) {
    if (!codes[s.subject]) codes[s.subject] = '';
  }

  return {
    ...state,
    subjectCodes: codes,
    stages: { ...state.stages, stage5: true },
  };
}

export function cancelStage5(state: AppState): AppState {
  return {
    ...state,
    stages: { ...state.stages, stage5: false },
  };
}
`);

console.log('Part 2-2 written.');
