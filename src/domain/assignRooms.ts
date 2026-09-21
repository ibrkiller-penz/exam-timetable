/**
 * 분반을 고사실에 앉히는 규칙.
 *
 * 왜 필요한가.
 *   지금까지 '어느 분반이 어느 방에 들어가는가'를 다시 계산하는 곳이
 *   한 군데도 없었습니다. autoPlaceSlot 은 이미 놓인 시험 칸을 그대로
 *   보존하고(preservedSlot), 학생만 그 안에서 나눠 앉힙니다.
 *
 *   그래서 30명짜리 분반이 24석 방에 한 번 들어가면 영원히 거기 있습니다.
 *   '이 교시 재배치'를 몇 번 눌러도 달라지지 않습니다. 앉지 못한 학생은
 *   대기실로 밀려나고, 대기 인원이 실제 미응시보다 많아지고, 확정이
 *   막힙니다. 교시를 하나씩 손으로 고쳐도 다음 회차에 또 생깁니다.
 *
 *   그 빠진 층이 이 파일입니다. 분반 크기와 방 정원을 보고 짝을 짓습니다.
 *
 * 무엇을 하지 않는가.
 *   정원을 넘겨 억지로 앉히지 않습니다. 방에 책상이 24개면 24명입니다.
 *   안 되면 안 된다고 말하고, 무엇을 하면 되는지 같이 알려 줍니다.
 *   말없이 넘겨 앉히면 시험 당일에야 드러납니다.
 */

import {
  CellValue, ExamRoom, PlacementSlot, SubjectBanEntry, SubjectBanKey, Student, NeisRow, PlacementGrid,
  capacityForSlot, isWaitCell, CapacityBasis,
} from './types';
import { autoPlaceSlot, initSlotStudentPlacements, distributeWaitToRooms } from './autoPlace';

/** 앉힐 자리. 정원은 그 교시에 실제로 적용되는 값입니다. */
export interface SeatRoom {
  id: string;
  name: string;
  capacity: number;
}

/** 앉혀야 할 분반 하나. cell 은 표에 적히는 값(`확률과 통계(4)-1반`)입니다. */
export interface SeatBan {
  cell: string;
  size: number;
}

export interface RoomPlan {
  /** 시험 분반이 들어갈 방. roomId -> cell */
  exam: Record<string, string>;
  /** 남아서 대기로 쓸 방 */
  waitRoomIds: string[];
  /** 끝내 앉히지 못한 분반 */
  unseated: SeatBan[];
  /** 대기 자리가 몇 명분 모자란지. 0 이면 넉넉합니다. */
  waitShort: number;
  /** 시험 좌석이 몇 석 모자란지(과목별 합계). 0 이면 나눠 앉혀서라도 다 앉습니다. */
  seatShort: number;
  /** 사람이 읽을 설명. 안 될 때는 무엇을 하면 되는지 적습니다. */
  notes: string[];
  /** 이대로 두면 확정까지 갈 수 있는지 */
  ok: boolean;
  /** 지금 자리에서 옮겨야 하는 분반 수(적을수록 학생이 덜 움직입니다) */
  moves: number;
  /** 실제로 쓴 방식. 화면이 무엇으로 앉혔는지 알려 주려고 돌려줍니다. */
  mode: 'ban' | 'student_id';
  /**
   * 고사실 구성이 실제로 바뀌는 방 수.
   *
   * moves 는 칸 글자가 달라지면 셉니다. 학번순은 칸 이름을 '과목-N실'로
   * 바꿔 적으므로, 같은 방에 같은 과목이 그대로 있어도 moves 가 올라갑니다.
   * 그것 때문에 8단계에서 '7단계를 고쳐야 한다'는 안내가 괜히 떴습니다.
   * 이 값은 과목이 다른 방으로 옮겨가는 경우만 셉니다.
   */
  roomsChanged: number;
}

/**
 * 손대면 안 되는 방. 셋을 구별해야 합니다 — 실제 자료에 돌려 보고 알았습니다.
 *
 *   { exam }   잠근 시험 칸. 그 분반이 거기 고정입니다.
 *   'wait'     잠근 대기 칸. 시험에는 못 쓰지만 대기 자리로는 셉니다.
 *   'forbidden' 배치금지. 시험에도 대기에도 못 씁니다.
 *
 * 한 덩어리로 다루면 잠긴 대기 칸을 분반으로 잘못 읽어, 멀쩡한 교시를
 * 안 된다고 합니다.
 */
export type FixedRoom = { exam: string } | 'wait' | 'forbidden';

export interface RoomPlanInput {
  bans: SeatBan[];
  rooms: SeatRoom[];
  /** 이 교시에 시험을 보지 않는 학생 수. 대기 자리가 이만큼 필요합니다. */
  nonTakers: number;
  /** 지금 어느 방에 어느 분반이 있는지. 같은 자리면 그대로 두어 학생을 덜 움직입니다. */
  current?: Record<string, string>;
  fixed?: Record<string, FixedRoom>;
  /**
   * 이 방에 이 칸을 넣으면 몇 석인가. cell 이 null 이면 대기로 쓸 때입니다.
   *
   * 정원은 방만으로 정해지지 않습니다. 자기 반이 제 교실에 앉으면 학급 인원이
   * 기준이고, 남의 분반이 들어오면 좌석 수가 기준입니다(capacityForSlot).
   * 그래서 '방의 정원' 하나를 미리 재 두면 다른 분반을 옮겨 넣을 때 틀립니다.
   * 주지 않으면 rooms[].capacity 를 그대로 씁니다.
   */
  capacityFor?: (roomId: string, cell: string | null) => number;
  /** 칸에서 과목 이름을 꺼냅니다. 기본은 마지막 '-' 앞까지입니다. */
  subjectOf?: (cell: string) => string;
  /**
   * 어떻게 앉힐지.
   *   'ban'        분반을 통째로 한 방에. 편성현황과 명단이 그대로 맞습니다.
   *   'student_id' 분반을 보지 않고 학번 순서대로 고르게 나눕니다.
   *
   * 고사실을 분반 수보다 많이 열면 분반은 어차피 깨집니다. 그때는 'ban' 으로
   * 둘 수 없고 학번순이라야 인원이 고르게 나뉩니다. 기본은 'ban' 입니다.
   */
  mode?: 'ban' | 'student_id';
}

/**
 * 큰 분반부터 자리를 정합니다.
 *
 * 왜 큰 것부터인가. 작은 분반이 큰 방을 먼저 차지하면, 뒤에 오는 큰 분반이
 * 갈 곳을 잃습니다. 반대로 큰 것부터 넣으면, 어딘가에 앉힐 수 있는 배치가
 * 있는 한 이 순서로 반드시 찾아집니다(작은 분반이 들어가는 방은 큰 분반이
 * 들어가는 방보다 좁을 수 없으므로, 서로 바꿔치기해도 손해가 없습니다).
 */
function seat(
  bans: SeatBan[],
  rooms: SeatRoom[],
  preferCurrent: Record<string, string>,
  capOf: (roomId: string, cell: string) => number,
): {
  exam: Record<string, string>;
  unseated: SeatBan[];
} {
  const exam: Record<string, string> = {};
  const unseated: SeatBan[] = [];
  const used = new Set<string>();

  // 지금 이 분반이 앉아 있는 방(있다면)을 빨리 찾기 위한 표.
  const currentRoomOf = new Map<string, string>();
  for (const [roomId, cell] of Object.entries(preferCurrent)) currentRoomOf.set(cell, roomId);

  const bySizeDesc = [...bans].sort((a, b) => b.size - a.size);
  // 방 순서는 기본 좌석 수로 잡되, 들어가는지는 그 분반을 넣었을 때의 정원으로 봅니다.
  const bySeatAsc = [...rooms].sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id));

  for (const ban of bySizeDesc) {
    // 지금 자리가 그대로 되면 그대로 둡니다. 학생을 공연히 옮기지 않습니다.
    const here = currentRoomOf.get(ban.cell);
    if (here && !used.has(here)) {
      const room = rooms.find(r => r.id === here);
      if (room && capOf(room.id, ban.cell) >= ban.size) {
        exam[here] = ban.cell;
        used.add(here);
        continue;
      }
    }
    // 아니면 들어가는 방 중 가장 작은 곳에. 큰 방은 더 큰 분반과 대기에 남겨 둡니다.
    const room = bySeatAsc.find(r => !used.has(r.id) && capOf(r.id, ban.cell) >= ban.size);
    if (!room) { unseated.push(ban); continue; }
    exam[room.id] = ban.cell;
    used.add(room.id);
  }

  return { exam, unseated };
}

/**
 * 분반을 방에 앉히고, 안 되면 무엇이 모자란지 알려 줍니다.
 *
 * 두 단계입니다.
 *   ① 분반을 통째로 한 방에. 명단과 편성현황이 그대로 맞아 가장 좋습니다.
 *   ② 그게 안 되면 과목별 좌석 합계. 앱은 한 분반이 방에 다 안 들어가면
 *      남는 학생을 같은 과목의 다른 방으로 넘겨 앉힙니다(initSlotStudentPlacements 1C).
 *      그러니 그 과목에 준 방들의 정원을 다 더해 응시자 이상이면 됩니다.
 *      실제 자료에서 앱이 그렇게 앉힌 교시를 보고 알았습니다 — 분반을 통째로만
 *      보면 멀쩡한 교시를 안 된다고 하고, 될 교시에 책상을 더 넣으라고 합니다.
 */
/** 과목이 다른 방으로 옮겨가는 방의 수. 칸 이름만 바뀐 것은 세지 않습니다. */
function countRoomsChanged(
  exam: Record<string, string>,
  current: Record<string, string>,
  subjectOf: (cell: string) => string,
): number {
  const ids = new Set([...Object.keys(exam), ...Object.keys(current)]);
  let n = 0;
  for (const id of ids) {
    const before = current[id] ? subjectOf(current[id]) : '';
    const after = exam[id] ? subjectOf(exam[id]) : '';
    if (before !== after) n++;
  }
  return n;
}

export function planRooms(input: RoomPlanInput): RoomPlan {
  const fixed = input.fixed ?? {};
  const current = input.current ?? {};
  const notes: string[] = [];
  const capOf = (roomId: string, cell: string | null) =>
    input.capacityFor
      ? input.capacityFor(roomId, cell)
      : (input.rooms.find(r => r.id === roomId)?.capacity ?? 0);
  const subjectOf = input.subjectOf ?? ((cell: string) => cell.slice(0, Math.max(0, cell.lastIndexOf('-'))));
  const roomName = (id: string) => input.rooms.find(r => r.id === id)?.name ?? id;

  // 1. 손대면 안 되는 방과, 거기 이미 고정된 분반을 먼저 뺍니다.
  const exam: Record<string, string> = {};
  const lockedCells = new Set<string>();
  for (const [roomId, f] of Object.entries(fixed)) {
    if (typeof f === 'object' && f.exam) { exam[roomId] = f.exam; lockedCells.add(f.exam); }
  }
  const freeRooms = input.rooms.filter(r => !(r.id in fixed));
  // 0명 분반은 자리를 차지할 이유가 없습니다. 방만 하나 낭비합니다.
  const freeBans = input.bans.filter(b => !lockedCells.has(b.cell) && b.size > 0);

  // 2-A. 학번순이면 분반을 보지 않습니다. 과목마다 '들어갈 만큼'의 방을 큰 것부터
  //      잡고, 칸에는 '과목-N실'을 적습니다. 분반 이름이 아니므로 앱이 학번순으로
  //      고르게 나눠 앉힙니다(getSlotPlacementStrategy).
  if (input.mode === 'student_id') {
    const bySubject = new Map<string, SeatBan[]>();
    for (const b of freeBans) {
      const k = subjectOf(b.cell);
      bySubject.set(k, [...(bySubject.get(k) ?? []), b]);
    }
    /*
     * 사람이 많은 과목부터 방을 고릅니다.
     *
     * 들어온 차례대로 나눠 주면 5명짜리 과목이 40석을 먼저 차지하고,
     * 38명짜리가 10석만 받아 28석이 모자랐습니다. 같은 입력인데 과목
     * 순서만 바뀌어도 되고 안 되고가 갈렸습니다.
     */
    const subjectsByNeed = [...bySubject.entries()]
      .sort((a, b) => b[1].reduce((x, y) => x + y.size, 0) - a[1].reduce((x, y) => x + y.size, 0));
    let shortAll = 0;
    const pool = freeRooms.filter(r => !(r.id in exam)).sort((a, b) => capOf(b.id, null) - capOf(a.id, null) || a.id.localeCompare(b.id));
    let next = 0;
    for (const [subject, bans] of subjectsByNeed) {
      const need = bans.reduce((a, b) => a + b.size, 0);
      /*
       * 지금 이 과목에 열어 둔 실 수를 존중합니다.
       *
       * 담당자가 실을 하나 더 열었다면 인원을 더 나누려는 뜻입니다. '들어갈
       * 만큼만' 쓰면 늘린 실이 놀고 아무것도 달라지지 않습니다. 열어 둔 만큼
       * 쓰되, 그래도 모자라면 더 가져옵니다.
       */
      const openNow = Object.values(current).filter(c => subjectOf(c) === subject).length;
      const picked: SeatRoom[] = [];
      let have = 0;
      while ((have < need || picked.length < openNow) && next < pool.length) {
        const r = pool[next++];
        picked.push(r);
        have += capOf(r.id, `${subject}-1실`);
      }
      picked.forEach((r, i) => { exam[r.id] = `${subject}-${i + 1}실`; });
      if (have >= need) {
        notes.push(
          `[${subject}] 학번순으로 ${picked.length}실에 고르게 앉힙니다 ` +
          `(응시 ${need}명 / 좌석 ${have}석, 실당 ${Math.ceil(need / Math.max(1, picked.length))}명 안팎). 분반은 섞입니다.`
        );
      } else {
        shortAll += need - have;
        notes.push(
          `[${subject}] 시험 좌석이 ${need - have}석 모자랍니다 (쓸 수 있는 방 ${picked.length}곳 ${have}석 / 응시 ${need}명). ` +
          `이 교시에 고사실을 더 열거나 정원을 올려야 합니다.`
        );
      }
    }
    const waitIds = input.rooms.filter(r => !(r.id in exam) && fixed[r.id] !== 'forbidden').map(r => r.id);
    const waitCap = waitIds.reduce((a, id) => a + capOf(id, null), 0);
    const wShort = Math.max(0, input.nonTakers - waitCap);
    if (wShort > 0) notes.push(`대기 자리가 ${wShort}명분 모자랍니다. (미응시 ${input.nonTakers}명 / 남은 방 ${waitCap}석)`);
    let mv = 0;
    for (const [rid, cell] of Object.entries(exam)) if (current[rid] !== cell) mv++;
    return {
      exam, waitRoomIds: waitIds, unseated: [], waitShort: wShort, seatShort: shortAll,
      notes, ok: shortAll === 0 && wShort === 0, moves: mv,
      roomsChanged: countRoomsChanged(exam, current, subjectOf), mode: 'student_id',
    };
  }

  /*
   * 옮기면 실제로 나아질 때만 옮깁니다.
   *
   * '방마다 딱 들어가는가'로만 재면 이득 없는 이동을 권하게 됩니다. 29명
   * 분반이 28석 방에 있을 때, 방을 넷이나 바꿔 봐야 가장 큰 방이 28석이라
   * 한 명은 여전히 넘칩니다. 결과가 같은데 학생만 움직이는 셈입니다.
   *
   * 그래서 '넘치는 인원'으로 견줍니다. 지금 배치와 새로 짠 배치를 각각
   * 재서, 새것이 더 낫지 않으면 지금 것을 그대로 둡니다. 28명이 25석에,
   * 25명이 30석에 있는 어긋난 배치는 바꾸면 3명 → 0명이 되므로 옮기고,
   * 위의 29명 경우는 1명 → 1명이라 그대로 둡니다.
   */
  const spillOf = (assign: Record<string, string>) => {
    const roomOf = new Map<string, string>();
    for (const [rid, cell] of Object.entries(assign)) roomOf.set(cell, rid);
    let n = 0;
    for (const b of freeBans) {
      const rid = roomOf.get(b.cell);
      if (!rid) { n += b.size; continue; } // 자리를 못 받으면 통째로 비용입니다.
      n += Math.max(0, b.size - capOf(rid, b.cell));
    }
    return n;
  };

  /** 지금 배치가 쓸 만한 모양인지(분반마다 방 하나, 방마다 분반 하나). */
  const currentAssign = (() => {
    const out: Record<string, string> = {};
    const seenCell = new Set<string>();
    for (const [rid, cell] of Object.entries(current)) {
      if (rid in fixed || !freeRooms.some(r => r.id === rid)) continue;
      if (seenCell.has(cell) || out[rid]) return null; // 한 분반이 두 방에, 또는 한 방에 두 분반
      seenCell.add(cell);
      out[rid] = cell;
    }
    return freeBans.every(b => seenCell.has(b.cell)) ? out : null;
  })();

  // ① 통째로 앉히기. 지금 자리를 살리는 쪽을 먼저 보되,
  //    그래서 못 앉는 분반이 생기면 크기 순서만으로 다시 짭니다.
  let got = seat(freeBans, freeRooms, current, capOf);
  if (got.unseated.length > 0) {
    const strict = seat(freeBans, freeRooms, {}, capOf);
    if (strict.unseated.length < got.unseated.length) got = strict;
  }
  // 새로 짠 것이 더 낫지 않으면 지금 자리를 그대로 둡니다.
  if (currentAssign && got.unseated.length === 0 && spillOf(currentAssign) <= spillOf(got.exam)) {
    got = { exam: currentAssign, unseated: [] };
  }
  Object.assign(exam, got.exam);

  // 3. ② 통째로 안 되는 과목은 좌석 합계로 봅니다.
  //    그 과목의 분반을 전부 풀어, 남은 방 가운데 큰 순서로 다시 잡습니다.
  let seatShort = 0;
  const stillUnseated: SeatBan[] = [];
  const subjectsShort = new Set(got.unseated.map(b => subjectOf(b.cell)));
  for (const subject of subjectsShort) {
    const bansS = freeBans.filter(b => subjectOf(b.cell) === subject).sort((a, b) => b.size - a.size);
    for (const [rid, cell] of Object.entries(exam)) if (bansS.some(b => b.cell === cell)) delete exam[rid];

    // 방마다 '이 과목 분반을 넣었을 때' 최대 정원으로 줄 세웁니다(자기 반이면 학급 인원 기준이 됩니다).
    const pool = freeRooms
      .filter(r => !(r.id in exam))
      .map(r => ({ r, cap: Math.max(...bansS.map(b => capOf(r.id, b.cell))) }))
      .sort((a, b) => b.cap - a.cap || a.r.id.localeCompare(b.r.id))
      .slice(0, bansS.length);

    const need = bansS.reduce((a, b) => a + b.size, 0);
    let have = 0;
    bansS.forEach((ban, i) => {
      const slot = pool[i];
      if (!slot) { stillUnseated.push(ban); return; }
      exam[slot.r.id] = ban.cell;
      have += capOf(slot.r.id, ban.cell);
    });
    if (pool.length < bansS.length) continue; // 방 수 자체가 모자란 경우는 아래에서 따로 말합니다.

    if (have >= need) {
      const split = bansS
        .map((ban, i) => ({ ban, room: pool[i].r, over: ban.size - capOf(pool[i].r.id, ban.cell) }))
        .filter(x => x.over > 0);
      notes.push(
        `[${subject}] 분반을 통째로는 못 앉히지만 나눠 앉히면 됩니다 (좌석 ${have}석 / 응시 ${need}명). ` +
        split.map(x => `${x.ban.cell}은 ${roomName(x.room.id)}에 ${x.over}명이 넘쳐 같은 과목 다른 방으로 갑니다`).join(', ') + '.'
      );
    } else {
      seatShort += need - have;
      const spare = freeRooms.filter(r => !(r.id in exam)).length;
      notes.push(
        `[${subject}] 시험 좌석이 ${need - have}석 모자랍니다 (가장 큰 방 ${bansS.length}곳을 써도 ${have}석 / 응시 ${need}명). ` +
        (spare > 0
          ? `분반을 통째로 앉히면 방 ${bansS.length}곳만 쓰므로 남는 ${spare}실이 놀고 있습니다. ` +
            `'학번순'으로 다시 앉히면 ${bansS.length + spare}실에 고르게 나눠 앉힐 수 있습니다.`
          : `이 교시에 고사실을 더 열거나 정원을 올려야 합니다.`)
      );
    }
  }

  // 4. 남은 방이 대기실입니다. 배치금지만 빼고, 잠근 대기 칸은 그대로 셉니다.
  const waitRoomIds = input.rooms
    .filter(r => !(r.id in exam) && fixed[r.id] !== 'forbidden')
    .map(r => r.id);
  const waitSeats = waitRoomIds.reduce((a, id) => a + capOf(id, null), 0);
  const waitShort = Math.max(0, input.nonTakers - waitSeats);

  // 5. 설명.
  let moves = 0;
  for (const [roomId, cell] of Object.entries(exam)) if (current[roomId] !== cell) moves++;
  const roomsChanged = countRoomsChanged(exam, current, subjectOf);

  for (const ban of stillUnseated) {
    notes.push(`[${ban.cell}] ${ban.size}명을 앉힐 방이 남아 있지 않습니다. 이 교시에 쓸 고사실을 더 열어야 합니다.`);
  }
  if (waitShort > 0) {
    notes.push(`대기 자리가 ${waitShort}명분 모자랍니다. (미응시 ${input.nonTakers}명 / 남은 방 ${waitSeats}석)`);
  }
  const ok = stillUnseated.length === 0 && seatShort === 0 && waitShort === 0;
  if (ok && subjectsShort.size > 0) {
    notes.push(
      `분반을 통째로 앉혔습니다. 인원을 실마다 더 고르게 나누려면 '학번순'으로 다시 앉히면 됩니다 ` +
      `(그 대신 분반이 섞입니다).`
    );
  }
  if (ok && subjectsShort.size === 0) {
    const moved = Object.entries(exam).filter(([rid, cell]) => current[rid] !== cell);
    notes.push(
      moved.length === 0
        ? '지금 자리 그대로 모두 앉습니다. 바꿀 것이 없습니다.'
        : `분반 ${moved.length}개를 옮기면 모두 앉습니다: ` +
          moved.map(([rid, cell]) => `${cell} → ${roomName(rid)}`).join(', ')
    );
  }

  return { exam, waitRoomIds, unseated: stillUnseated, waitShort, seatShort, notes, ok, moves, roomsChanged, mode: 'ban' };
}

/**
 * 앱의 자료를 규칙에 넣을 모양으로 바꿔 주는 어댑터.
 *
 * 화면에서 두 군데가 이 규칙을 씁니다 — '이 교시 재배치'와 '고사실 점검'.
 * 양쪽이 각자 자료를 주무르면 곧 서로 달라지므로, 여기 한 곳에서만 합니다.
 *
 * 돌려주는 nextRow 는 시험 칸만 정해 둔 줄입니다. 대기 칸은 비워 두고
 * autoPlaceSlot 이 채웁니다. 잠근 칸과 배치금지는 그대로 둡니다.
 */
export function planSlotRooms(args: {
  ps: PlacementSlot;
  row: Record<string, CellValue>;
  rooms: ExamRoom[];
  entries: Map<SubjectBanKey, SubjectBanEntry>;
  slotRoomCapacity?: Record<number, Record<string, number>>;
  slotCapacityBasis?: CapacityBasis;
  lockedRow?: Record<string, boolean>;
  mode?: 'ban' | 'student_id';
}): { plan: RoomPlan; nextRow: Record<string, CellValue> } {
  const { ps, row, rooms, entries, lockedRow } = args;

  // 이 교시에 시험 보는 과목의 분반을 모두 모읍니다. 표에 아직 안 놓인 분반도 포함합니다.
  const bans: SeatBan[] = [...entries.values()]
    .filter(e => ps.subjects.includes(e.subject))
    .map(e => ({ cell: e.key, size: e.stuCount }));

  const usable = rooms.filter(r => r.roomName !== '' && r.roomName !== '0');
  const seatRooms: SeatRoom[] = usable.map(r => ({
    id: r.id,
    name: r.roomName,
    capacity: capacityForSlot(r, ps.index, args.slotRoomCapacity, ps, row[r.id] || '', args.slotCapacityBasis),
  }));

  const current: Record<string, string> = {};
  const fixed: Record<string, FixedRoom> = {};
  for (const r of usable) {
    const v = row[r.id];
    if (v === '배치금지') { fixed[r.id] = 'forbidden'; continue; }
    if (v && !isWaitCell(v)) current[r.id] = v;
  }
  for (const [roomId, on] of Object.entries(lockedRow ?? {})) {
    if (!on) continue;
    const v = row[roomId];
    fixed[roomId] = v === '배치금지' ? 'forbidden'
      : (v && !isWaitCell(v)) ? { exam: v }
      : 'wait';
  }

  const byId = new Map(usable.map(r => [r.id, r]));
  const capacityFor = (roomId: string, cell: string | null) => {
    const r = byId.get(roomId);
    if (!r) return 0;
    return capacityForSlot(r, ps.index, args.slotRoomCapacity, ps, cell ?? '대기', args.slotCapacityBasis);
  };

  const plan = planRooms({ bans, rooms: seatRooms, nonTakers: ps.nonTakers, current, fixed, capacityFor, mode: args.mode });

  const nextRow: Record<string, CellValue> = {};
  for (const r of usable) {
    if (fixed[r.id] === 'forbidden') { nextRow[r.id] = '배치금지'; continue; }
    if (lockedRow?.[r.id]) { if (row[r.id]) nextRow[r.id] = row[r.id]; continue; }
    if (plan.exam[r.id]) nextRow[r.id] = plan.exam[r.id];
    // 나머지는 비워 둡니다. 대기 칸은 autoPlaceSlot 이 인원을 세어 채웁니다.
  }

  // 끝내 못 앉힌 분반은 있던 자리에 그대로 둡니다. 칸을 지워 버리면 표에서
  // 그 분반이 사라져, 정원 초과가 눈에 보이던 것이 도리어 안 보이게 됩니다.
  for (const ban of plan.unseated) {
    const here = Object.entries(current).find(([, cell]) => cell === ban.cell)?.[0];
    if (here && !nextRow[here]) nextRow[here] = ban.cell;
  }

  return { plan, nextRow };
}

/**
 * 정원을 넘긴 시험실의 학생을 같은 과목의 다른 시험실로 넘깁니다.
 *
 * initSlotStudentPlacements 는 분반 위주(ban) 전략에서 분반을 통째로 그 방에
 * 앉히고 정원을 보지 않습니다. 30명 분반이 28석 방에 그대로 들어가고, 확정에서
 * '정원 초과'로 막힙니다. 넘친 학생을 다른 방으로 보내는 1C 단계는 학번순
 * 전략에서만 지나가므로 여기서는 닿지 않습니다.
 *
 * 그래서 앉힌 뒤에 한 번 더 봅니다. 넘친 방의 뒷번호 학생부터, 같은 과목 칸이
 * 있고 자리가 남은 방으로 옮깁니다. 계획이 좌석 합계로 '된다'고 한 교시는
 * 반드시 받아 줄 방이 있습니다. 잠근 방은 빼지도 넣지도 않습니다.
 */
export function spillOverCapacity(args: {
  row: Record<string, CellValue>;
  placements: Record<string, string>;
  rooms: ExamRoom[];
  students: Student[];
  entries: Map<SubjectBanKey, SubjectBanEntry>;
  capacityOf: (room: ExamRoom, cell: CellValue) => number;
  lockedRow?: Record<string, boolean>;
}): { placements: Record<string, string>; moved: { key: string; from: string; to: string }[] } {
  const { row, rooms, students, entries, capacityOf, lockedRow } = args;
  const placements = { ...args.placements };
  const moved: { key: string; from: string; to: string }[] = [];

  const subjectOfCell = (cell: CellValue) => entries.get(cell)?.subject ?? cell.slice(0, Math.max(0, cell.lastIndexOf('-')));
  const examRooms = rooms.filter(r => { const v = row[r.id]; return v && !isWaitCell(v) && v !== '배치금지'; });
  const seatedIn = (rid: string) => Object.entries(placements).filter(([, r]) => r === rid).map(([k]) => k);
  const keyOf = (st: Student) => `${st.ban}-${st.num}`;
  const order = new Map(students.map((st, i) => [keyOf(st), i]));

  for (const from of examRooms) {
    if (lockedRow?.[from.id]) continue;
    const cap = capacityOf(from, row[from.id]);
    const here = seatedIn(from.id).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    if (here.length <= cap) continue;
    const subject = subjectOfCell(row[from.id]);
    const excess = here.slice(cap); // 뒷번호부터 넘깁니다. 앞번호는 원래 방에 남습니다.

    for (const key of excess) {
      const to = examRooms.find(r =>
        r.id !== from.id &&
        !lockedRow?.[r.id] &&
        subjectOfCell(row[r.id]) === subject &&
        seatedIn(r.id).length < capacityOf(r, row[r.id])
      );
      if (!to) break; // 받아 줄 방이 없으면 그대로 둡니다. 확정이 정원 초과로 잡아 줍니다.
      placements[key] = to.id;
      moved.push({ key, from: from.id, to: to.id });
    }
  }
  return { placements, moved };
}

/**
 * 계획대로 방을 잡고 학생까지 앉힙니다. '이 교시 재배치'가 이것을 씁니다.
 *
 * resetAndAutoPlaceSlot 을 쓰면 안 됩니다. 그 함수는 잠기지 않은 칸을 전부
 * 지우고 autoPlaceSlot 에 맡기는데, autoPlaceSlot 의 방 고르기(minMove)는
 * 정원을 보지 않고 '자기 반 교실'을 고릅니다. 30명 분반이 24석 방에 들어간
 * 까닭입니다. 계획을 넘겨도 첫 줄에서 지워져 아무 효과가 없었습니다.
 *
 * 여기서는 시험 칸을 먼저 심어 두고 autoPlaceSlot 을 부릅니다. autoPlaceSlot 은
 * 이미 놓인 시험 칸을 보존하고 대기 칸만 채우므로 계획이 그대로 살아남습니다.
 */
export function replanAndPlaceSlot(args: {
  ps: PlacementSlot;
  placement: PlacementGrid;
  rooms: ExamRoom[];
  entries: Map<SubjectBanKey, SubjectBanEntry>;
  students: Student[];
  neis?: NeisRow[];
  slotRoomCapacity?: Record<number, Record<string, number>>;
  slotCapacityBasis?: CapacityBasis;
  lockedRow?: Record<string, boolean>;
  roomIdSelected?: string;
  mode?: 'ban' | 'student_id';
  /**
   * 고사실은 그대로 두고 학생만 다시 나눕니다(8. 학생 배치).
   * 7단계가 확정된 뒤에는 고사실 구성을 바꿀 수 없으므로 이 쪽을 씁니다.
   */
  keepRooms?: boolean;
}): { plan: RoomPlan; placement: PlacementGrid; slotStudentPlacements: Record<string, string> } {
  const { ps, rooms, entries, students, neis, lockedRow } = args;
  const i = ps.index;
  const { plan, nextRow } = planSlotRooms({
    ps, row: args.placement[i] || {}, rooms, entries,
    slotRoomCapacity: args.slotRoomCapacity, slotCapacityBasis: args.slotCapacityBasis, lockedRow,
    mode: args.mode,
  });

  const seeded: PlacementGrid = JSON.parse(JSON.stringify(args.placement));
  // 고사실을 그대로 둘 때는 지금 줄을 씁니다. 계획은 안내에만 쓰입니다.
  seeded[i] = args.keepRooms ? (args.placement[i] ?? {}) : nextRow;

  /*
   * 학번순일 때는 autoPlaceSlot 에 맡기지 않습니다.
   *
   * autoPlaceSlot 은 빈 방을 보면 분반 칸(panelItems 의 ban 항목)을 도로 채워
   * 넣습니다. 그래서 '과목-N실' 세 칸만 두었는데 옆 빈 방에 '과목-N반' 칸이
   * 세 개 더 생기고, 91명이 3실이 아니라 6실로 흩어졌습니다. 실제로 재어 보고
   * 알았습니다.
   *
   * 여기서는 시험 칸을 그대로 두고, 남은 방에 대기만 직접 나눕니다.
   */
  const placed: PlacementGrid = JSON.parse(JSON.stringify(seeded));
  if (plan.mode === 'student_id') {
    const nonTakers = students.filter(st => !st.subjects.some(sub => ps.subjects.includes(sub)));
    const waitRooms = rooms.filter(r =>
      r.roomName !== '' && r.roomName !== '0' &&
      !nextRow[r.id] && !lockedRow?.[r.id] && args.placement[i]?.[r.id] !== '배치금지'
    );
    for (const a of distributeWaitToRooms(nonTakers, waitRooms, students)) {
      if (a.count > 0) placed[i][a.room.id] = `대기 - ${a.count}명`;
    }
  } else if (!args.keepRooms) {
    Object.assign(placed, autoPlaceSlot(i, args.roomIdSelected ?? rooms[0]?.id ?? '', seeded, [ps], rooms, entries, students, false, lockedRow));
  }
  const seatedRaw = initSlotStudentPlacements(
    i, placed[i] ?? {}, [ps], rooms, entries, students, neis, undefined, lockedRow, plan.mode,
  );

  // 분반 위주 배치는 정원을 넘겨 앉히므로, 넘친 학생을 같은 과목 방으로 넘깁니다.
  const { placements: slotStudentPlacements } = spillOverCapacity({
    row: placed[i] ?? {}, placements: seatedRaw, rooms, students, entries, lockedRow,
    capacityOf: (r, cell) => capacityForSlot(r, i, args.slotRoomCapacity, ps, cell, args.slotCapacityBasis),
  });
  return { plan, placement: placed, slotStudentPlacements };
}

/** 미리보기 한 줄. 어느 방에 무엇이 몇 명 앉는지. */
export interface SeatingRow {
  roomId: string;
  room: string;
  cell: CellValue;
  seated: number;
  capacity: number;
  over: number;
  wait: boolean;
}

/**
 * 배치 결과를 방별로 한 줄씩 정리합니다.
 *
 * 누르기 전에 무엇이 달라지는지 보여 주려고 만들었습니다. '재배치 하니
 * 이상하다'는 말이 나오는 까닭은 대개 누른 뒤에야 결과를 보기 때문입니다.
 */
export function summarizeSeating(args: {
  ps: PlacementSlot;
  row: Record<string, CellValue>;
  placements: Record<string, string>;
  rooms: ExamRoom[];
  students: Student[];
  slotRoomCapacity?: Record<number, Record<string, number>>;
  slotCapacityBasis?: CapacityBasis;
}): { rows: SeatingRow[]; unplaced: number; overTotal: number } {
  const { ps, row, placements, rooms, students } = args;
  const rows: SeatingRow[] = [];
  let overTotal = 0;

  for (const r of rooms) {
    const cell = row[r.id];
    if (!cell || cell === '배치금지') continue;
    const seated = students.filter(st => placements[`${st.ban}-${st.num}`] === r.id).length;
    const capacity = capacityForSlot(r, ps.index, args.slotRoomCapacity, ps, cell, args.slotCapacityBasis);
    const over = Math.max(0, seated - capacity);
    overTotal += over;
    rows.push({ roomId: r.id, room: r.roomName, cell, seated, capacity, over, wait: isWaitCell(cell) });
  }

  const unplaced = students.filter(st => {
    const rid = placements[`${st.ban}-${st.num}`];
    return !rid || !row[rid] || row[rid] === '배치금지';
  }).length;

  // 시험 칸을 먼저, 그 다음 대기. 같은 갈래에서는 고사실 이름 순서대로.
  rows.sort((a, b) => (a.wait === b.wait ? a.room.localeCompare(b.room, 'ko') : a.wait ? 1 : -1));
  return { rows, unplaced, overTotal };
}
