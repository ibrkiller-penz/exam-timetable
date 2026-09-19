import { NeisRow, SubjectSummary, SubjectBan, ExamRoom, ExamDay, ExamTime } from './types';
import { vbaVal } from './util/vbaVal';
import { stableSort, compareBanNameEmptyLast } from './util/sort';
import { studentKey } from './types';
import { DAYS, PERIODS, DEFAULT_TIME } from './constants';

export function normalizeNeisRooms(neis: NeisRow[]): NeisRow[] {
  const normalRoomMap = new Map<string, string>();
  for (const r of neis) {
    if (r.room && !r.room.includes('위탁') && r.ban) {
      normalRoomMap.set(`${r.subject}__${r.ban}`, r.room);
    }
  }

  return neis.map(r => {
    if (r.room && r.room.includes('위탁') && r.ban) {
      const match = normalRoomMap.get(`${r.subject}__${r.ban}`);
      if (match) {
        return { ...r, room: match, room2: match };
      }
    }
    return r;
  });
}

export function buildSubjectTables(neis: NeisRow[], pass: 1 | 2): { subjectSummary: SubjectSummary[]; subjectBans: SubjectBan[] } {
  const cleanNeis = normalizeNeisRooms(neis);
  const roomOf = (r: NeisRow) => (pass === 1 ? r.room2 : r.room);
  const dic1 = new Map<string, number>();
  const dic2 = new Map<string, { subject: string; room: string; stuCount: number }>();

  for (const r of cleanNeis) {
    if (!r.subject) continue;
    dic1.set(r.subject, (dic1.get(r.subject) ?? 0) + 1);
    const k = r.subject + ' ' + roomOf(r);
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
      roomName = `${grade}-편의`;
    } else if (key !== '위탁학생') {
      roomName = `${grade}-${vbaVal(key)}`;
    }
    rooms.push({
      id: `room_${idSeq++}`,
      banName: key,
      stuCount: n,
      maxClassSize: n,
      roomName,
      capacity: 0,
    });
  }

  for (let k = 1; k <= 3; k++) {
    rooms.push({
      id: `extra_${idSeq++}`,
      banName: '',
      stuCount: null,
      maxClassSize: null,
      roomName: `별도실${k}`,
      capacity: 30,
    });
  }

  if (subjectSummary.length > 0) {
    const maxBan = Math.max(...subjectSummary.map(s => s.banCount));
    const maxSubjObj = subjectSummary.find(s => s.banCount === maxBan);
    if (maxSubjObj) {
      const maxSubj = maxSubjObj.subject;
      for (const b of subjectBans.filter(b => b.subject === maxSubj)) {
        const m = /7차일반\s*(\d+)/.exec(b.room);
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
