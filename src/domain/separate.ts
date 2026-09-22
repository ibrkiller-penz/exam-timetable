import { AttendanceRow, PlacementSlot, SeparateExaminers, separateRoomFor, isWaitCell } from './types';

/**
 * 응시현황의 과목 자리에 들어간 값이 '대기'를 뜻하는지.
 *
 * 대기 학생의 과목 자리에는 칸 이름 앞부분이 들어갑니다 — `대기`, `대기2반`,
 * 칸이 대기 칸이 아니면 `자습(대기)`. 예전 코드는 여기에 `미응시` 가 들어온다고
 * 보고 여기저기서 `=== '미응시'` 로 견주었는데, 그런 값은 만들어지지 않아
 * 대기실 분기가 전부 죽어 있었습니다. 대기실 명단 제목이 '고사실 응시현황표'로
 * 나가고, 좌석 무작위에서 대기실이 빠지지 않은 것이 그 때문입니다.
 *
 * 판정은 이 한 곳에서만 합니다.
 */
export const isWaitSubject = (subject: string | undefined | null): boolean =>
  Boolean(subject) && (isWaitCell(subject as string) || subject === '미응시' || subject === '자습(대기)' || subject === '자습');

/** 그 줄이 실제로 시험을 보는 줄인지. 대기·자습 시간에는 별도실에 갈 이유가 없습니다. */
export const isTakingRow = (r: Pick<AttendanceRow, 'subject'>): boolean =>
  Boolean(r.subject) && !isWaitSubject(r.subject);

/**
 * 별도 고사실 지정을 응시현황에 입힙니다.
 *
 * 응시현황은 8. 학생 배치를 확정할 때 한 번 만들어집니다. 별도 응시자는 보통 그 뒤에
 * 지정하므로, 저장된 줄에는 표시가 없습니다. 인쇄물이 저장된 값만 믿으면
 * 명단 비고가 비고 좌석배치도에도 그대로 남습니다.
 *
 * 그래서 보여 줄 때마다 여기를 거칩니다.
 *  1) 그 학생의 줄에 별도실 번호를 답니다.
 *  2) 그 고사실의 좌석 번호를 1번부터 빈틈없이 다시 이어 붙입니다.
 *     빠진 자리를 비워 두면 좌석배치도에 구멍이 생기고 명단의 좌석과도 어긋납니다.
 */
export function applySeparate(
  attendance: AttendanceRow[],
  slots: PlacementSlot[],
  map: SeparateExaminers | undefined,
  /** 별도실에 종일 머무는지. 기본은 시험 보는 교시에만 갑니다. */
  allDay = false
): AttendanceRow[] {
  if (!attendance || attendance.length === 0) return attendance;
  if (!map || Object.keys(map).length === 0) {
    // 지정이 하나도 없으면 예전에 달아 둔 표시만 걷어냅니다.
    return attendance.some(r => r.separateRoom)
      ? renumberSeats(attendance.map(r => (r.separateRoom ? { ...r, separateRoom: undefined } : r)))
      : attendance;
  }

  const slotOf = new Map(slots.map(ps => [`${ps.day}일차${ps.period}교시`, ps.index]));

  let changed = false;
  const marked = attendance.map(r => {
    const slotIndex = slotOf.get(`${r.day}${r.period}`);
    // 기본은 시험 보는 교시에만 별도실에 갑니다. 대기 시간에는 제 교실에 있습니다.
    // '종일'로 설정하면 대기 시간까지 별도실에 머뭅니다.
    const applies = allDay || isTakingRow(r);
    const room = slotIndex === undefined || !applies ? undefined : separateRoomFor(`${r.ban}-${r.num}`, slotIndex, map);
    if (room === r.separateRoom) return r;
    changed = true;
    return { ...r, separateRoom: room };
  });

  return changed ? renumberSeats(marked) : attendance;
}

/** 고사실마다 좌석을 1번부터 다시 답니다. 별도 응시자는 좌석을 받지 않습니다. */
function renumberSeats(rows: AttendanceRow[]): AttendanceRow[] {
  const counter = new Map<string, number>();
  return [...rows]
    .sort((a, b) => a.seq - b.seq)
    .map(r => {
      const key = `${r.day}|${r.period}|${r.examRoom}`;
      if (r.separateRoom) {
        return r.seat === null ? r : { ...r, seat: null, key2: `${r.day}${r.period}${r.examRoom}_` };
      }
      const n = (counter.get(key) ?? 0) + 1;
      counter.set(key, n);
      return r.seat === n ? r : { ...r, seat: n, key2: `${r.day}${r.period}${r.examRoom}_${n}` };
    });
}
