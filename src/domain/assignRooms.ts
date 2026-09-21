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
  /** 사람이 읽을 설명. 안 될 때는 무엇을 하면 되는지 적습니다. */
  notes: string[];
  /** 이대로 두면 확정까지 갈 수 있는지 */
  ok: boolean;
  /** 지금 자리에서 옮겨야 하는 분반 수(적을수록 학생이 덜 움직입니다) */
  moves: number;
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
}

/**
 * 큰 분반부터 자리를 정합니다.
 *
 * 왜 큰 것부터인가. 작은 분반이 큰 방을 먼저 차지하면, 뒤에 오는 큰 분반이
 * 갈 곳을 잃습니다. 반대로 큰 것부터 넣으면, 어딘가에 앉힐 수 있는 배치가
 * 있는 한 이 순서로 반드시 찾아집니다(작은 분반이 들어가는 방은 큰 분반이
 * 들어가는 방보다 좁을 수 없으므로, 서로 바꿔치기해도 손해가 없습니다).
 */
function seat(bans: SeatBan[], rooms: SeatRoom[], preferCurrent: Record<string, string>): {
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
  const bySeatAsc = [...rooms].sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id));

  for (const ban of bySizeDesc) {
    // 지금 자리가 그대로 되면 그대로 둡니다. 학생을 공연히 옮기지 않습니다.
    const here = currentRoomOf.get(ban.cell);
    if (here && !used.has(here)) {
      const room = rooms.find(r => r.id === here);
      if (room && room.capacity >= ban.size) {
        exam[here] = ban.cell;
        used.add(here);
        continue;
      }
    }
    // 아니면 들어가는 방 중 가장 작은 곳에. 큰 방은 더 큰 분반과 대기에 남겨 둡니다.
    const room = bySeatAsc.find(r => !used.has(r.id) && r.capacity >= ban.size);
    if (!room) { unseated.push(ban); continue; }
    exam[room.id] = ban.cell;
    used.add(room.id);
  }

  return { exam, unseated };
}

/** 분반을 방에 앉히고, 안 되면 무엇이 모자란지 알려 줍니다. */
export function planRooms(input: RoomPlanInput): RoomPlan {
  const fixed = input.fixed ?? {};
  const current = input.current ?? {};
  const notes: string[] = [];

  // 1. 손대면 안 되는 방과, 거기 이미 고정된 분반을 먼저 뺍니다.
  const exam: Record<string, string> = {};
  const lockedCells = new Set<string>();
  for (const [roomId, f] of Object.entries(fixed)) {
    if (typeof f === 'object' && f.exam) { exam[roomId] = f.exam; lockedCells.add(f.exam); }
  }
  const freeRooms = input.rooms.filter(r => !(r.id in fixed));
  const freeBans = input.bans.filter(b => !lockedCells.has(b.cell));

  // 2. 자리를 정합니다. 지금 자리를 살리는 쪽을 먼저 보되,
  //    그래서 못 앉는 분반이 생기면 크기 순서만으로 다시 짭니다.
  let got = seat(freeBans, freeRooms, current);
  if (got.unseated.length > 0) {
    const strict = seat(freeBans, freeRooms, {});
    if (strict.unseated.length < got.unseated.length) {
      got = strict;
      notes.push('지금 자리를 살리면 앉지 못하는 분반이 생겨, 자리를 새로 짰습니다.');
    }
  }
  Object.assign(exam, got.exam);

  // 3. 남은 방이 대기실입니다. 배치금지만 빼고, 잠근 대기 칸은 그대로 셉니다.
  const waitRoomIds = input.rooms
    .filter(r => !(r.id in exam) && fixed[r.id] !== 'forbidden')
    .map(r => r.id);
  const waitSeats = waitRoomIds.reduce((a, id) => a + (input.rooms.find(r => r.id === id)?.capacity ?? 0), 0);
  const waitShort = Math.max(0, input.nonTakers - waitSeats);

  // 4. 안 되는 곳은 무엇을 하면 되는지 적습니다.
  const roomName = (id: string) => input.rooms.find(r => r.id === id)?.name ?? id;
  let moves = 0;
  for (const [roomId, cell] of Object.entries(exam)) if (current[roomId] !== cell) moves++;

  for (const ban of got.unseated) {
    const biggest = [...freeRooms]
      .filter(r => !(r.id in exam))
      .sort((a, b) => b.capacity - a.capacity)[0];
    if (biggest) {
      notes.push(
        `[${ban.cell}] ${ban.size}명이 들어갈 방이 없습니다. ` +
        `남은 방 중 가장 큰 곳은 ${biggest.name}(${biggest.capacity}석)이라 ${ban.size - biggest.capacity}석 모자랍니다. ` +
        `그 방 정원을 ${ban.size}석으로 올리거나, 더 큰 방을 이 교시에 열어야 합니다.`
      );
    } else {
      notes.push(`[${ban.cell}] ${ban.size}명을 앉힐 방이 남아 있지 않습니다. 이 교시에 쓸 고사실을 더 열어야 합니다.`);
    }
  }
  if (waitShort > 0) {
    notes.push(`대기 자리가 ${waitShort}명분 모자랍니다. (미응시 ${input.nonTakers}명 / 남은 방 ${waitSeats}석)`);
  }
  if (got.unseated.length === 0 && waitShort === 0) {
    const moved = Object.entries(exam).filter(([rid, cell]) => current[rid] !== cell);
    notes.push(
      moved.length === 0
        ? '지금 자리 그대로 모두 앉습니다. 바꿀 것이 없습니다.'
        : `분반 ${moved.length}개를 옮기면 모두 앉습니다: ` +
          moved.map(([rid, cell]) => `${cell} → ${roomName(rid)}`).join(', ')
    );
  }

  return {
    exam,
    waitRoomIds,
    unseated: got.unseated,
    waitShort,
    notes,
    ok: got.unseated.length === 0 && waitShort === 0,
    moves,
  };
}
