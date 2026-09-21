import { PlacementGrid, PlacementSlot, ExamRoom, SubjectBanKey, SubjectBanEntry, Student, CellValue, isExtraRoom, isWaitCell, parseWaitCount, NeisRow, SlotRoomCapacity, SlotCapacityBasis, roomsForSlot } from './types';
import { panelItems, cellInfo, waitByBan, cellDerived } from './placement';
import { assertSlotIntegrity } from './integrity';

export interface MovementStats {
  homeWaitPercentage: number;
  totalMoves: number;
  totalWaiters: number;
  homeWaiters: number;
}

/**
 * Original Excel VBA auto-placement algorithm (SPEC §5.21 / CAutoBaechi_Click):
 * 1. If isExtra (examinees placed in extra rooms), place exam bans into extraRooms in order.
 * 2. Otherwise (standard placement), place exam bans into their designated 7차일반 rooms (rooms[T - 1]).
 * 3. Then fill remaining empty room cells in room table order:
 *    - If isExtra: each home room gets wait cell for its own non-takers (`대기 - ${waitMap.get(ci.ban)}명`).
/**
 * 분반 강의실 이름이 같은 분반을 가리키는지 봅니다.
 * NEIS 원본은 '학교지정-G1', 분반 목록은 'G1'처럼 접두어만 다른 경우가 있습니다.
 */
/**
 * 편성현황의 강의실 이름과 분반 목록의 이름이 같은 분반인지.
 *
 * 편성현황에는 '학교지정-G1'처럼 접두어가 붙고, 분반 목록에는 'G1'로 줄여
 * 저장됩니다. 그래서 '-' 뒤의 꼬리만 떼어 비교합니다.
 *
 * 예전에는 endsWith로 느슨하게 맞췄는데, 그러면 '11반'이 '1반'과 같다고
 * 판정되어 학급이 열 개 넘는 학교에서 명단이 뒤섞였습니다. 꼬리는 완전히
 * 같아야 합니다.
 */
/**
 * 고사장을 어느 반부터 채울지.
 *  - 'minMove' 원반이 같은 교실을 먼저 줍니다. 학생이 가장 적게 움직입니다(기본).
 *  - 'first'   1반부터 차례로 채웁니다. 뒤쪽 반이 대기실이 됩니다.
 *  - 'last'    마지막 반부터 거꾸로 채웁니다. 앞쪽 반이 대기실이 됩니다.
 */
export type RoomFillOrder = 'minMove' | 'first' | 'last';

/**
 * 대기(미응시) 인원을 어떻게 앉힐지.
 *  - 'home'      제 교실에 머무르는 것을 먼저 맞춥니다. 학생이 가장 적게 움직입니다(기본).
 *  - 'student_id' 학번 순서대로 앞 대기실부터 채웁니다. 명단이 학번순으로 깔끔해집니다.
 */
export type WaitFillMode = 'home' | 'student_id';

const sameBanRoom = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return false;
  const tail = (v: string) => {
    const norm = v.replace(/\s+/g, '').toLowerCase();
    return norm.includes('-') ? norm.slice(norm.lastIndexOf('-') + 1) : norm;
  };
  const A = tail(a);
  const B = tail(b);
  return A.length > 0 && A === B;
};

/**
 * 분반(SubjectBanEntry)에 매칭되는 실제 수강 학생 목록을 가져옵니다.
 */
export function getStudentsForSubjectBanEntry(
  entry: SubjectBanEntry,
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[]
): Student[] {
  const subjectStudents = students
    .filter(st => st.subjects.includes(entry.subject))
    .sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

  const subjectEntries = Array.from(entries.values())
    .filter(e => e.subject === entry.subject)
    .sort((a, b) => a.index - b.index);

  let offset = 0;
  for (const e of subjectEntries) {
    if (e.key === entry.key) break;
    offset += e.stuCount;
  }
  return subjectStudents.slice(offset, offset + entry.stuCount);
}

/**
 * 이 분반에 실제로 속한 학생을 찾습니다.
 *  1. 편성현황에서 강의실 이름이 같은 학생
 *  2. 이름이 달라 못 찾으면, 편성현황의 분반 묶음을 이름 순으로 늘어놓고
 *     분반 목록과 i번째끼리 짝지음 (분반 목록도 같은 기준으로 만들어졌습니다)
 *  3. 그래도 없으면 분반 인원 수만큼 잘라서 씀
 */
/**
 * 이 분반에 실제로 속한 학생. 방을 고르기 전에 '진짜 몇 명인지' 알아야 합니다.
 * 위 banMembers 와 같은 규칙을 쓰되, 과목 학생 추리는 일까지 같이 합니다.
 */
export function membersOfBan(
  entry: SubjectBanEntry,
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  neis?: NeisRow[]
): Student[] {
  const subjectStudents = students
    .filter(st => st.subjects.includes(entry.subject))
    .sort((a, b) => (a.ban !== b.ban ? a.ban.localeCompare(b.ban, 'ko') : a.num - b.num));
  return banMembers(entry, entries, subjectStudents, neis);
}

function banMembers(
  entry: SubjectBanEntry,
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  subjectStudents: Student[],
  neis?: NeisRow[]
): Student[] {
  if (neis && neis.length > 0) {
    const direct = new Set(
      neis.filter(row => row.subject === entry.subject &&
                         (sameBanRoom(row.room, entry.room) || sameBanRoom(row.room2, entry.room)))
          .map(row => `${row.ban}-${row.num}`)
    );
    const hit = subjectStudents.filter(st => direct.has(`${st.ban}-${st.num}`));
    if (hit.length > 0) return hit;

    const groups = new Map<string, Student[]>();
    for (const row of neis) {
      if (row.subject !== entry.subject) continue;
      const key = row.room2 || row.room;
      if (!key) continue;
      const st = subjectStudents.find(x => x.ban === row.ban && x.num === row.num);
      if (!st) continue;
      const list = groups.get(key);
      if (list) list.push(st);
      else groups.set(key, [st]);
    }

    const ordered = Array.from(entries.values())
      .filter(e => e.subject === entry.subject)
      .sort((a, b) => a.index - b.index);
    const idx = ordered.findIndex(e => e.key === entry.key);
    const groupKeys = Array.from(groups.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (idx >= 0 && idx < groupKeys.length) {
      const byOrder = groups.get(groupKeys[idx]) ?? [];
      if (byOrder.length > 0) return byOrder;
    }
  }

  return getStudentsForSubjectBanEntry(entry, entries, subjectStudents);
}

/**
 * Distribute wait students across available rooms using waterfill algorithm
 * strictly respecting each room's capacity (default 28) to prevent exceeding capacity.
 */
export function distributeWaitToRooms(
  waitStudents: Student[],
  availableRooms: ExamRoom[],
  allStudents?: Student[],
  allowOverflow: boolean = false
): { room: ExamRoom; count: number; students: Student[] }[] {
  if (waitStudents.length === 0 || availableRooms.length === 0) return [];

  // Helper to determine if a room is an extra/auxiliary room
  // (별도실, 원반명이 비어있는 방, 또는 해당 반 소속 학생이 없는 추가 고사실)
  const isExtra = (r: ExamRoom): boolean => {
    if (isExtraRoom(r)) return true;
    if (r.roomName.startsWith('별도') || r.banName.startsWith('별도')) return true;
    if (!r.banName || r.banName.trim() === '') return true;
    if (allStudents && allStudents.length > 0) {
      const hasHomeStudents = allStudents.some(st => st.ban === r.banName || st.ban === r.roomName);
      if (!hasHomeStudents) return true;
    }
    return false;
  };

  const regularRooms = availableRooms.filter(r => !isExtra(r));
  const extraRooms = availableRooms.filter(r => isExtra(r));

  const assignments: { room: ExamRoom; count: number; students: Student[] }[] = [];
  let studentIdx = 0;

  // 1. 일반 학급 고사실(1반~8반 등 원반 교실)에 대기 학생 최우선 균등 배정
  if (regularRooms.length > 0) {
    const regularAssignments = regularRooms.map(r => ({
      room: r,
      count: 0,
      students: [] as Student[],
    }));

    const regularCap = regularRooms.reduce((sum, r) => sum + (r.capacity && r.capacity > 0 ? r.capacity : 28), 0);
    // allowOverflow가 true이고 별도실을 사용하지 않도록 선택한 경우, 일반 학급들에 모든 대기 학생을 균등 분산 배정
    const canOverflow = allowOverflow && extraRooms.length === 0;
    let remainingForRegular = canOverflow ? waitStudents.length : Math.min(waitStudents.length, regularCap);

    while (remainingForRegular > 0) {
      const available = canOverflow
        ? regularAssignments
        : regularAssignments.filter(a => {
            const cap = a.room.capacity && a.room.capacity > 0 ? a.room.capacity : 28;
            return a.count < cap;
          });

      if (available.length === 0) break;

      const minCount = Math.min(...available.map(a => a.count));
      const targetGroup = available.filter(a => a.count === minCount);

      for (const a of targetGroup) {
        if (remainingForRegular <= 0) break;
        const cap = a.room.capacity && a.room.capacity > 0 ? a.room.capacity : 28;
        if (canOverflow || a.count < cap) {
          a.count++;
          a.students.push(waitStudents[studentIdx++]);
          remainingForRegular--;
        }
      }
    }

    regularAssignments.filter(a => a.count > 0).forEach(a => assignments.push(a));
  }

  // 2. 별도실(Extra rooms): 일반 학급 고사실만으로 수용 불가능한 잉여 대기 인원이 남았을 때만 필요한 만큼 순차적으로 최소 사용
  extraRooms.sort((a, b) => {
    const aIsNamedExtra = a.roomName.startsWith('별도') || a.banName.startsWith('별도');
    const bIsNamedExtra = b.roomName.startsWith('별도') || b.banName.startsWith('별도');
    if (aIsNamedExtra && !bIsNamedExtra) return -1;
    if (!aIsNamedExtra && bIsNamedExtra) return 1;
    return a.roomName.localeCompare(b.roomName, 'ko', { numeric: true });
  });

  for (const er of extraRooms) {
    if (studentIdx >= waitStudents.length) break;
    const cap = er.capacity && er.capacity > 0 ? er.capacity : 28;
    const roomStudents: Student[] = [];
    while (studentIdx < waitStudents.length && roomStudents.length < cap) {
      roomStudents.push(waitStudents[studentIdx++]);
    }
    if (roomStudents.length > 0) {
      assignments.push({
        room: er,
        count: roomStudents.length,
        students: roomStudents,
      });
    }
  }

  return assignments;
}

/**
 * 특정 교시(slotIndex)만 완전히 초기화하고 다시 자동 배치를 수행합니다.
 * 다른 교시의 배치 및 학생 배정은 전혀 변경하지 않습니다.
 * lockedCellsRow가 주어지면 잠긴 고사실은 안전하게 유지됩니다.
 */
export function resetAndAutoPlaceSlot(
  slotIndex: number,
  roomIdSelected: string,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  neis?: NeisRow[],
  isExtra?: boolean,
  lockedCellsRow?: Record<string, boolean>
): {
  placement: PlacementGrid;
  slotStudentPlacements: Record<string, string>;
} {
  const newPlacement: PlacementGrid = JSON.parse(JSON.stringify(placement));
  
  // 1. Clear current slot cells (preserve only locked cells and 배치금지 cells)
  const clearedSlotRow: Record<string, CellValue> = {};
  if (newPlacement[slotIndex]) {
    for (const [rId, val] of Object.entries(newPlacement[slotIndex])) {
      if (val === '배치금지') {
        clearedSlotRow[rId] = '배치금지';
      } else if (lockedCellsRow?.[rId]) {
        clearedSlotRow[rId] = val;
      }
    }
  }
  newPlacement[slotIndex] = clearedSlotRow;

  // 2. Run auto-place for this single slot
  const nextPlacement = autoPlaceSlot(
    slotIndex,
    roomIdSelected,
    newPlacement,
    placementSlots,
    rooms,
    entries,
    students,
    isExtra ?? false,
    lockedCellsRow
  );

  // 3. Derive student placements for this single slot
  const nextStudentPlacements = initSlotStudentPlacements(
    slotIndex,
    nextPlacement[slotIndex] ?? {},
    placementSlots,
    rooms,
    entries,
    students,
    neis,
    undefined,
    lockedCellsRow
  );

  return {
    placement: nextPlacement,
    slotStudentPlacements: nextStudentPlacements,
  };
}

export function autoPlaceSlot(
  i: number,
  roomIdSelected: string,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  isExtra: boolean,
  lockedCellsRow?: Record<string, boolean>,
  /** 고사장을 어느 반부터 채울지. 기본은 학생이 가장 적게 움직이는 쪽입니다. */
  roomFillOrder: RoomFillOrder = 'minMove'
): PlacementGrid {
  const newPlacement: PlacementGrid = JSON.parse(JSON.stringify(placement));
  const currentSlot = newPlacement[i] || {};
  const preservedSlot: Record<string, CellValue> = {};
  
  // Preserve manually placed exam cells, ALL locked cells, and 배치금지 cells
  for (const roomId in currentSlot) {
    const val = currentSlot[roomId];
    if (val === '배치금지') {
      preservedSlot[roomId] = '배치금지';
    } else if (lockedCellsRow?.[roomId]) {
      preservedSlot[roomId] = val; // Strictly preserve locked cells
    } else if (val && !isWaitCell(val)) {
      preservedSlot[roomId] = val;
    }
  }
  newPlacement[i] = preservedSlot;

  const ps = placementSlots.find(s => s.index === i);
  if (!ps) return newPlacement;

  // 시험이 없는 교시(예: 2일차 1교시)는 전교생이 '자기 반 교실'에서 대기합니다.
  // 대기 인원을 여러 실에 고르게 흩뿌리지 않고, 반마다 제 교실에 그대로 둡니다.
  if (ps.subjects.length === 0) {
    const sameBan = (st: Student, r: ExamRoom) =>
      st.ban === r.banName || st.ban.replace('반', '') === r.banName.replace('반', '');

    const homeRooms = rooms.filter(r => !isExtraRoom(r) && r.banName && !lockedCellsRow?.[r.id] && preservedSlot[r.id] !== '배치금지');
    const homeCount = new Map<string, number>();
    const strayStudents: Student[] = [];

    for (const st of students) {
      const home = homeRooms.find(r => sameBan(st, r));
      if (home) homeCount.set(home.id, (homeCount.get(home.id) ?? 0) + 1);
      else strayStudents.push(st);
    }

    for (const r of homeRooms) {
      const n = homeCount.get(r.id) ?? 0;
      if (n > 0) newPlacement[i][r.id] = `대기 - ${n}명`;
      else delete newPlacement[i][r.id];
    }

    // 제 교실이 없는 학생(위탁 등)만 남은 실에 나눕니다.
    if (strayStudents.length > 0) {
      const leftoverRooms = rooms.filter(r =>
        !lockedCellsRow?.[r.id] &&
        preservedSlot[r.id] !== '배치금지' &&
        !newPlacement[i][r.id]
      );
      distributeWaitToRooms(strayStudents, leftoverRooms, students).forEach(a => {
        newPlacement[i][a.room.id] = `대기 - ${a.count}명`;
      });
    }

    return newPlacement;
  }

  const extraRooms = rooms.filter(isExtraRoom);
  const items = panelItems(i, roomIdSelected, newPlacement, placementSlots, rooms, entries, students);
  const queue = [...items];
  const selectedRoom = rooms.find(r => r.id === roomIdSelected);
  const capacity = selectedRoom ? selectedRoom.capacity : 28;
  const waitMap = waitByBan(i, placementSlots, students);

  // 1. 시험 분반 항목(it.type === 'ban') 분석 및 정렬
  const banItems = items.filter(it => it.type === 'ban').map(it => {
    const entry = entries.get(it.key);
    let assignedStudents: Student[] = [];
    if (entry) {
      assignedStudents = getStudentsForSubjectBanEntry(entry, entries, students);
    }
    
    const banCounts: Record<string, number> = {};
    for (const s of assignedStudents) {
      banCounts[s.ban] = (banCounts[s.ban] || 0) + 1;
    }
    
    const sortedBans = Object.entries(banCounts).sort((a, b) => b[1] - a[1]);
    const dominantBan = sortedBans[0]?.[0] ?? '';
    const dominantCount = sortedBans[0]?.[1] ?? 0;
    const dominantRatio = assignedStudents.length > 0 ? (dominantCount / assignedStudents.length) : 0;
    
    return {
      it,
      entry,
      assignedStudents,
      dominantBan,
      dominantCount,
      dominantRatio,
      sortedBans: sortedBans.map(b => b[0]),
    };
  });

  banItems.sort((a, b) => {
    /*
     * 큰 분반부터 자리를 잡습니다.
     *
     * 예전에는 '한 반에서 온 비율(dominantRatio)'이 먼저였습니다. 그래서 한
     * 반에서 온 24명짜리가 28석 교실을 먼저 차지하고, 뒤에 오는 29명짜리는
     * 24석 교실밖에 못 얻었습니다. 한국사에서 29명 둘이 24석 방에 들어가
     * 10명이 넘친 까닭입니다.
     *
     * 큰 것부터 넣으면, 어딘가에 앉힐 수 있는 배치가 있는 한 이 순서로
     * 반드시 찾아집니다. 크기가 같을 때만 제 반 교실 쪽을 앞세웁니다.
     */
    if (roomFillOrder === 'minMove' && b.assignedStudents.length !== a.assignedStudents.length) {
      return b.assignedStudents.length - a.assignedStudents.length;
    }
    if (b.dominantRatio !== a.dominantRatio) {
      return b.dominantRatio - a.dominantRatio;
    }
    if (b.dominantCount !== a.dominantCount) {
      return b.dominantCount - a.dominantCount;
    }
    // 큰 분반부터 자리를 잡아야 큰 방을 먼저 차지합니다.
    return b.assignedStudents.length - a.assignedStudents.length;
  });

  // 2. 분반별 최적 고사실 매칭 (잠긴 고사실 제외)
  // '1반부터' / '마지막 반부터'는 교실 순서를 그대로 따릅니다.
  // 원반 매칭을 건너뛰어야 담당자가 고른 순서대로 고사장이 정해집니다.
  const orderedRooms = roomFillOrder === 'last' ? [...rooms].reverse() : rooms;

  for (const item of banItems) {
    let targetRoom: ExamRoom | undefined = undefined;

    /*
     * 이름이 맞아도 자리가 모자라면 그 방은 아닙니다.
     *
     * '자기 반 교실'은 학생이 덜 움직여 좋지만, 29명을 24석에 넣을 값은
     * 아닙니다. 들어가는 방이 하나도 없을 때만 아래에서 가장 큰 방을 씁니다.
     */
    const seatsOf = (r: ExamRoom) => (r.capacity && r.capacity > 0 ? r.capacity : 28);
    const groupSize = item.assignedStudents.length;
    const roomFits = (r: ExamRoom) => seatsOf(r) >= groupSize;

    if (roomFillOrder !== 'minMove') {
      targetRoom = orderedRooms.find(r =>
        !lockedCellsRow?.[r.id] &&
        !isExtraRoom(r) &&
        (!newPlacement[i][r.id] || newPlacement[i][r.id] === '')
      );
    }

    if (!targetRoom && roomFillOrder === 'minMove' && item.dominantBan) {
      targetRoom = rooms.find(r => 
        !lockedCellsRow?.[r.id] &&
        (r.banName === item.dominantBan || r.roomName === item.dominantBan) &&
        (!newPlacement[i][r.id] || newPlacement[i][r.id] === '') &&
        roomFits(r)
      );
    }

    if (!targetRoom && item.it.room) {
      targetRoom = rooms.find(r => 
        !lockedCellsRow?.[r.id] &&
        r.roomName === item.it.room && 
        isExtraRoom(r) &&
        (!newPlacement[i][r.id] || newPlacement[i][r.id] === '') &&
        roomFits(r)
      );
    }

    if (!targetRoom && item.sortedBans.length > 1) {
      for (const ban of item.sortedBans.slice(1)) {
        targetRoom = rooms.find(r => 
          !lockedCellsRow?.[r.id] &&
          (r.banName === ban || r.roomName === ban) &&
          (!newPlacement[i][r.id] || newPlacement[i][r.id] === '') &&
          roomFits(r)
        );
        if (targetRoom) break;
      }
    }

    if (!targetRoom) {
      // 원반이 겹치지 않는 이동수업 분반은 '크기에 맞는 방'에 넣습니다.
      // 빈 방 순서대로 넣으면 29명 분반이 24석 방에 들어가 정원을 넘기게 됩니다.
      const free = rooms.filter(r =>
        !lockedCellsRow?.[r.id] &&
        !isExtraRoom(r) &&
        (!newPlacement[i][r.id] || newPlacement[i][r.id] === '')
      );
      const size = groupSize;
      const capOf = seatsOf;
      const fits = free.filter(r => capOf(r) >= size).sort((a, b) => capOf(a) - capOf(b));
      // 담을 수 있는 방 중 가장 작은 방, 없으면 남은 방 중 가장 큰 방을 씁니다.
      targetRoom = fits[0] ?? [...free].sort((a, b) => capOf(b) - capOf(a))[0];
    }

    if (!targetRoom) {
      targetRoom = rooms.find(r => !lockedCellsRow?.[r.id] && (!newPlacement[i][r.id] || newPlacement[i][r.id] === ''));
    }

    if (!targetRoom) continue;

    newPlacement[i][targetRoom.id] = item.it.key;
    const qIdx = queue.findIndex(x => x.key === item.it.key);
    if (qIdx !== -1) queue.splice(qIdx, 1);
  }

  // 1. Place remaining exams in empty rooms (excluding locked rooms)
  for (const r of orderedRooms) {
    if (lockedCellsRow?.[r.id]) continue;
    if (newPlacement[i][r.id] && newPlacement[i][r.id] !== '') continue;
    const head = queue[0];
    if (!head || head.type === 'wait') break;
    newPlacement[i][r.id] = head.key;
    queue.shift();
  }

  // 정원이 모자라도 고사장을 임의로 늘리지 않습니다.
  // 늘리면 편성현황에 없는 가짜 분반이 생겨 이름과 명단이 어긋납니다.
  // 분반은 통째로 제 방에 앉히고, 좌석을 넘으면 '강제배정'으로 드러냅니다.
  // 담당자가 빈 고사실로 직접 옮기면 됩니다.

  // 2. Do "자반 대기" if isExtra is true
  if (isExtra) {
    for (const r of rooms) {
      if (lockedCellsRow?.[r.id]) continue;
      if (newPlacement[i][r.id] && newPlacement[i][r.id] !== '') continue;
      const ci = cellInfo(i, r.id, newPlacement, placementSlots, rooms, entries);
      if (ci && waitMap.has(ci.ban)) {
        const roomCap = r.capacity && r.capacity > 0 ? r.capacity : 28;
        const banWaitCount = waitMap.get(ci.ban) || 0;
        const countToPlace = Math.min(banWaitCount, roomCap);
        if (countToPlace > 0) {
          newPlacement[i][r.id] = `대기 - ${countToPlace}명`;
        }
      }
    }
  }

  // 3. Distribute ALL remaining unplaced wait students evenly (excluding locked rooms)
  const waitRoomsForCount = rooms.filter(r => {
    if (lockedCellsRow?.[r.id]) return false;
    const val = newPlacement[i][r.id];
    return !val || isWaitCell(val);
  });
  
  if (waitRoomsForCount.length > 0) {
    const ci = cellInfo(i, waitRoomsForCount[0].id, newPlacement, placementSlots, rooms, entries);
    let remainWait = ci ? ci.noExamRemainCount : 0;

    let pass = 0;
    while (remainWait > 0 && pass < 1000) {
      pass++;
      
      let roomCaps = waitRoomsForCount.filter(r => !isExtraRoom(r)).map(r => {
        const val = newPlacement[i][r.id];
        const currentCount = val ? parseWaitCount(val) : 0;
        const cap = (r.capacity || 28) - currentCount;
        return { r, cap, currentCount };
      }).filter(x => x.cap > 0);
      
      if (roomCaps.length === 0) {
        const extraRoomCaps = waitRoomsForCount.filter(r => isExtraRoom(r)).map(r => {
          const val = newPlacement[i][r.id];
          const currentCount = val ? parseWaitCount(val) : 0;
          const cap = (r.capacity || 28) - currentCount;
          return { r, cap, currentCount };
        }).filter(x => x.cap > 0);
        
        for (const rc of extraRoomCaps) {
          while (remainWait > 0 && rc.cap > 0) {
            rc.currentCount++;
            rc.cap--;
            newPlacement[i][rc.r.id] = `대기 - ${rc.currentCount}명`;
            remainWait--;
          }
        }
        break;
      }
      
      for (const rc of roomCaps) {
        if (remainWait <= 0) break;
        if (rc.currentCount >= (rc.r.capacity || 28)) continue;
        rc.currentCount++;
        newPlacement[i][rc.r.id] = `대기 - ${rc.currentCount}명`;
        remainWait--;
      }
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
  extraAnswers?: Record<number, boolean>,
  lockedCells?: Record<number, Record<string, boolean>>,
  slotRoomCapacity?: SlotRoomCapacity,
  slotCapacityBasis?: SlotCapacityBasis,
  roomFillOrder: RoomFillOrder = 'minMove'
): PlacementGrid {
  let currentPlacement = JSON.parse(JSON.stringify(placement));
  const firstUsableRoom = rooms.find(r => r.roomName !== '' && r.roomName !== '0');
  const firstRoomId = firstUsableRoom ? firstUsableRoom.id : rooms[0]?.id ?? '';

  for (const ps of placementSlots) {
    const isExtra = extraAnswers?.[ps.index] ?? false;
    currentPlacement = autoPlaceSlot(
      ps.index,
      firstRoomId,
      currentPlacement,
      placementSlots,
      // 교시마다 정원 예외가 다를 수 있으므로 해당 교시 기준으로 환산한 고사실을 넘깁니다.
      roomsForSlot(rooms, ps.index, slotRoomCapacity, ps, currentPlacement[ps.index], slotCapacityBasis?.[ps.index]),
      entries,
      students,
      isExtra,
      lockedCells?.[ps.index],
      roomFillOrder
    );
  }

  return currentPlacement;
}

/**
 * Calculate movement statistics for the current placement grid.
 */
export function calculateStudentMovement(
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  students: Student[]
): MovementStats {
  let totalWaiters = 0;
  let homeWaiters = 0;
  let totalMoves = 0;

  for (const ps of placementSlots) {
    const slotIdx = ps.index;
    const row = placement[slotIdx] ?? {};
    const slotSubjects = ps.subjects;

    const waitMap = new Map<string, number>();
    for (const st of students) {
      if (!st.subjects.some(sub => slotSubjects.includes(sub))) {
        const banKey = st.ban.replace('반', '');
        waitMap.set(banKey, (waitMap.get(banKey) ?? 0) + 1);
      }
    }

    for (const [ban, count] of waitMap.entries()) {
      totalWaiters += count;
      const room = rooms.find(r => r.banName.replace('반', '') === ban);
      if (room && row[room.id]?.startsWith('대기')) {
        homeWaiters += count;
      } else {
        totalMoves += count;
      }
    }
  }

  const homeWaitPercentage = totalWaiters > 0 ? Math.round((homeWaiters / totalWaiters) * 100) : 100;

  return {
    homeWaitPercentage,
    totalMoves,
    totalWaiters,
    homeWaiters,
  };
}

/**
 * Determines whether a slot should use 'ban' (분반 위주) or 'student_id' (학번순) placement.
 * Rule:
 * - If banCount === roomCount: 'ban' (분반 위주)
 * - If banCount !== roomCount: 'student_id' (학번순)
 */
export function getSlotPlacementStrategy(
  slotIndex: number,
  placementRow: Record<string, CellValue>,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[]
): { strategy: 'ban' | 'student_id'; banCount: number; roomCount: number; reason: string } {
  const ps = placementSlots.find(s => s.index === slotIndex);
  if (!ps) {
    return { strategy: 'ban', banCount: 0, roomCount: 0, reason: '기본 분반 위주 배정' };
  }

  // Active exam rooms assigned to this slot
  const activeExamRooms = rooms.filter(r => {
    const val = placementRow[r.id];
    return val && !isWaitCell(val) && val !== '배치금지';
  });

  const slotSubjects = ps.subjects;
  const slotEntries = Array.from(entries.values()).filter(e => slotSubjects.includes(e.subject));

  const roomCount = activeExamRooms.length > 0 ? activeExamRooms.length : rooms.filter(r => !isExtraRoom(r)).length;
  const banCount = slotEntries.length;

  // 칸에 분반 이름이 적혀 있으면 분반 위주로 앉힙니다. 분반 수와 고사실 수가
  // 달라도 그렇습니다. 담당자가 고사장을 1실 더 열었다고 해서 분반을 학번순으로
  // 흩어 놓으면 편성현황과 명단이 어긋납니다. 남는 고사실은 비워 두고
  // 담당자가 직접 옮기면 됩니다.
  //
  // 학번순은 칸에 분반이 없을 때(과목 이름만 적힌 경우)만 씁니다.
  const isBanKey = (val: string) => {
    const normKey = val.endsWith('반') ? val : `${val}반`;
    return entries.has(val) || entries.has(normKey);
  };
  const cellsWithBan = activeExamRooms.filter(r => isBanKey(placementRow[r.id] as string)).length;

  if (activeExamRooms.length > 0 && cellsWithBan > 0) {
    return {
      strategy: 'ban',
      banCount,
      roomCount,
      reason: banCount === roomCount
        ? `분반 수(${banCount}) = 시험실 수(${roomCount}) ➔ 분반 위주 배정`
        : `칸에 분반이 적혀 있음 ➔ 분반 위주 배정 (시험실 ${roomCount}실 중 ${roomCount - cellsWithBan}실은 비워 둠)`,
    };
  }

  if (roomCount > 0 && banCount === roomCount) {
    return { strategy: 'ban', banCount, roomCount, reason: `분반 수(${banCount}) = 시험실 수(${roomCount}) ➔ 분반 위주 배정` };
  }
  return {
    strategy: 'student_id',
    banCount,
    roomCount,
    reason: `칸에 분반이 없고 분반 수(${banCount}) ≠ 시험실 수(${roomCount}) ➔ 학번순 배정`,
  };
}

/**
 * Initialize or derive student-level room placements for a single slot.
 * Returns a mapping: studentKey (`${st.ban}-${st.num}`) -> roomId
 * Guarantees that EVERY student is placed (zero missing students).
 */
export function initSlotStudentPlacements(
  slotIndex: number,
  placementRow: Record<string, CellValue>,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  neis?: NeisRow[],
  existingSlotPlacements?: Record<string, string>,
  lockedCellsRow?: Record<string, boolean>,
  placementMode?: 'auto' | 'ban' | 'student_id',
  /** 대기 인원을 어떻게 앉힐지. 기본은 제 교실에 머무르게 하는 쪽입니다. */
  waitMode: WaitFillMode = 'home'
): Record<string, string> {
  const result: Record<string, string> = {};
  const ps = placementSlots.find(s => s.index === slotIndex);
  if (!ps) return result;

  const assignedStudentKeys = new Set<string>();
  const overflowExamStudents: { student: Student; originalRoomId: string; subject: string }[] = [];

  // 0. Preserve existing student assignments in LOCKED rooms
  if (existingSlotPlacements && lockedCellsRow) {
    for (const [stKey, rId] of Object.entries(existingSlotPlacements)) {
      if (lockedCellsRow[rId]) {
        result[stKey] = rId;
        assignedStudentKeys.add(stKey);
      }
    }
  }

  // Determine effective strategy ('ban' vs 'student_id')
  const { strategy: autoStrategy } = getSlotPlacementStrategy(
    slotIndex,
    placementRow,
    placementSlots,
    rooms,
    entries,
    students
  );
  const effectiveStrategy = placementMode && placementMode !== 'auto' ? placementMode : autoStrategy;

  if (effectiveStrategy === 'student_id') {
    // === 학번순 배치 (Student ID Sequential Placement) ===
    const slotSubjects = ps.subjects;
    const examTakers = students
      .filter(st => st.subjects.some(sub => slotSubjects.includes(sub)) && !assignedStudentKeys.has(`${st.ban}-${st.num}`))
      .sort((a, b) => {
        if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko', { numeric: true });
        return a.num - b.num;
      });

    // Find exam rooms for this slot
    const examRooms = rooms.filter(r => {
      const val = placementRow[r.id];
      return val && !isWaitCell(val) && val !== '배치금지';
    });
    const targetExamRooms = examRooms.length > 0 ? examRooms : rooms.filter(r => !isExtraRoom(r));

    const openExamRooms = targetExamRooms.filter(r => !lockedCellsRow?.[r.id]);
    const roomCapOf = (r: ExamRoom) => (r.capacity && r.capacity > 0 ? r.capacity : 28);
    const assignedCount = (roomId: string) => Object.values(result).filter(id => id === roomId).length;

    // 학번 순서를 유지한 채 고사실별 인원을 균등하게 나눕니다 (예: 91명 / 4실 ➔ 23, 23, 23, 22).
    // 앞쪽 고사실부터 정원까지 채우면 마지막 고사실만 몇 명 남는 기형적인 배치가 됩니다.
    let takerIdx = 0;
    if (openExamRooms.length > 0) {
      const quotaBase = Math.floor(examTakers.length / openExamRooms.length);
      const quotaRemainder = examTakers.length % openExamRooms.length;

      openExamRooms.forEach((r, idx) => {
        const quota = quotaBase + (idx < quotaRemainder ? 1 : 0);
        const toTake = Math.min(quota, Math.max(0, roomCapOf(r) - assignedCount(r.id)));
        for (let i = 0; i < toTake && takerIdx < examTakers.length; i++) {
          const st = examTakers[takerIdx++];
          const k = `${st.ban}-${st.num}`;
          result[k] = r.id;
          assignedStudentKeys.add(k);
        }
      });
    }

    // 정원이 작은 고사실 때문에 할당량을 못 채운 잔여 인원은 여유 있는 고사실에 순서대로 채웁니다.
    while (takerIdx < examTakers.length) {
      const availRoom = openExamRooms.find(r => assignedCount(r.id) < roomCapOf(r));
      if (!availRoom) break;
      const st = examTakers[takerIdx++];
      const k = `${st.ban}-${st.num}`;
      result[k] = availRoom.id;
      assignedStudentKeys.add(k);
    }

    // 고사실이 부족해 끝내 배치하지 못한 응시자는 미배치('')로 남깁니다.
    // 대기실은 대기 인원 몫이므로, 응시자를 밀어넣어 대기 학생을 밀어내지 않습니다.
    for (; takerIdx < examTakers.length; takerIdx++) {
      const st = examTakers[takerIdx];
      const k = `${st.ban}-${st.num}`;
      if (!assignedStudentKeys.has(k)) result[k] = '';
    }
  } else {
    // === 분반 위주 배치 (Class Division Based Placement) ===
  const subjectsInSlot = new Set<string>();
  for (const r of rooms) {
    const val = placementRow[r.id];
    if (!val || isWaitCell(val) || val === '배치금지') continue;
    const hyphenIdx = val.lastIndexOf('-');
    const cleanSub = hyphenIdx !== -1 ? val.slice(0, hyphenIdx).trim() : val.trim();
    subjectsInSlot.add(cleanSub);
  }

  for (const sub of subjectsInSlot) {
    const subRooms = rooms.filter(r => {
      const val = placementRow[r.id];
      if (!val || isWaitCell(val) || val === '배치금지') return false;
      const hyphenIdx = val.lastIndexOf('-');
      const cleanSub = hyphenIdx !== -1 ? val.slice(0, hyphenIdx).trim() : val.trim();
      return cleanSub === sub;
    });

    const subEntries = Array.from(entries.values()).filter(e => e.subject === sub);
    const hasSplitOrAdded = subRooms.length !== subEntries.length || subRooms.some(r => {
      const val = placementRow[r.id]!;
      const normKey = val.endsWith('반') ? val : `${val}반`;
      return !entries.has(val) && !entries.has(normKey) && !Array.from(entries.values()).some(e => e.key === val || e.key === normKey);
    });

    const subjectStudents = students
      .filter(st => st.subjects.includes(sub))
      .sort((a, b) => {
        if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
        return a.num - b.num;
      });

    if (hasSplitOrAdded) {
      // 고사장을 더 쓴 교시입니다.
      // 편성현황에 있는 분반은 그대로 제 방에 앉히고, 추가한 방에만 남은 인원을 나눕니다.
      // 예전에는 교시 전체를 균등 분배해 버려 분반이 통째로 흩어졌습니다.
      const realBanRooms = subRooms.filter(r => {
        if (lockedCellsRow?.[r.id]) return false;
        const val = placementRow[r.id]!;
        return entries.has(val);
      });

      for (const r of realBanRooms) {
        const entry = entries.get(placementRow[r.id]!)!;
        const mine = banMembers(entry, entries, subjectStudents, neis);
        for (const st of mine) {
          const k = `${st.ban}-${st.num}`;
          if (assignedStudentKeys.has(k)) continue;
          result[k] = r.id;
          assignedStudentKeys.add(k);
        }
      }

      // 추가한 방은 비워 둡니다.
      // 분반을 흩어 놓으면 편성현황과 달라지므로, 담당자가 보고 직접 옮기도록 남깁니다.
      // 분반을 못 찾은 학생만 미배치로 남아 배치 패널에 뜹니다.
    } else {
      // Standard 1:1 NEIS / offset match
      for (const r of subRooms) {
        const val = placementRow[r.id]!;
        const normKey = val.endsWith('반') ? val : `${val}반`;
        const entry = entries.get(val) || entries.get(normKey) || Array.from(entries.values()).find(e => e.key === val || e.key === normKey);
        if (!entry) continue;

        const matched = banMembers(entry, entries, subjectStudents, neis);

        // 분반은 통째로 그 고사실에 앉힙니다. 좌석보다 많아도 쪼개지 않습니다.
        // 쪼개면 남은 인원이 다음 방으로 밀리면서 모든 분반이 어긋납니다.
        // 좌석을 넘으면 화면에 '강제배정'으로 드러나므로 정원을 올리거나 학생을 옮기면 됩니다.
        for (const st of matched) {
          const k = `${st.ban}-${st.num}`;
          if (assignedStudentKeys.has(k)) continue;
          result[k] = r.id;
          assignedStudentKeys.add(k);
        }
      }
    }
  }

  // 1C. Safely place any overflow exam students in other available rooms or extra rooms
  if (overflowExamStudents.length > 0) {
    for (const item of overflowExamStudents) {
      const st = item.student;
      const k = `${st.ban}-${st.num}`;
      if (assignedStudentKeys.has(k)) continue;

      // 1. Try finding another room with same subject and available capacity
      let targetRoom = rooms.find(r => {
        const val = placementRow[r.id];
        if (!val || isWaitCell(val)) return false;
        if (!val.startsWith(item.subject)) return false;
        const cap = r.capacity && r.capacity > 0 ? r.capacity : (r.maxClassSize && r.maxClassSize > 0 ? r.maxClassSize : 28);
        const assigned = Object.values(result).filter(id => id === r.id).length;
        return assigned < cap;
      });

      // 같은 과목 고사장에 자리가 없으면 여기서 멈춥니다.
      //
      // 예전에는 빈 교실이나 대기실에라도 앉혔습니다. 그러면 시험을 보는 학생이
      // 대기실 명단에 올라가, 인쇄물에는 대기로 찍히고 고사실 응시현황표에서는
      // 빠집니다. 고사장에 자리가 없다는 사실 자체를 감추는 셈입니다.
      //
      // 이제 미배치로 둡니다. 배치 패널에 뜨고 8. 학생 배치 확정도 막히므로,
      // 담당자가 어느 고사실로 보낼지 직접 정하게 됩니다.
      if (targetRoom) {
        result[k] = targetRoom.id;
        assignedStudentKeys.add(k);
      } else {
        result[k] = '';
      }
    }
  }
  }

  // 2. Assign wait rooms
  // 분반 위주 / 학번순 어느 전략으로 배치했든 대기 인원 배정은 항상 수행해야 합니다.
  const slotSubjects = ps.subjects;
  const nonTakers = students.filter(st => !st.subjects.some(sub => slotSubjects.includes(sub)));

  const roomWaitQuota: Record<string, number> = {};
  for (const r of rooms) {
    const val = placementRow[r.id];
    if (val && isWaitCell(val)) {
      roomWaitQuota[r.id] = parseWaitCount(val);
    }
  }

  // Pass 2A: 제 교실에 머무르게 하는 단계입니다.
  // '학번순'을 고르면 이 단계를 건너뛰고, 아래 2B 에서 학번 순서대로 채웁니다.
  for (const r of (waitMode === 'home' ? rooms : [])) {
    const quota = roomWaitQuota[r.id] || 0;
    if (quota <= 0 || !r.banName) continue;

    const roomCap = r.capacity && r.capacity > 0 ? r.capacity : (r.maxClassSize && r.maxClassSize > 0 ? r.maxClassSize : 28);
    const currentAssigned = Object.values(result).filter(id => id === r.id).length;
    const availableSpace = Math.max(0, roomCap - currentAssigned);
    const effectiveQuota = Math.min(quota, availableSpace);

    const targetBanKey = r.banName.replace('반', '');
    const banWaiters = nonTakers
      .filter(st => !assignedStudentKeys.has(`${st.ban}-${st.num}`) && st.ban.replace('반', '') === targetBanKey)
      .sort((a, b) => a.num - b.num);

    const toTake = banWaiters.slice(0, effectiveQuota);
    for (const st of toTake) {
      const k = `${st.ban}-${st.num}`;
      result[k] = r.id;
      assignedStudentKeys.add(k);
    }
    roomWaitQuota[r.id] -= toTake.length;
  }

  // Pass 2B: Fill remaining wait quotas with remaining non-takers (strictly capped by room capacity)
  const remainingNonTakers = nonTakers
    .filter(st => !assignedStudentKeys.has(`${st.ban}-${st.num}`))
    .sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

  let nonTakerIdx = 0;
  for (const r of rooms) {
    const quota = roomWaitQuota[r.id] || 0;
    const roomCap = r.capacity && r.capacity > 0 ? r.capacity : (r.maxClassSize && r.maxClassSize > 0 ? r.maxClassSize : 28);
    const currentAssigned = Object.values(result).filter(id => id === r.id).length;
    const availableSpace = Math.max(0, roomCap - currentAssigned);
    const effectiveQuota = Math.min(quota, availableSpace);

    for (let q = 0; q < effectiveQuota && nonTakerIdx < remainingNonTakers.length; q++) {
      const st = remainingNonTakers[nonTakerIdx++];
      const k = `${st.ban}-${st.num}`;
      result[k] = r.id;
      assignedStudentKeys.add(k);
    }
  }

  // Pass 2C: 그래도 남은 대기 학생을 자리 있는 대기실에 채웁니다.
  //
  // 위의 두 패스는 칸에 적힌 숫자(`대기 - 24명`)를 몫으로 씁니다. 그 숫자는
  // 지난번에 나눈 결과일 뿐이라, 담당자가 새로 연 빈 대기실(`대기 - 0명`)은
  // 몫이 0이라 아무도 받지 못하고 학생이 미배치로 남았습니다.
  // 자리가 남아 있는데 학생이 떠 있는 일은 없어야 하므로, 마지막에 정원까지 채웁니다.
  for (; nonTakerIdx < remainingNonTakers.length; nonTakerIdx++) {
    const st = remainingNonTakers[nonTakerIdx];
    const k = `${st.ban}-${st.num}`;
    if (assignedStudentKeys.has(k)) continue;

    const room = rooms.find(r => {
      if (lockedCellsRow?.[r.id]) return false; // 잠근 칸은 건드리지 않습니다.
      const val = placementRow[r.id];
      if (!val || !isWaitCell(val)) return false;
      const cap = r.capacity && r.capacity > 0 ? r.capacity : (r.maxClassSize && r.maxClassSize > 0 ? r.maxClassSize : 28);
      return Object.values(result).filter(id => id === r.id).length < cap;
    });

    if (room) {
      result[k] = room.id;
      assignedStudentKeys.add(k);
    } else {
      result[k] = ''; // 대기실 정원을 모두 더해도 자리가 없습니다. 미배치로 두고 알립니다.
    }
  }

  return result;
}

/**
 * Sanitizes any invalid room labels or orphaned cells in the placement grid.
 * 1. Extra rooms (별도시험실) must ALWAYS be labeled "대기 - N명" and never "대기1반 - N명".
 * 2. Exam cells with non-existent or 0-student subject-bans (e.g. legacy "한국사(1)-9반") are purged.
 */
export function sanitizePlacementGrid(
  placement: PlacementGrid,
  rooms: ExamRoom[],
  entries?: Map<SubjectBanKey, SubjectBanEntry>
): PlacementGrid {
  const extraRoomIds = new Set(rooms.filter(r => !r.banName || r.banName.trim() === '').map(r => r.id));
  let modified = false;
  const next: PlacementGrid = { ...placement };

  for (const [slotStr, row] of Object.entries(next)) {
    const slot = Number(slotStr);
    const newRow = { ...row };
    let rowModified = false;

    for (const [roomId, val] of Object.entries(newRow)) {
      if (!val) continue;

      if (isWaitCell(val)) {
        // 빈 대기실(0명)도 그대로 둡니다.
        // 담당자가 '대기실로 열어두고 한두 명을 손으로 옮기는' 쓰임새가 있어서,
        // 자동으로 지우면 방금 만든 대기실이 사라집니다.
        if (extraRoomIds.has(roomId)) {
          const properVal = `대기 - ${Math.max(0, parseWaitCount(val))}명`;
          if (val !== properVal) {
            newRow[roomId] = properVal;
            rowModified = true;
            modified = true;
          }
        }
      } else {
        // Exam cell: if entries map is provided, purge any non-existent or 0-count subject ban keys
        if (entries && entries.size > 0 && !entries.has(val)) {
          delete newRow[roomId];
          rowModified = true;
          modified = true;
        }
      }
    }

    if (rowModified) {
      next[slot] = newRow;
    }
  }

  return modified ? next : placement;
}

/**
 * Get the list of students assigned to a specific slot and room.
 * Supports slotStudentPlacements directly for real-time student tracking.
 */
export function getStudentListForSlotRoom(
  slotIndex: number,
  roomId: string,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  slotStudentPlacements?: Record<string, string>
): { title: string; students: { ban: string; num: number; name: string; subjects: string[] }[] } {
  const ps = placementSlots.find(s => s.index === slotIndex);
  const room = rooms.find(r => r.id === roomId);
  const cellVal = placement[slotIndex]?.[roomId] ?? '';
  if (!ps || !room) return { title: '', students: [] };

  const title = `${ps.title} — ${room.roomName} (${room.banName || '별도실'})`;

  // If slotStudentPlacements is provided, use it directly
  const placements = slotStudentPlacements || initSlotStudentPlacements(
    slotIndex,
    placement[slotIndex] ?? {},
    placementSlots,
    rooms,
    entries,
    students
  );

  const assignedStudents = students
    .filter(st => placements[`${st.ban}-${st.num}`] === roomId)
    .sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

  return {
    title: cellVal ? `${title}: ${cellVal}` : `${title} (${assignedStudents.length}명)`,
    students: assignedStudents,
  };
}

/**
 * 특정 교시(slotIndex)에서 대기실을 해당 과목(subject)의 새 고사장으로 전환(추가)합니다.
 * - 대기실 하나를 고사장으로 변경 (예: "고전과 윤리(4)-4반")
 * - 추가된 고사장은 학생을 0명으로 비워두어 수동 배치가 가능하도록 함
 * - 나머지 대기 인원은 남은 대기실들에 다시 균등 재배치
 */
export function addExamRoomFromWait(
  slotIndex: number,
  subject: string,
  targetRoomId: string | undefined,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  studentPlacements: Record<number, Record<string, string>>,
  lockedCellsRow?: Record<string, boolean>,
  chosenWaitRoomIds?: string[] | 'manual_empty',
  examDistributionMode: 'even' | 'fill_unplaced' | 'manual_empty' = 'even'
): {
  placement: PlacementGrid;
  studentPlacements: Record<number, Record<string, string>>;
  addedRoom: ExamRoom;
  newSubjectKey: string;
} {
  const newPlacement: PlacementGrid = JSON.parse(JSON.stringify(placement));
  const newStudentPlacements: Record<number, Record<string, string>> = JSON.parse(JSON.stringify(studentPlacements || {}));
  const slotRow = { ...(newPlacement[slotIndex] || {}) };
  let slotP = { ...(newStudentPlacements[slotIndex] || {}) };

  // 1. Find the target room: specified room OR first available wait room OR empty room
  let targetRoom: ExamRoom | undefined = undefined;
  if (targetRoomId) {
    targetRoom = rooms.find(r => r.id === targetRoomId && (!lockedCellsRow || !lockedCellsRow[r.id]));
  }
  if (!targetRoom) {
    targetRoom = rooms.find(r => {
      if (lockedCellsRow?.[r.id]) return false;
      const val = slotRow[r.id];
      return val && isWaitCell(val);
    });
  }
  if (!targetRoom) {
    targetRoom = rooms.find(r => {
      if (lockedCellsRow?.[r.id]) return false;
      const val = slotRow[r.id];
      return !val || val === '';
    });
  }

  if (!targetRoom) {
    throw new Error('전환할 수 있는 대기실이나 빈 고사실이 없습니다.');
  }

  // 2. Determine new subject key with incremented ban number
  const cleanSub = subject.includes('-') ? subject.split('-')[0] : subject;
  let maxBanNum = 0;
  for (const val of Object.values(slotRow)) {
    if (val && !isWaitCell(val) && val.startsWith(cleanSub)) {
      const match = val.match(/-(\d+)반/);
      if (match) {
        maxBanNum = Math.max(maxBanNum, parseInt(match[1], 10));
      }
    }
  }
  const newBanNum = maxBanNum > 0 ? maxBanNum + 1 : 1;
  const newSubjectKey = `${cleanSub}-${newBanNum}반`;
  slotRow[targetRoom.id] = newSubjectKey;

  // 3. Exam Students Placement based on examDistributionMode
  const examRoomsForSub = rooms.filter(r => {
    const val = (r.id === targetRoom.id ? newSubjectKey : slotRow[r.id]);
    return val && !isWaitCell(val) && val.startsWith(cleanSub);
  });

  const subStudents = students
    .filter(st => st.subjects.includes(cleanSub))
    .sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

  if (examDistributionMode === 'even') {
    // Clear students from targetRoom first
    for (const [stKey, rId] of Object.entries(slotP)) {
      if (rId === targetRoom.id) {
        delete slotP[stKey];
      }
    }
    // Remove non-locked assignments for this subject
    for (const [stKey, rId] of Object.entries(slotP)) {
      if (!lockedCellsRow?.[rId] && examRoomsForSub.some(r => r.id === rId)) {
        delete slotP[stKey];
      }
    }

    const activeRooms = examRoomsForSub.filter(r => !lockedCellsRow?.[r.id]);
    const studentsToPlace = subStudents.filter(st => !slotP[`${st.ban}-${st.num}`]);
    const numRooms = activeRooms.length;

    if (numRooms > 0 && studentsToPlace.length > 0) {
      const q = Math.floor(studentsToPlace.length / numRooms);
      const rem = studentsToPlace.length % numRooms;

      let studentIdx = 0;
      activeRooms.forEach((r, idx) => {
        const quota = q + (idx < rem ? 1 : 0);
        const cap = r.capacity && r.capacity > 0 ? r.capacity : (r.maxClassSize && r.maxClassSize > 0 ? r.maxClassSize : 28);
        const toTake = Math.min(quota, cap);
        for (let i = 0; i < toTake && studentIdx < studentsToPlace.length; i++) {
          const st = studentsToPlace[studentIdx++];
          slotP[`${st.ban}-${st.num}`] = r.id;
        }
      });

      // Any remaining students who couldn't fit due to capacities remain unplaced
      for (let i = studentIdx; i < studentsToPlace.length; i++) {
        delete slotP[`${studentsToPlace[i].ban}-${studentsToPlace[i].num}`];
      }
    }
  } else if (examDistributionMode === 'fill_unplaced') {
    // Clear target room
    for (const [stKey, rId] of Object.entries(slotP)) {
      if (rId === targetRoom.id) {
        delete slotP[stKey];
      }
    }
    // Other rooms respect capacity, excess becomes unplaced
    examRoomsForSub.filter(r => r.id !== targetRoom.id).forEach(r => {
      const cap = r.capacity && r.capacity > 0 ? r.capacity : (r.maxClassSize && r.maxClassSize > 0 ? r.maxClassSize : 28);
      const assigned = Object.entries(slotP).filter(([_, rId]) => rId === r.id);
      if (assigned.length > cap) {
        assigned.slice(cap).forEach(([stKey]) => {
          delete slotP[stKey];
        });
      }
    });
  } else {
    // manual_empty: target room has 0 students
    for (const [stKey, rId] of Object.entries(slotP)) {
      if (rId === targetRoom.id) {
        delete slotP[stKey];
      }
    }
  }

  // 4. Re-distribute wait students across remaining wait rooms
  const ps = placementSlots.find(s => s.index === slotIndex);
  if (ps) {
    const slotSubjects = ps.subjects;
    const remainingWaitRooms = rooms.filter(r => {
      if (lockedCellsRow?.[r.id]) return false;
      const val = slotRow[r.id];
      return !val || isWaitCell(val);
    });

    remainingWaitRooms.forEach(r => {
      delete slotRow[r.id];
    });

    const assignedExamStudentKeys = new Set<string>();
    for (const [stKey, rId] of Object.entries(slotP)) {
      const cellVal = slotRow[rId];
      if (cellVal && !isWaitCell(cellVal)) {
        assignedExamStudentKeys.add(stKey);
      }
    }

    const waitStudents = students.filter(st => {
      const k = `${st.ban}-${st.num}`;
      if (assignedExamStudentKeys.has(k)) return false;
      const isExamTaker = st.subjects.some(sub => slotSubjects.includes(sub));
      return !isExamTaker;
    }).sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

    // 기존 대기 학생 매핑 정리하여 미배정된 별도실/방에 유령 매핑이 남지 않도록 보장
    for (const [stKey] of Object.entries(slotP)) {
      if (!assignedExamStudentKeys.has(stKey)) {
        delete slotP[stKey];
      }
    }

    if (chosenWaitRoomIds === 'manual_empty') {
      // 관리자 수동 배치를 위해 대기실 자동 배정 건너뜀 (비워둠)
    } else {
      let targetRoomsToDistribute = remainingWaitRooms;
      if (Array.isArray(chosenWaitRoomIds) && chosenWaitRoomIds.length > 0) {
        targetRoomsToDistribute = remainingWaitRooms.filter(r => chosenWaitRoomIds.includes(r.id));
      }

      if (targetRoomsToDistribute.length > 0 && waitStudents.length > 0) {
        // 인원이 넘치면 자동으로 별도실 1칸(필요한 별도실)을 추가하여 대기 인원 재배치
        const currentTargetCap = targetRoomsToDistribute.reduce((sum, r) => sum + (r.capacity && r.capacity > 0 ? r.capacity : 28), 0);
        if (currentTargetCap < waitStudents.length) {
          let overflow = waitStudents.length - currentTargetCap;
          const availableExtra = remainingWaitRooms
            .filter(r => !targetRoomsToDistribute.some(tr => tr.id === r.id) && (isExtraRoom(r) || r.roomName.startsWith('별도')))
            .sort((a, b) => a.roomName.localeCompare(b.roomName, 'ko', { numeric: true }));

          for (const er of availableExtra) {
            if (overflow <= 0) break;
            targetRoomsToDistribute.push(er);
            const cap = er.capacity && er.capacity > 0 ? er.capacity : 28;
            overflow -= cap;
          }
        }

        // 정원만큼 균등 분배하고 남으면 미배치에 둠 (정원 초과 금지)
        const assignments = distributeWaitToRooms(waitStudents, targetRoomsToDistribute, students, false);
        assignments.forEach(a => {
          slotRow[a.room.id] = `대기 - ${a.count}명`;
          a.students.forEach(st => {
            slotP[`${st.ban}-${st.num}`] = a.room.id;
          });
        });
      }
    }
  }

  newPlacement[slotIndex] = slotRow;
  newStudentPlacements[slotIndex] = slotP;

  // 인원 및 수강생 무결성 항상 검증 (총원 초과 금지)
  assertSlotIntegrity(slotIndex, newPlacement, placementSlots, rooms, students, slotP);

  return {
    placement: newPlacement,
    studentPlacements: newStudentPlacements,
    addedRoom: targetRoom,
    newSubjectKey,
  };
}

/**
 * 특정 교시(slotIndex)에서 해당 과목(subject)의 고사장을 축소합니다.
 * - 대상 고사장에 배정된 학생들을 직전 고사장으로 합침 (수동배치 조정을 위해)
 * - 축소된 고사장은 대기실로 전환
 * - 대기 인원은 대기실들에 다시 균등 재배치
 */
export function shrinkExamRoomToWait(
  slotIndex: number,
  subject: string,
  targetRoomId: string | undefined,
  placement: PlacementGrid,
  placementSlots: PlacementSlot[],
  rooms: ExamRoom[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  students: Student[],
  studentPlacements: Record<number, Record<string, string>>,
  lockedCellsRow?: Record<string, boolean>,
  chosenWaitRoomIds?: string[] | 'manual_empty'
): {
  placement: PlacementGrid;
  studentPlacements: Record<number, Record<string, string>>;
  shrunkRoom: ExamRoom;
  mergedToRoom: ExamRoom | undefined;
} {
  const newPlacement: PlacementGrid = JSON.parse(JSON.stringify(placement));
  const newStudentPlacements: Record<number, Record<string, string>> = JSON.parse(JSON.stringify(studentPlacements || {}));
  const slotRow = { ...(newPlacement[slotIndex] || {}) };
  let slotP = { ...(newStudentPlacements[slotIndex] || {}) };

  const cleanSub = subject.includes('-') ? subject.split('-')[0] : subject;

  // 1. Find all exam rooms for this subject in current slot, sorted by ban number
  const examRoomsForSubject: { room: ExamRoom; banNum: number; key: string }[] = [];
  for (const r of rooms) {
    const val = slotRow[r.id];
    if (val && !isWaitCell(val) && val.startsWith(cleanSub)) {
      const match = val.match(/-(\d+)반/);
      const banNum = match ? parseInt(match[1], 10) : 1;
      examRoomsForSubject.push({ room: r, banNum, key: val });
    }
  }

  if (examRoomsForSubject.length <= 1) {
    throw new Error(`[${cleanSub}] 과목의 고사장이 1개뿐이므로 더 이상 축소할 수 없습니다.`);
  }

  examRoomsForSubject.sort((a, b) => a.banNum - b.banNum);

  // 2. Identify the room to shrink (targetRoomId if given, otherwise the one with highest ban number)
  let shrinkTargetIndex = examRoomsForSubject.length - 1;
  if (targetRoomId) {
    const foundIdx = examRoomsForSubject.findIndex(x => x.room.id === targetRoomId);
    if (foundIdx !== -1) shrinkTargetIndex = foundIdx;
  }

  const shrinkItem = examRoomsForSubject[shrinkTargetIndex];
  const mergeTargetItem = shrinkTargetIndex > 0
    ? examRoomsForSubject[shrinkTargetIndex - 1]
    : examRoomsForSubject[1];

  const shrunkRoom = shrinkItem.room;
  const mergedToRoom = mergeTargetItem?.room;

  // 3. Move all students in shrunkRoom into mergedToRoom
  if (mergedToRoom) {
    for (const [stKey, rId] of Object.entries(slotP)) {
      if (rId === shrunkRoom.id) {
        slotP[stKey] = mergedToRoom.id;
      }
    }
  }

  // 4. Turn shrunkRoom into an empty wait room
  delete slotRow[shrunkRoom.id];

  // 5. Re-distribute wait students across all available wait rooms (including newly freed shrunkRoom)
  const ps = placementSlots.find(s => s.index === slotIndex);
  if (ps) {
    const slotSubjects = ps.subjects;
    const waitRooms = rooms.filter(r => {
      if (lockedCellsRow?.[r.id]) return false;
      const val = slotRow[r.id];
      return !val || isWaitCell(val);
    });

    waitRooms.forEach(r => {
      delete slotRow[r.id];
    });

    const assignedExamStudentKeys = new Set<string>();
    for (const [stKey, rId] of Object.entries(slotP)) {
      const cellVal = slotRow[rId];
      if (cellVal && !isWaitCell(cellVal)) {
        assignedExamStudentKeys.add(stKey);
      }
    }

    const waitStudents = students.filter(st => {
      const k = `${st.ban}-${st.num}`;
      if (assignedExamStudentKeys.has(k)) return false;
      const isExamTaker = st.subjects.some(sub => slotSubjects.includes(sub));
      return !isExamTaker;
    }).sort((a, b) => {
      if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
      return a.num - b.num;
    });

    // 기존 대기 학생 매핑 정리하여 미배정된 별도실/방에 유령 매핑이 남지 않도록 보장
    for (const [stKey] of Object.entries(slotP)) {
      if (!assignedExamStudentKeys.has(stKey)) {
        delete slotP[stKey];
      }
    }

    if (chosenWaitRoomIds === 'manual_empty') {
      // 관리자 수동 배치를 위해 대기실 자동 배정 건너뜀 (비워둠)
    } else {
      let targetRoomsToDistribute = waitRooms;
      if (Array.isArray(chosenWaitRoomIds) && chosenWaitRoomIds.length > 0) {
        targetRoomsToDistribute = waitRooms.filter(r => chosenWaitRoomIds.includes(r.id));
      }

      if (targetRoomsToDistribute.length > 0 && waitStudents.length > 0) {
        // 정원만큼 균등 분배하고 남으면 미배치에 둠 (정원 초과 금지)
        const assignments = distributeWaitToRooms(waitStudents, targetRoomsToDistribute, students, false);
        assignments.forEach(a => {
          slotRow[a.room.id] = `대기 - ${a.count}명`;
          a.students.forEach(st => {
            slotP[`${st.ban}-${st.num}`] = a.room.id;
          });
        });
      }
    }
  }

  newPlacement[slotIndex] = slotRow;
  newStudentPlacements[slotIndex] = slotP;

  // 인원 및 수강생 무결성 항상 검증 (총원 초과 금지)
  assertSlotIntegrity(slotIndex, newPlacement, placementSlots, rooms, students, slotP);

  return {
    placement: newPlacement,
    studentPlacements: newStudentPlacements,
    shrunkRoom,
    mergedToRoom,
  };
}
