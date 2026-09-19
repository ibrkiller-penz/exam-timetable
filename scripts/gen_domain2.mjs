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

// 8. neisImport.ts
write('src/domain/neisImport.ts', `
import * as XLSX from 'xlsx';
import { NeisRow } from './types';
import { MSG } from './messages';

export interface ParseResult {
  rows: NeisRow[];
  removedCount: number;
  warnings: string[];
}

export function parseNeisFile(buffer: ArrayBuffer | Uint8Array): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error(MSG.NEIS_NOT_FILE_1);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(MSG.NEIS_NOT_FILE_1);

  let R1: { r: number; c: number } | null = null;
  let R2: { r: number; c: number } | null = null;
  let hasRoomHeader = false;

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellAddress];
      if (!cell || cell.v === undefined || cell.v === null) continue;
      const strVal = String(cell.v).trim();
      if (strVal === '학년도' && !R1) {
        R1 = { r, c };
      }
      if (strVal === '성명' && !R2) {
        R2 = { r, c };
      }
      if (strVal === '개설강의실') {
        hasRoomHeader = true;
      }
    }
  }

  if (!R1 || !R2) throw new Error(MSG.NEIS_NOT_FILE_1);
  if (!hasRoomHeader) throw new Error(MSG.NEIS_NOT_FILE_2);
  if (R1.r !== R2.r) throw new Error(MSG.NEIS_NOT_FILE_3);
  if (R2.c - R1.c !== 9) throw new Error(MSG.NEIS_NOT_FILE_4);

  const headerRow = R1.r;
  const startCol = R1.c;
  const rawRows: NeisRow[] = [];

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const vals: string[] = [];
    let hasAnyData = false;
    for (let colOffset = 0; colOffset < 10; colOffset++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c: startCol + colOffset });
      const cell = ws[cellAddress];
      const v = cell && cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '';
      if (v !== '') hasAnyData = true;
      vals.push(v);
    }
    if (!hasAnyData) continue;

    const numParsed = Number(vals[8]);
    const num = isNaN(numParsed) ? 0 : numParsed;

    rawRows.push({
      year: vals[0] || '',
      semester: vals[1] || '',
      grade: vals[2] || '',
      curriculum: vals[3] || '',
      subject: vals[4] || '',
      room: vals[5] || '',
      track: vals[6] || '',
      ban: vals[7] || '',
      num,
      name: vals[9] || '',
      room2: vals[5] || '',
    });
  }

  const removed = rawRows.filter(r => r.name === '' || r.name.includes('(미재학)'));
  let rows = rawRows.filter(r => !(r.name === '' || r.name.includes('(미재학)')));

  const needsPadding = rows.some(r => /^\d{2,}반$/.test(r.ban) || r.ban === '10반' || r.ban === '11반');
  if (needsPadding) {
    rows.forEach(r => {
      if (/^\d반$/.test(r.ban)) {
        r.ban = '0' + r.ban;
      }
    });
  }

  const warnings: string[] = [];
  const distinctGrades = new Set(rows.map(r => r.grade.charAt(0)).filter(Boolean));
  if (distinctGrades.size > 1) {
    warnings.push('MULTI_GRADE: 학년이 혼재되어 있습니다.');
  }

  return {
    rows,
    removedCount: removed.length,
    warnings,
  };
}
`);

// 9. baseData.ts
write('src/domain/baseData.ts', `
import { NeisRow, SubjectSummary, SubjectBan, ExamRoom, ExamDay, ExamTime } from './types';
import { vbaVal } from './util/vbaVal';
import { stableSort, compareBanNameEmptyLast } from './util/sort';
import { studentKey } from './types';
import { DAYS, PERIODS, DEFAULT_TIME } from './constants';

export function buildSubjectTables(neis: NeisRow[], pass: 1 | 2): { subjectSummary: SubjectSummary[]; subjectBans: SubjectBan[] } {
  const roomOf = (r: NeisRow) => (pass === 1 ? r.room2 : r.room);
  const dic1 = new Map<string, number>();
  const dic2 = new Map<string, { subject: string; room: string; stuCount: number }>();

  for (const r of neis) {
    if (!r.subject) continue;
    dic1.set(r.subject, (dic1.get(r.subject) ?? 0) + 1);
    const k = r.subject + '\u0001' + roomOf(r);
    const existing = dic2.get(k);
    if (existing) {
      existing.stuCount++;
    } else {
      dic2.set(k, { subject: r.subject, room: roomOf(r), stuCount: 1 });
    }
  }

  const arr: SubjectBan[] = [];
  let seq = 1;
  const dic2Values = Array.from(dic2.values());
  for (let i = 0; i < dic2Values.length; i++) {
    const item = dic2Values[i];
    if (i > 0 && dic2Values[i - 1].subject !== item.subject) {
      seq++;
    }
    arr.push({ ...item, subjectSeq: seq });
  }

  const subjectBans = stableSort(arr, (a, b) => {
    if (a.subjectSeq !== b.subjectSeq) return a.subjectSeq - b.subjectSeq;
    return a.room < b.room ? -1 : a.room > b.room ? 1 : 0;
  });

  const subjectSummary: SubjectSummary[] = Array.from(dic1.entries()).map(([subject, stuCount]) => ({
    subject,
    banCount: subjectBans.filter(b => b.subject === subject).length,
    stuCount,
  }));

  return { subjectSummary, subjectBans };
}

export function buildRooms(
  neis: NeisRow[],
  subjectSummary: SubjectSummary[],
  subjectBans: SubjectBan[]
): ExamRoom[] {
  const grade = neis[0]?.grade ? neis[0].grade.charAt(0) : '1';
  const dicBan = new Map<string, Set<string>>();
  
  for (const r of neis) {
    if (!dicBan.has(r.ban)) {
      dicBan.set(r.ban, new Set());
    }
    dicBan.get(r.ban)!.add(studentKey(r));
  }

  const dicBan2 = new Map<string, number>();
  for (const [ban, set] of dicBan.entries()) {
    const key2 = ban.includes('위탁') ? '위탁학생' : ban;
    dicBan2.set(key2, (dicBan2.get(key2) ?? 0) + set.size);
  }

  const rooms: ExamRoom[] = [];
  let idSeq = 1;
  for (const [key, n] of dicBan2.entries()) {
    let roomName = '';
    if (key.includes('편의')) {
      roomName = \`\${grade}-편의\`;
    } else if (key !== '위탁학생') {
      roomName = \`\${grade}-\${vbaVal(key)}\`;
    }
    rooms.push({
      id: \`room_\${idSeq++}\`,
      banName: key,
      stuCount: n,
      maxClassSize: n,
      roomName,
      capacity: 0,
    });
  }

  for (let k = 1; k <= 3; k++) {
    rooms.push({
      id: \`extra_\${idSeq++}\`,
      banName: '',
      stuCount: null,
      maxClassSize: null,
      roomName: \`별도실\${k}\`,
      capacity: 30,
    });
  }

  if (subjectSummary.length > 0) {
    const maxBan = Math.max(...subjectSummary.map(s => s.banCount));
    const maxSubjObj = subjectSummary.find(s => s.banCount === maxBan);
    if (maxSubjObj) {
      const maxSubj = maxSubjObj.subject;
      for (const b of subjectBans.filter(b => b.subject === maxSubj)) {
        const m = /7차일반\\s*(\\d+)/.exec(b.room);
        if (!m || !m[1]) continue;
        const idx = Number(m[1]);
        if (idx >= 1 && idx <= rooms.length) {
          const roomObj = rooms[idx - 1];
          if (roomObj && roomObj.maxClassSize !== null) {
            const biggest = Math.max(
              ...subjectBans.filter(x => x.room === b.room).map(x => x.stuCount)
            );
            if (biggest > roomObj.maxClassSize) {
              roomObj.maxClassSize = biggest;
            }
          }
        }
      }
    }
  }

  for (const r of rooms) {
    if (!r.roomName.includes('별도실')) {
      r.capacity = r.maxClassSize ?? 0;
    }
  }

  return stableSort(rooms, (a, b) => compareBanNameEmptyLast(a.banName, b.banName));
}

export function moveToConvenience(neis: NeisRow[], ban: string, num: number): NeisRow[] {
  return neis.map(r => {
    if (r.ban === ban && r.num === num) {
      return { ...r, room: '편의반' };
    }
    return r;
  });
}

export function deleteStudent(neis: NeisRow[], ban: string, num: number): NeisRow[] {
  return neis.filter(r => !(r.ban === ban && r.num === num));
}
`);

// 10. subjects.ts
write('src/domain/subjects.ts', `
import { NeisRow, SubjectSummary, CompatGroup, Student, StudentKey, studentKey } from './types';
import { MAX_COMPAT } from './constants';
import { stableSort } from './util/sort';

export function buildTakers(
  neis: NeisRow[],
  evalSubjects: SubjectSummary[]
): Map<string, Set<StudentKey>> {
  const evalSet = new Set(evalSubjects.map(e => e.subject));
  const takers = new Map<string, Set<StudentKey>>();
  for (const e of evalSubjects) {
    takers.set(e.subject, new Set());
  }
  for (const r of neis) {
    if (evalSet.has(r.subject)) {
      takers.get(r.subject)!.add(studentKey(r));
    }
  }
  return takers;
}

function intersects(a?: Set<string>, b?: Set<string>): boolean {
  if (!a || !b) return false;
  if (a.size > b.size) {
    for (const x of b) {
      if (a.has(x)) return true;
    }
  } else {
    for (const x of a) {
      if (b.has(x)) return true;
    }
  }
  return false;
}

export function findCompatGroups(
  evalSubjects: SubjectSummary[],
  takers: Map<string, Set<StudentKey>>,
  totalStudents: number
): { groups: CompatGroup[]; overflow: boolean } {
  const S = evalSubjects.map(e => e.subject);
  const n = S.length;
  const groups: string[][] = [];
  let overflow = false;

  const pairDisjoint = new Map<string, boolean>();
  const isDisjoint = (a: string, b: string): boolean => {
    const key = a < b ? \`\${a}\u0001\${b}\` : \`\${b}\u0001\${a}\`;
    const cached = pairDisjoint.get(key);
    if (cached !== undefined) return cached;
    const res = !intersects(takers.get(a), takers.get(b));
    pairDisjoint.set(key, res);
    return res;
  };

  try {
    // 4-combinations
    for (let i = 0; i <= n - 4; i++) {
      for (let j = i + 1; j <= n - 3; j++) {
        if (!isDisjoint(S[i], S[j])) continue;
        for (let k = j + 1; k <= n - 2; k++) {
          if (!isDisjoint(S[i], S[k]) || !isDisjoint(S[j], S[k])) continue;
          for (let m = k + 1; m <= n - 1; m++) {
            if (
              isDisjoint(S[i], S[m]) &&
              isDisjoint(S[j], S[m]) &&
              isDisjoint(S[k], S[m])
            ) {
              groups.push([S[i], S[j], S[k], S[m]]);
              if (groups.length >= MAX_COMPAT) {
                overflow = true;
                throw new Error('STOP');
              }
            }
          }
        }
      }
    }

    // 3-combinations
    for (let i = 0; i <= n - 3; i++) {
      for (let j = i + 1; j <= n - 2; j++) {
        if (!isDisjoint(S[i], S[j])) continue;
        for (let k = j + 1; k <= n - 1; k++) {
          if (isDisjoint(S[i], S[k]) && isDisjoint(S[j], S[k])) {
            groups.push([S[i], S[j], S[k]]);
            if (groups.length >= MAX_COMPAT) {
              overflow = true;
              throw new Error('STOP');
            }
          }
        }
      }
    }

    // 2-combinations
    for (let i = 0; i <= n - 2; i++) {
      for (let j = i + 1; j <= n - 1; j++) {
        if (isDisjoint(S[i], S[j])) {
          groups.push([S[i], S[j]]);
          if (groups.length >= MAX_COMPAT) {
            overflow = true;
            throw new Error('STOP');
          }
        }
      }
    }
  } catch (e: any) {
    if (e.message !== 'STOP') throw e;
  }

  const subjectMap = new Map(evalSubjects.map(s => [s.subject, s]));
  const result: CompatGroup[] = groups.map(subs => {
    let banCount = 0;
    let stuCount = 0;
    for (const sub of subs) {
      const sObj = subjectMap.get(sub);
      if (sObj) {
        banCount += sObj.banCount;
        stuCount += sObj.stuCount;
      }
    }
    return {
      subjects: subs,
      banCount,
      stuCount,
      nonTakers: Math.max(0, totalStudents - stuCount),
    };
  });

  return { groups: result, overflow };
}

export function buildStudents(neis: NeisRow[], evalSubjects: SubjectSummary[]): Student[] {
  const evalSet = new Set(evalSubjects.map(e => e.subject));
  const dic = new Map<StudentKey, Student>();

  for (const r of neis) {
    if (!evalSet.has(r.subject)) continue;
    const k = studentKey(r);
    const existing = dic.get(k);
    if (!existing) {
      dic.set(k, {
        grade: r.grade,
        ban: r.ban,
        num: r.num,
        name: r.name,
        subjects: [r.subject],
      });
    } else if (!existing.subjects.includes(r.subject)) {
      existing.subjects.push(r.subject);
    }
  }

  const list = Array.from(dic.values());
  return stableSort(list, (a, b) => {
    if (a.ban !== b.ban) return a.ban < b.ban ? -1 : 1;
    return a.num - b.num;
  });
}
`);

// 11. timetable.ts
write('src/domain/timetable.ts', `
import { DayIdx, PeriodIdx, SlotKey, slotKey, Timetable, SlotStatus, DayLoad, Student, SubjectSummary, ExamDay, ExamTime, StudentKey } from './types';
import { MSG } from './messages';

export function canSameTime(
  subs: string[],
  takers: Map<string, Set<StudentKey>>
): boolean {
  const validSubs = Array.from(new Set(subs.filter(s => takers.has(s))));
  for (let i = 0; i < validSubs.length; i++) {
    const setA = takers.get(validSubs[i])!;
    for (let j = i + 1; j < validSubs.length; j++) {
      const setB = takers.get(validSubs[j])!;
      for (const st of setA) {
        if (setB.has(st)) return false;
      }
    }
  }
  return true;
}

export function slotStatus(
  d: DayIdx,
  p: PeriodIdx,
  timetable: Timetable,
  days: ExamDay[],
  times: ExamTime[],
  takers: Map<string, Set<StudentKey>>
): SlotStatus {
  const subs = timetable[slotKey(d, p)]?.subjects ?? [];
  if (subs.length === 0) return { kind: 'empty' };

  // Loose rule check: is there any time configured for period p in any day?
  const hasAnyTimeForPeriod = times.some(t => t.period === p && t.time && t.time.trim() !== '');
  if (!hasAnyTimeForPeriod) {
    return { kind: 'error', code: 'NO_TIME', message: MSG.S6_ST_NO_TIME };
  }

  const dayDate = days[d - 1]?.date;
  if (!dayDate || dayDate.trim() === '') {
    return { kind: 'error', code: 'NO_DATE', message: MSG.S6_ST_NO_DATE };
  }

  if (!canSameTime(subs, takers)) {
    return { kind: 'error', code: 'CONFLICT', message: MSG.S6_ST_CONFLICT };
  }

  return { kind: 'ok' };
}

export function duplicateSubjects(timetable: Timetable): string[] {
  const counts = new Map<string, number>();
  for (const slot of Object.values(timetable)) {
    for (const sub of slot.subjects) {
      counts.set(sub, (counts.get(sub) ?? 0) + 1);
    }
  }
  const duplicates: string[] = [];
  for (const [sub, count] of counts.entries()) {
    if (count > 1) duplicates.push(sub);
  }
  return duplicates;
}

export function remainSubjects(
  evalSubjects: SubjectSummary[],
  timetable: Timetable
): string[] {
  const placed = new Set<string>();
  for (const slot of Object.values(timetable)) {
    for (const sub of slot.subjects) {
      placed.add(sub);
    }
  }
  return evalSubjects.filter(e => !placed.has(e.subject)).map(e => e.subject);
}

export function canSubjectsForSlot(
  slot: SlotKey | null,
  evalSubjects: SubjectSummary[],
  timetable: Timetable,
  takers: Map<string, Set<StudentKey>>
): string[] {
  if (!slot) return [];
  const remain = remainSubjects(evalSubjects, timetable);
  if (remain.length === 0) return [];
  const cur = timetable[slot]?.subjects ?? [];
  if (cur.length === 0) return remain;
  return remain.filter(s => canSameTime([...cur, s], takers));
}

export function dayLoad(
  day: DayIdx,
  timetable: Timetable,
  students: Student[]
): DayLoad {
  const daySubs = new Set<string>();
  for (let p = 1; p <= 5; p++) {
    const subs = timetable[slotKey(day, p as PeriodIdx)]?.subjects ?? [];
    for (const s of subs) daySubs.add(s);
  }

  const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const st of students) {
    let count = 0;
    for (const s of st.subjects) {
      if (daySubs.has(s)) count++;
    }
    if (count > 5) {
      return { counts, error: MSG.S6_LOAD_ERR };
    }
    counts[count]++;
  }

  return { counts, error: null };
}

export function studentsWithLoad(
  day: DayIdx,
  n: number,
  timetable: Timetable,
  students: Student[]
): string[] {
  const daySubs = new Set<string>();
  for (let p = 1; p <= 5; p++) {
    const subs = timetable[slotKey(day, p as PeriodIdx)]?.subjects ?? [];
    for (const s of subs) daySubs.add(s);
  }

  const results: string[] = [];
  for (const st of students) {
    const stSubsInDay = st.subjects.filter(s => daySubs.has(s));
    if (stSubsInDay.length === n) {
      const banStr = st.ban.padStart(3, ' ');
      const numStr = st.num < 10 ? \` \${st.num}\` : \`\${st.num}\`;
      const subNames = stSubsInDay
        .map(s => {
          const idx = s.indexOf('(');
          return idx !== -1 ? s.slice(0, idx).trim() : s.trim();
        })
        .join('  ');
      results.push(\`\${banStr} \${numStr}번 \${st.name}: \${subNames}\`);
    }
  }
  return results;
}
`);

console.log('Part 2-1 written.');
