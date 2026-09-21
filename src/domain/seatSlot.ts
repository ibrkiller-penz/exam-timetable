/**
 * 한 교시를 백지에서 통째로 짭니다 — 어느 방을 쓸지, 누가 어디 앉을지.
 *
 * 왜 하나로 짜나.
 *   예전에는 둘로 나뉘어 있었습니다. 7. 고사장 배치가 분반을 방에 넣고,
 *   8. 학생 배치가 그 안에서 학생을 나눴습니다. 그런데 방을 고르는 쪽이
 *   정원을 보지 않아, 30명 분반이 24석 방에 들어가고 뒤에서 학생이 넘쳤습니다.
 *   넘친 것을 뒤늦게 옮기는 뒷수습이 붙고, 그 뒷수습이 또 막히고, 결국
 *   사람이 손으로 맞춰야 했습니다.
 *
 *   방을 고르는 일과 학생을 앉히는 일은 같은 문제입니다. 한 번에 풉니다.
 *
 * 정원을 넘기는 일에 대하여.
 *   자리가 모자라면 넘깁니다. 안 넘기고 미배치로 두면 그 학생을 담당자가
 *   손으로 앉혀야 합니다. 자동배치의 목적은 손댈 일을 없애는 것이 아니라
 *   줄이는 것이므로, 아무도 자리를 잃지 않게 하고 대신 **넘기는 인원을
 *   가장 적게, 그리고 여러 방에 고르게** 흩습니다. 한 방에 몰아 넣으면
 *   그 방만 의자를 여섯 개 더 놓아야 하지만, 세 방에 두 개씩이면 훨씬 낫습니다.
 *
 * 무엇을 지키나 (앞에 있을수록 먼저).
 *   1. 아무도 자리를 잃지 않는다.
 *   2. 정원 초과를 가장 적게, 고르게.
 *   3. 분반을 통째로 한 방에 — 명단과 편성현황이 그대로 맞습니다.
 *   4. 제 반 교실에 — 학생이 덜 움직입니다.
 *   5. 실마다 인원을 고르게.
 *
 *   3과 5는 서로 어긋납니다. 분반을 지키면 실마다 인원이 들쭉날쭉하고,
 *   고르게 나누면 분반이 섞입니다. 어느 쪽을 택할지는 담당자가 고릅니다.
 */

import {
  CellValue, ExamRoom, NeisRow, PlacementSlot, Student, SubjectBanEntry, SubjectBanKey,
  isExtraRoom, isWaitCell,
} from './types';
import { membersOfBan } from './autoPlace';

export type SeatMode = 'ban' | 'student_id';

/** 정원을 넘긴 방 하나. */
export interface OverRoom {
  roomId: string;
  room: string;
  capacity: number;
  seated: number;
  over: number;
}

/** 정원이 넘쳐 옆 고사실로 옮긴 학생 하나. */
export interface MovedStudent {
  ban: string;
  num: number;
  /** 원래 이 학생의 분반이 앉은 방 */
  from: string;
  /** 옮겨 간 방 */
  to: string;
  /** 이 학생이 속한 분반 칸 */
  cell: string;
}

export interface SeatSlotResult {
  /** 이 교시의 칸. roomId -> 값 */
  row: Record<string, CellValue>;
  /** 학생 자리. `${ban}-${num}` -> roomId */
  placements: Record<string, string>;
  /** 정원이 넘쳐 옆 방으로 옮긴 학생들. 채점 명단은 분반 그대로입니다. */
  moved: MovedStudent[];
  /** 정원을 넘긴 방들. 여기가 의자를 더 놓아야 할 곳입니다. */
  over: OverRoom[];
  /** 넘긴 인원 합계 */
  overTotal: number;
  /** 쓸 방이 아예 없어 앉히지 못한 학생. 보통 0명입니다. */
  unseated: Student[];
  notes: string[];
  ok: boolean;
}

interface Room {
  id: string;
  name: string;
  banName: string;
  /** 별도실(세미나실·넘나들 등). 정규 교실이 모자랄 때만 엽니다. */
  extra: boolean;
  capFor: (cell: CellValue) => number;
}

export function seatSlot(args: {
  ps: PlacementSlot;
  rooms: ExamRoom[];
  entries: Map<SubjectBanKey, SubjectBanEntry>;
  students: Student[];
  neis?: NeisRow[];
  mode?: SeatMode;
  /** 이 방에 이 칸을 넣으면 몇 석인가. 교시별 정원 조정까지 반영된 값입니다. */
  capacityOf: (room: ExamRoom, cell: CellValue) => number;
  /** 이 교시에 쓰지 않는 방(배치금지). */
  forbidden?: Record<string, boolean>;
  /**
   * 이 줄을 그대로 두고 학생만 다시 앉힙니다(교시별 ↻).
   *
   * 고사실 구성은 담당자가 손으로 맞춰 둔 것이라, 학생을 다시 나누자고
   * 방까지 새로 짜면 그 손질이 사라집니다. 줄을 주면 방은 건드리지 않습니다.
   */
  keepRow?: Record<string, CellValue>;
  /**
   * 자물쇠를 채워 둔 칸. 방ID -> 그 칸 값.
   *
   * 담당자가 일부러 잠가 둔 것이므로 자동배치가 건드리지 않습니다.
   * 잠근 방은 칸도 학생도 그대로 두고, 나머지 방만 새로 짭니다.
   */
  lockedRow?: Record<string, CellValue>;
}): SeatSlotResult {
  const { ps, entries, students, neis, capacityOf } = args;
  const mode: SeatMode = args.mode ?? 'ban';
  const notes: string[] = [];
  const keyOf = (st: Student) => `${st.ban}-${st.num}`;
  const byNum = (a: Student, b: Student) =>
    a.ban !== b.ban ? a.ban.localeCompare(b.ban, 'ko', { numeric: true }) : a.num - b.num;

  const usable: Room[] = args.rooms
    .filter(r => r.roomName !== '' && r.roomName !== '0' && !args.forbidden?.[r.id])
    .map(r => ({
      id: r.id, name: r.roomName, banName: r.banName, extra: isExtraRoom(r),
      capFor: (cell: CellValue) => capacityOf(r, cell),
    }));

  const takes = (st: Student) => st.subjects.some(sub => ps.subjects.includes(sub));
  const nonTakers = students.filter(st => !takes(st));

  /** 과목별 분반과 실제 소속 학생. 명목 인원이 아니라 진짜 명단으로 셉니다. */
  const bansBySubject = new Map<string, { cell: string; members: Student[] }[]>();
  for (const e of entries.values()) {
    if (!ps.subjects.includes(e.subject)) continue;
    const members = membersOfBan(e, entries, students, neis);
    if (members.length === 0) continue; // 0명 분반은 방을 차지할 이유가 없습니다.
    bansBySubject.set(e.subject, [...(bansBySubject.get(e.subject) ?? []), { cell: e.key, members }]);
  }

  const row: Record<string, CellValue> = {};
  const placements: Record<string, string> = {};
  const unseated: Student[] = [];
  const moved: MovedStudent[] = [];
  const seatedIn = new Map<string, number>();   // roomId -> 앉은 수
  const capOfRoom = new Map<string, number>();  // roomId -> 정원
  const taken = new Set<string>();

  const sum = (list: { members: Student[] }[]) => list.reduce((a, b) => a + b.members.length, 0);
  const headroom = (id: string) => (capOfRoom.get(id) ?? 0) - (seatedIn.get(id) ?? 0);
  const put = (st: Student, id: string) => {
    placements[keyOf(st)] = id;
    seatedIn.set(id, (seatedIn.get(id) ?? 0) + 1);
  };

  /**
   * 이 학생을 어느 방에 넣을까.
   * 자리가 남은 방이 있으면 그중 제 반 교실, 없으면 가장 여유 있는 방.
   * 다 찼으면 **가장 덜 넘친 방**에 넣습니다. 그래야 초과가 한곳에 안 몰립니다.
   */
  const bestRoom = (st: Student, cands: Room[]) => {
    if (cands.length === 0) return null;
    const open = cands.filter(r => headroom(r.id) > 0);
    if (open.length > 0) {
      // 자리가 남아 있을 때만 제 반 교실을 봅니다. 그래야 덜 움직입니다.
      const home = open.find(r => r.banName === st.ban || r.name === st.ban);
      return home ?? [...open].sort((a, b) => headroom(b.id) - headroom(a.id) || a.id.localeCompare(b.id))[0];
    }
    /*
     * 모든 방이 찼습니다. 여기서도 제 반 교실을 고집하면 그 방에만 넘친
     * 인원이 쌓입니다(한 방에 20명 초과). 가장 덜 넘친 방으로 보내
     * 초과를 얇게 폅니다.
     */
    return [...cands].sort((a, b) => headroom(b.id) - headroom(a.id) || a.id.localeCompare(b.id))[0];
  };

  /*
   * 잠근 칸부터 자리를 잡습니다. 그래야 나머지가 남은 방만 두고 짭니다.
   * 이미 앉은 분반은 아래 과목 루프에서 빼므로 두 번 앉지 않습니다.
   */
  const lockedBans = new Set<string>();
  if (!args.keepRow) seatLocked();

  /*
   * 줄을 받았으면 방은 손대지 않습니다. 칸에 적힌 대로 학생만 다시 앉힙니다.
   * 아래 과목 루프는 건너뜁니다.
   */
  const keeping = !!args.keepRow;
  if (args.keepRow) reseatKept(args.keepRow);

  // ── 과목마다 방을 잡습니다. 사람이 많은 과목부터. ───────────────────
  //    적은 과목이 큰 방을 먼저 차지하면 큰 과목이 갈 곳을 잃습니다.
  const subjectOrder = keeping ? [] : [...bansBySubject.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));
  for (const [subject, bans] of subjectOrder) {
    const free = () => usable.filter(r => !taken.has(r.id));

    const bansLeft = bans.filter(b => !lockedBans.has(b.cell));
    if (bansLeft.length === 0) continue;   // 이 과목은 잠근 칸으로 다 앉았습니다.
    const need = sum(bansLeft);

    if (mode === 'ban') {
      /*
       * 분반은 넘치더라도 통째로 지킵니다.
       *
       * 채점과 점수 입력이 분반 단위라, 한 분반이 두 방으로 갈라지면 교사가
       * 방을 오가며 맞춰야 합니다. 29명을 28석 방에 넣어 의자 하나를 더 놓는
       * 편이, 분반을 쪼개는 것보다 훨씬 낫습니다.
       *
       * 방은 정규 교실부터 씁니다. 별도실(세미나실·넘나들)은 정규 교실이
       * 모자랄 때만 엽니다 — 학생이 제 교실에 남고, 여는 방도 적어집니다.
       *
       * 짝짓기는 큰 분반 ↔ 큰 방. 이 순서가 넘치는 인원의 합을 가장 작게
       * 만듭니다(둘 다 내림차순으로 맞추면 Σmax(0, 인원-정원)이 최소).
       */
      const order = [...bansLeft].sort((x, y) => y.members.length - x.members.length);
      const pool = free();
      const regular = pool.filter(r => !r.extra);
      const extra = pool.filter(r => r.extra);
      const byCap = (list: Room[], cell: string) =>
        [...list].sort((x, y) => y.capFor(cell) - x.capFor(cell) || x.id.localeCompare(y.id));
      // 정규 교실을 먼저 늘어놓고, 모자란 만큼만 별도실을 잇습니다.
      const lineup = [...byCap(regular, order[0].cell), ...byCap(extra, order[0].cell)]
        .slice(0, order.length);

      /*
       * 정원이 같은 방끼리는 자리를 바꿔 제 교실을 찾아 줍니다.
       *
       * 크기 순서로만 짝지으면 28석 방이 둘일 때 어느 쪽에 갈지가 우연히
       * 정해져, 3반 아이들이 5반 교실에 앉는 일이 생깁니다. 정원이 같으면
       * 넘치는 인원은 그대로이므로, 공짜로 이동만 줄일 수 있습니다.
       */
      const groups = new Map<number, number[]>();   // 정원 -> lineup 자리 번호
      lineup.forEach((r, i) => {
        const c = r.capFor(order[i].cell);
        groups.set(c, [...(groups.get(c) ?? []), i]);
      });
      for (const idxs of groups.values()) {
        if (idxs.length < 2) continue;
        const rest = [...idxs];
        for (const i of idxs) {
          // 이 자리에 올 분반 가운데 이 방을 제 교실로 삼는 학생이 가장 많은 것.
          let best = rest[0], bestScore = -1;
          for (const j of rest) {
            const sc = homeScore(lineup[i], order[j].members);
            if (sc > bestScore) { bestScore = sc; best = j; }
          }
          if (best !== i) {
            const t = order[i]; order[i] = order[best]; order[best] = t;
          }
          rest.splice(rest.indexOf(i), 1);
        }
      }

      if (lineup.length >= order.length) {
        const seats = order.map((b, i) => {
          const r = lineup[i];
          row[r.id] = b.cell;
          taken.add(r.id);
          capOfRoom.set(r.id, r.capFor(b.cell));
          for (const st of b.members) put(st, r.id);
          return { r, cell: b.cell };
        });

        /*
         * 넘친 인원만 옆 고사실로 보냅니다.
         *
         * 분반을 통째로 앉히면 큰 분반이 한두 명씩 정원을 넘깁니다. 그 방에
         * 의자를 더 놓는 것보다, 넘친 한둘을 자리가 남은 옆 방으로 보내는 편이
         * 낫습니다. 분반은 그대로 남고 채점 명단도 그대로입니다.
         *
         * 옮기는 학생은 학번이 뒤인 쪽부터입니다. 분반 명단이 앞에서부터
         * 끊기지 않고 이어지므로, 누가 옮겨 갔는지 찾기 쉽습니다.
         */
        const movedHere = spillOverflow(seats);
        moved.push(...movedHere);

        const short = seats
          .map(s => ({ s, over: -headroom(s.r.id) }))
          .filter(x => x.over > 0);
        notes.push(
          `[${subject}] 분반 ${bansLeft.length}개를 통째로 앉혔습니다 (응시 ${need}명)` +
          (movedHere.length === 0
            ? '.'
            : ` — 정원이 넘쳐 ${movedHere.length}명을 옆 고사실로 옮겼습니다 (` +
              movedHere.map(m => `${m.ban} ${m.num}번 → ${m.to}`).join(', ') +
              `). 채점 명단은 분반 그대로입니다.`) +
          (short.length === 0
            ? ''
            : ` 그래도 ${short.map(x => `${x.s.r.name}에 ${x.over}명`).join(', ')} 넘칩니다. ` +
              `의자를 더 놓거나, 이 교시에 고사실을 하나 더 여는 편이 낫습니다.`) +
          // 한둘이면 옮기는 편이 낫지만, 여럿이면 고사실을 하나 더 여는 편이 낫습니다.
          (movedHere.length >= 3
            ? ` 옮긴 인원이 적지 않습니다. 이 교시에 고사실을 하나 더 열면 분반을 그대로 둘 수 있습니다.`
            : '')
        );
        continue;
      }
      notes.push(
        `[${subject}] 분반이 ${bansLeft.length}개인데 쓸 방이 ${lineup.length}곳뿐이라, ` +
        `같은 과목끼리 나눠 앉힙니다.`
      );
    }

    // ── 좌석 합계로 앉히기. 분반을 섞되 초과를 최소로 흩습니다. ────────
    const probe = `${subject}-1실`;
    const pool = free().sort((a, b) => b.capFor(probe) - a.capFor(probe) || a.id.localeCompare(b.id));
    const picked: Room[] = [];
    let have = 0;
    for (const r of pool) {
      if (have >= need) break;
      picked.push(r);
      have += r.capFor(probe);
    }
    // 그래도 모자라면 남은 방을 전부 씁니다. 넓게 흩어야 초과가 얇아집니다.
    if (have < need) {
      for (const r of pool) if (!picked.includes(r)) { picked.push(r); have += r.capFor(probe); }
    }
    if (picked.length === 0) { unseated.push(...bansLeft.flatMap(b => b.members)); continue; }

    picked.forEach((r, i) => {
      const cell = `${subject}-${i + 1}실`;
      row[r.id] = cell;
      taken.add(r.id);
      capOfRoom.set(r.id, r.capFor(cell));
    });
    for (const st of bansLeft.flatMap(b => b.members).sort(byNum)) put(st, bestRoom(st, picked)!.id);

    if (have < need) {
      notes.push(
        `[${subject}] 좌석이 ${need - have}석 모자라 ${picked.length}실에 나눠 넘겨 앉힙니다 ` +
        `(응시 ${need}명 / 좌석 ${have}석).`
      );
    }
  }

  // ── 남은 방이 대기실. 제 반 교실 먼저, 초과는 고르게. ───────────────
  const waitRooms = keeping
    ? usable.filter(r => taken.has(r.id) && isWaitCell(row[r.id]))
    : usable.filter(r => !taken.has(r.id) || isWaitCell(row[r.id]));
  if (!keeping) for (const r of waitRooms) if (!taken.has(r.id)) capOfRoom.set(r.id, r.capFor('대기'));
  if (waitRooms.length === 0 && nonTakers.length > 0) {
    unseated.push(...nonTakers);
  } else {
    for (const st of [...nonTakers].sort(byNum)) put(st, bestRoom(st, waitRooms)!.id);
  }
  for (const r of waitRooms) {
    const n = seatedIn.get(r.id) ?? 0;
    if (n > 0) row[r.id] = r.banName ? `대기${r.banName.replace('반', '')}반 - ${n}명` : `대기 - ${n}명`;
  }

  for (const [id, on] of Object.entries(args.forbidden ?? {})) if (on) row[id] = '배치금지';

  // ── 넘긴 곳을 모읍니다. 여기가 의자를 더 놓을 자리입니다. ───────────
  const over: OverRoom[] = [];
  for (const r of usable) {
    const seated = seatedIn.get(r.id) ?? 0;
    const capacity = capOfRoom.get(r.id) ?? 0;
    if (seated > capacity) over.push({ roomId: r.id, room: r.name, capacity, seated, over: seated - capacity });
  }
  const overTotal = over.reduce((a, b) => a + b.over, 0);
  if (overTotal > 0) {
    notes.push(
      `정원을 모두 ${overTotal}명 넘겼습니다 — ` +
      over.map(o => `${o.room} ${o.seated}/${o.capacity}석(+${o.over})`).join(', ') +
      `. 그 방에 의자를 더 놓거나, 이 교시에 고사실을 더 열면 됩니다.`
    );
  }
  if (unseated.length > 0) {
    notes.push(`${unseated.length}명은 쓸 방이 없어 앉히지 못했습니다. 이 교시에 고사실을 열어야 합니다.`);
  }
  if (overTotal === 0 && unseated.length === 0) {
    notes.unshift('모두 자리를 받았고 정원을 넘긴 고사실도 없습니다.');
  }

  return { row, placements, moved, over, overTotal, unseated, notes, ok: unseated.length === 0 && overTotal === 0 };

  /**
   * 정원을 넘긴 방에서 넘친 만큼만 빼내어, 자리가 남은 같은 과목 방으로 보냅니다.
   *
   * 같은 과목 방으로만 보냅니다. 다른 과목 방에 앉히면 시험지와 시작 시각이
   * 달라 한 교실에서 두 시험을 치르게 됩니다.
   * 보낼 곳이 없으면 그대로 둡니다 — 고사실을 더 열지 말지는 담당자가 정합니다.
   */
  function spillOverflow(seats: { r: Room; cell: CellValue }[]): MovedStudent[] {
    const out: MovedStudent[] = [];
    // 한 번 돌 때마다 넘친 인원이 하나 줄어드므로 반드시 멈춥니다.
    for (let guard = 0; guard < 10000; guard++) {
      const full = seats.filter(s => headroom(s.r.id) < 0)
        .sort((a, b) => headroom(a.r.id) - headroom(b.r.id));
      if (full.length === 0) break;
      const src = full[0];
      const dst = seats
        .filter(s => s.r.id !== src.r.id && headroom(s.r.id) > 0)
        .sort((a, b) => headroom(b.r.id) - headroom(a.r.id) || a.r.id.localeCompare(b.r.id))[0];
      if (!dst) break;

      const here = students
        .filter(st => placements[keyOf(st)] === src.r.id)
        .sort(byNum);
      const st = here[here.length - 1];
      if (!st) break;

      placements[keyOf(st)] = dst.r.id;
      seatedIn.set(src.r.id, (seatedIn.get(src.r.id) ?? 0) - 1);
      seatedIn.set(dst.r.id, (seatedIn.get(dst.r.id) ?? 0) + 1);
      out.push({ ban: st.ban, num: st.num, from: src.r.name, to: dst.r.name, cell: String(src.cell) });
    }
    return out;
  }

  /**
   * 잠근 칸을 그대로 되살립니다.
   *
   * 칸에 분반이 적혀 있으면 그 분반 명단을 그 방에 앉히고, 그 분반은
   * 아래 자동배치에서 뺍니다. 대기 칸이면 방만 잡아 두고 사람은 뒤에서 채웁니다.
   */
  function seatLocked() {
    const locked = args.lockedRow;
    if (!locked) return;
    for (const r of usable) {
      const cell = locked[r.id];
      if (!cell || cell === '배치금지') continue;
      row[r.id] = cell;
      taken.add(r.id);
      capOfRoom.set(r.id, r.capFor(cell));
      if (isWaitCell(cell)) continue;
      const e = entries.get(String(cell) as SubjectBanKey);
      if (!e || !ps.subjects.includes(e.subject)) continue;
      lockedBans.add(String(cell));
      for (const st of membersOfBan(e, entries, students, neis)) {
        if (placements[keyOf(st)]) continue;
        put(st, r.id);
      }
    }
  }

  function homeScore(r: Room, members: Student[]) {
    return members.filter(st => r.banName === st.ban || r.name === st.ban).length;
  }

  /**
   * 고사실은 그대로, 학생만 다시 앉힙니다.
   *
   * 칸에 분반 이름이 적혀 있으면 그 분반 학생을 그 방에 넣습니다 — 칸과 명단이
   * 어긋나면 편성현황이 거짓말을 하게 되므로, 여기서는 배치 방식을 따지지 않고
   * 적힌 대로 따릅니다. 분반이 아닌 칸(`수학(4)-1실`)만 학번순으로 나눕니다.
   */
  function reseatKept(keep: Record<string, CellValue>) {
    const cellOf = new Map<string, CellValue>();
    // 칸은 하나도 바꾸지 않습니다. 쓰지 않는 방의 칸까지 그대로 옮깁니다.
    for (const [id, v] of Object.entries(keep)) row[id] = v;
    for (const r of usable) {
      const cell = keep[r.id];
      if (!cell || cell === '배치금지') continue;
      row[r.id] = cell;
      cellOf.set(r.id, cell);
      taken.add(r.id);
      capOfRoom.set(r.id, r.capFor(cell));
    }

    // 시험실을 과목별로 모읍니다. 이 교시 과목이 아닌 칸은 건드리지 않습니다.
    const bySubject = new Map<string, Room[]>();
    for (const r of usable) {
      const cell = cellOf.get(r.id);
      if (cell === undefined || isWaitCell(cell)) continue;
      const text = String(cell);
      const subject = entries.get(text as SubjectBanKey)?.subject
        ?? ps.subjects.find(s => text.startsWith(`${s}-`));
      if (!subject) continue;
      bySubject.set(subject, [...(bySubject.get(subject) ?? []), r]);
    }

    for (const [subject, rs] of bySubject) {
      // ① 분반이 적힌 방부터. 그 분반 명단이 통째로 들어갑니다.
      const banRooms = rs.filter(r => entries.has(String(cellOf.get(r.id)) as SubjectBanKey));
      for (const r of banRooms) {
        const e = entries.get(String(cellOf.get(r.id)) as SubjectBanKey)!;
        for (const st of membersOfBan(e, entries, students, neis)) {
          if (placements[keyOf(st)]) continue;
          put(st, r.id);
        }
      }
      // ② 남은 응시자는 분반이 없는 방에 고르게. 그런 방이 없으면 있는 방에.
      const open = rs.filter(r => !banRooms.includes(r));
      const target = open.length > 0 ? open : rs;
      const rest = students
        .filter(st => st.subjects.includes(subject) && !placements[keyOf(st)])
        .sort(byNum);
      for (const st of rest) put(st, bestRoom(st, target)!.id);
    }

    // 칸이 모자라 갈 곳이 없는 응시자는 그대로 알립니다. 조용히 지우지 않습니다.
    for (const st of students) {
      if (takes(st) && !placements[keyOf(st)]) unseated.push(st);
    }
  }
}
