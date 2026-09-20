import { AttendanceRow, ExamRoom, PlacementGrid, SeparateExaminer, separateRoomFor, Student } from '../types';

/**
 * 별도 고사실 인쇄물의 재료.
 *
 * 9. 별도 고사실(지정 화면)과 11-8 별도 수험생(인쇄물)이 같은 내용을 보여 줍니다.
 * 두 곳에서 따로 계산하면 언젠가 어긋나므로, 여기 한 곳에서만 만듭니다.
 */

/** 한 학생이 별도로 보는 교시 한 줄. */
export interface SeparateDetailRow {
  /** '3일차 2교시' */
  title: string;
  /** 원래 소속 고사실. 답안지를 여기 것과 합칩니다. */
  room: string;
  subject: string;
  slotIndex: number;
}

/** 교시·별도실 하나의 명렬. */
export interface SeparateRoster {
  slotTitle: string;
  day: string;
  period: string;
  room: number;
  rows: Array<{ hakbun: string; name: string; subject: string; homeRoom: string }>;
}

/** 안내문 한 장에 필요한 것 전부. */
export interface SeparateStudentSheet {
  key: string;
  student: Student;
  examiner: SeparateExaminer;
  rows: SeparateDetailRow[];
}

/** 교시 정보. selPlacementSlots 가 주는 모양 중 여기서 쓰는 것만 추립니다. */
export interface SlotInfo {
  index: number;
  day: number;
  period: number;
  title: string;
  subjects: string[];
}

/**
 * 그 학생이 그 교시에 어느 고사실 소속인지.
 * 별도실에서 보더라도 답안지는 이 고사실 것과 합쳐야 해서 꼭 필요합니다.
 */
function homeRoomAt(
  key: string, slotIndex: number,
  studentPlacements: Record<number, Record<string, string>>,
  placement: PlacementGrid, rooms: ExamRoom[],
): string {
  const roomId = studentPlacements?.[slotIndex]?.[key];
  if (!roomId) return '';
  const cell = placement?.[slotIndex]?.[roomId];
  if (!cell || cell === '배치금지') return '';
  return rooms.find(r => r.id === roomId)?.roomName ?? '';
}

/**
 * 그 학생이 별도로 보는 교시를 하나하나 펼칩니다.
 * 과목까지 있어야 감독 선생님이 어느 시험지를 챙길지 압니다.
 * 대기 시간에는 시험이 없으므로, 실제로 보는 교시만 남깁니다.
 */
export function buildSeparateDetail(
  key: string,
  examSlots: SlotInfo[],
  separateExaminers: Record<string, SeparateExaminer>,
  students: Student[],
  studentPlacements: Record<number, Record<string, string>>,
  placement: PlacementGrid,
  rooms: ExamRoom[],
): SeparateDetailRow[] {
  const st = students.find(x => `${x.ban}-${x.num}` === key);
  return examSlots
    .filter(ps => separateRoomFor(key, ps.index, separateExaminers))
    .map(ps => ({
      title: ps.title,
      room: homeRoomAt(key, ps.index, studentPlacements, placement, rooms),
      subject: ps.subjects.find(sub => st?.subjects.includes(sub)) ?? '',
      slotIndex: ps.index,
    }))
    .filter(x => x.subject);
}

/** 지정된 학생들의 안내문 재료를 학번 순으로 만듭니다. */
export function buildSeparateSheets(
  students: Student[],
  separateExaminers: Record<string, SeparateExaminer>,
  examSlots: SlotInfo[],
  studentPlacements: Record<number, Record<string, string>>,
  placement: PlacementGrid,
  rooms: ExamRoom[],
): SeparateStudentSheet[] {
  return students
    .map(st => ({ st, key: `${st.ban}-${st.num}` }))
    .filter(({ key }) => separateExaminers[key])
    .sort((a, b) => (a.st.ban === b.st.ban ? a.st.num - b.st.num : a.st.ban.localeCompare(b.st.ban, 'ko')))
    .map(({ st, key }) => ({
      key,
      student: st,
      examiner: separateExaminers[key],
      rows: buildSeparateDetail(key, examSlots, separateExaminers, students, studentPlacements, placement, rooms),
    }));
}

/** 명렬에 실을 줄: 교시 → 별도실 → 학생. 응시현황에서 원고사실과 과목을 가져옵니다. */
export function buildSeparateRosters(
  attendance: AttendanceRow[],
  examSlots: SlotInfo[],
  roomCount: number,
): SeparateRoster[] {
  const out: SeparateRoster[] = [];

  for (const ps of examSlots) {
    const day = `${ps.day}일차`;
    const period = `${ps.period}교시`;
    for (let room = 1; room <= roomCount; room++) {
      const rows = attendance
        .filter(r => r.day === day && r.period === period && r.separateRoom === room)
        .sort((a, b) => (a.ban === b.ban ? a.num - b.num : a.ban.localeCompare(b.ban, 'ko')))
        .map(r => ({
          hakbun: `${r.grade}${String(r.ban).replace('반', '').padStart(2, '0')}${String(r.num).padStart(2, '0')}`,
          name: r.name,
          subject: r.subject,
          homeRoom: r.examRoom,
        }));
      if (rows.length > 0) out.push({ slotTitle: ps.title, day, period, room, rows });
    }
  }
  return out;
}
