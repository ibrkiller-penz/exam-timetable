import { SubjectBan, SubjectBanKey, SubjectBanEntry, CellValue, PlacementSlot, PlacementGrid, SlotSummary, CellInfo, Student, ExamRoom, isWaitCell, isForbiddenCell, parseWaitCount } from './types';
import { MSG } from './messages';

export function subjectBanEntries(subjectBans: SubjectBan[]): Map<SubjectBanKey, SubjectBanEntry> {
  const map = new Map<SubjectBanKey, SubjectBanEntry>();
  const subjectCounters = new Map<string, number>();

  for (const b of subjectBans) {
    const nextIdx = (subjectCounters.get(b.subject) ?? 0) + 1;
    subjectCounters.set(b.subject, nextIdx);
    const key = `${b.subject}-${nextIdx}반`;
    map.set(key, { ...b, key, index: nextIdx });
  }

  return map;
}

export function cellDerived(
  v: CellValue,
  entries: Map<SubjectBanKey, SubjectBanEntry>
): { classRoom: string; stuCount: number | '' } {
  if (!v || v === '') return { classRoom: '', stuCount: '' };
  if (isWaitCell(v)) {
    const mBan = /대기\s*(\d+)\s*반/.exec(v);
    const roomLabel = mBan ? `${mBan[1]}반` : '·';
    return { classRoom: roomLabel, stuCount: parseWaitCount(v) };
  }

  const e = entries.get(v);
  if (e) {
    const roomName = e.room.replace('7차일반 ', '');
    return { classRoom: roomName, stuCount: e.stuCount };
  }

  const hyphenIdx = v.lastIndexOf('-');
  if (hyphenIdx !== -1) {
    const banPart = v.slice(hyphenIdx + 1).trim();
    return { classRoom: banPart, stuCount: '' };
  }
  return { classRoom: '', stuCount: '' };
}

export function slotSummary(
  i: number,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  studentPlacements?: Record<number, Record<string, string>>,
  students?: Student[],
  /**
   * 학생을 실제로 앉힌 결과만 셉니다 (8. 학생 배치).
   *
   * 끄면, 앉힌 결과가 없을 때 편성현황의 분반 인원으로 대신 셉니다.
   * 7. 고사장 배치에서는 그 어림수가 쓸모 있지만, 8. 학생 배치에서 쓰면
   * 배치를 초기화해도 인원이 그대로 차 있는 것처럼 보입니다.
   */
  strictStudents = false
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
  const slotP = studentPlacements?.[i];
  let placedBan = 0;
  for (const v of Object.values(row)) {
    if (v && !isWaitCell(v) && v !== '배치금지') placedBan++;
  }

  let placedTakers = 0;
  let placedNon = 0;

  if (slotP && students && students.length > 0 && Object.keys(slotP).length > 0) {
    for (const st of students) {
      const rId = slotP[`${st.ban}-${st.num}`];
      if (rId && row[rId]) {
        const cell = row[rId];
        if (isWaitCell(cell)) {
          placedNon++;
        } else if (cell !== '배치금지') {
          placedTakers++;
        }
      }
    }
  } else if (!strictStudents) {
    for (const v of Object.values(row)) {
      if (!v || v === '' || v === '배치금지') continue;
      if (isWaitCell(v)) {
        placedNon += parseWaitCount(v);
      } else {
        const e = entries.get(v);
        if (e) {
          placedTakers += e.stuCount;
        } else {
          const hyphenIdx = v.lastIndexOf('-');
          const subj = hyphenIdx !== -1 ? v.slice(0, hyphenIdx).trim() : v.trim();
          if (ps.subjects.includes(subj)) {
            const sameSubjRooms = Object.values(row).filter(val => {
              if (!val || isWaitCell(val) || val === '배치금지') return false;
              const h = val.lastIndexOf('-');
              return (h !== -1 ? val.slice(0, h).trim() : val.trim()) === subj;
            });
            const subjTakers = students && students.length > 0 
              ? students.filter(s => s.subjects.includes(subj)).length 
              : ps.takers;
            placedTakers += Math.round(subjTakers / Math.max(1, sameSubjRooms.length));
          }
        }
      }
    }
  }

  const actualBanTotal = Math.max(ps.banCountTotal, placedBan);
  const total = { ban: actualBanTotal, takers: ps.takers, nonTakers: ps.nonTakers };
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

  // 이미 칸에 놓인 분반. 분반 이름이 'G1'처럼 '반'으로 끝나지 않을 수 있어
  // '대기'와 '배치금지'만 걸러냅니다.
  const placedSet = new Set(
    Object.values(placement[i] ?? {}).filter(v => v && !isWaitCell(v) && !isForbiddenCell(v))
  );
  const items: PanelItem[] = [];

  for (let sIdx = 0; sIdx < ps.subjects.length; sIdx++) {
    const s = ps.subjects[sIdx];

    // 편성현황에 등록된 분반을 그대로 씁니다.
    // 예전에는 '과목-1반, 과목-2반 …'이라고 이름을 지어내서, 편성현황의
    // 분반 이름(학교지정-G1 등)과 맞지 않아 배치가 통째로 어긋났습니다.
    const subEntries = Array.from(entries.values())
      .filter(e => e.subject === s)
      .sort((a, b) => a.index - b.index);

    if (subEntries.length > 0) {
      for (const e of subEntries) {
        if (!placedSet.has(e.key)) {
          items.push({ type: 'ban', key: e.key, room: e.room, count: `${e.stuCount}명` });
        }
      }
      continue;
    }

    // 편성현황에 분반이 없을 때만 예전처럼 번호를 붙입니다.
    const bCount = ps.banCounts[sIdx] ?? 0;
    for (let n = 1; n <= bCount; n++) {
      const key = `${s}-${n}반`;
      if (!placedSet.has(key)) {
        items.push({ type: 'ban', key, room: '', count: '' });
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
      key: `대기 - ${n}명`,
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
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  studentPlacements?: Record<number, Record<string, string>>,
  students?: Student[]
): void {
  for (const ps of placementSlots) {
    const sum = slotSummary(ps.index, placement, placementSlots, entries, studentPlacements, students);
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
      if (!v || isWaitCell(v) || isForbiddenCell(v)) continue;
      if (seen.has(v)) {
        throw new Error(MSG.S7_DUP_BAN(v));
      }
      seen.add(v);

      const hyphenIdx = v.lastIndexOf('-');
      const subjName = hyphenIdx !== -1 ? v.slice(0, hyphenIdx).trim() : v.trim();
      const sb = entries.get(v);
      const subjectToCheck = sb ? sb.subject : subjName;

      if (!canSub.includes(subjectToCheck)) {
        throw new Error(MSG.S7_WRONG_SUBJ(v, canSub.join(',')));
      }
    }
  }
}
