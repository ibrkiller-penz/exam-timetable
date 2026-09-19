export type DayIdx = 1 | 2 | 3 | 4 | 5;
export type PeriodIdx = 1 | 2 | 3 | 4 | 5;
export type DayLabel = `${DayIdx}일차`;
export type PeriodLabel = `${PeriodIdx}교시`;
export type SlotKey = `${DayIdx}_${PeriodIdx}`;
export const slotKey = (d: DayIdx, p: PeriodIdx): SlotKey => `${d}_${p}`;

export interface NeisRow {
  year: string;
  semester: string;
  grade: string;
  curriculum: string;
  subject: string;
  room: string;
  track: string;
  ban: string;
  num: number;
  name: string;
  room2: string;
}

export interface ExamDay  { day: DayIdx; date: string | null; }
export interface ExamTime { day: DayIdx; period: PeriodIdx; time: string | null; }
export interface ExamRoom {
  id: string;
  banName: string;
  stuCount: number | null;
  maxClassSize: number | null;
  roomName: string;
  capacity: number;
  cols?: number;
  rows?: number;
  layoutDirection?: 'col' | 'row';
}
export const isExtraRoom = (r: ExamRoom): boolean =>
  r.id.startsWith('extra_') || (r.maxClassSize === null || r.maxClassSize === 0) || r.banName === '' || r.roomName.startsWith('별도');
export const isUsableRoom = (r: ExamRoom): boolean =>
  r.roomName !== '' && r.roomName !== '0' && r.capacity >= 0;

/**
 * 교시별 고사실 정원 예외 (slotIndex ➔ roomId ➔ 정원).
 * 특정 교시에만 한 고사실의 정원을 다르게 잡고 싶을 때 쓰며,
 * 값이 없는 칸은 고사실의 기본 정원(ExamRoom.capacity)을 그대로 따릅니다.
 */
export type SlotRoomCapacity = Record<number, Record<string, number>>;

/**
 * 해당 교시에 실제로 적용되는 고사실 정원.
 *
 * 우선순위
 *  1. 그 교시에만 지정한 정원 예외
 *  2. 전교생이 같은 시험을 보는 교시(미응시 0명)면 그 반의 학생 수
 *     — 학생이 자기 반 교실에 그대로 앉으므로 정원도 반 인원이 기준입니다.
 *  3. 고사실 기본 정원
 */
export const capacityForSlot = (
  room: ExamRoom,
  slotIndex: number,
  slotRoomCapacity?: SlotRoomCapacity,
  slot?: Pick<PlacementSlot, 'nonTakers'>
): number => {
  const override = slotRoomCapacity?.[slotIndex]?.[room.id];
  if (override && override > 0) return override;

  if (slot && slot.nonTakers === 0 && !isExtraRoom(room) && room.maxClassSize && room.maxClassSize > 0) {
    return room.maxClassSize;
  }

  return room.capacity && room.capacity > 0 ? room.capacity : 28;
};

/**
 * 위 규칙으로 계산한 정원을 반영한 고사실 목록을 돌려줍니다.
 * 배치 로직 전체가 `room.capacity`를 읽으므로, 교시 단위 호출 앞에서 이 함수로
 * 한 번 감싸 주면 정원 규칙이 자동으로 반영됩니다.
 */
export const roomsForSlot = (
  rooms: ExamRoom[],
  slotIndex: number,
  slotRoomCapacity?: SlotRoomCapacity,
  slot?: Pick<PlacementSlot, 'nonTakers'>
): ExamRoom[] =>
  rooms.map(r => {
    const cap = capacityForSlot(r, slotIndex, slotRoomCapacity, slot);
    return cap === r.capacity ? r : { ...r, capacity: cap };
  });

export interface SubjectSummary { subject: string; banCount: number; stuCount: number; }
export interface SubjectBan     { subject: string; room: string; stuCount: number; subjectSeq: number; }
export type SubjectBanKey = string;
export interface SubjectBanEntry extends SubjectBan { key: SubjectBanKey; index: number; }

export interface CompatGroup { subjects: string[]; banCount: number; stuCount: number; nonTakers: number; }

export interface Student { grade: string; ban: string; num: number; name: string; subjects: string[]; }
export type StudentKey = string;
export const studentKey = (s: { ban: string; num: number }): StudentKey => `${s.ban}${s.num}`;

export interface TimetableSlot { subjects: string[]; }
export type Timetable = Record<SlotKey, TimetableSlot>;
export type SlotStatus =
  | { kind: 'empty' }
  | { kind: 'ok' }
  | { kind: 'error'; code: 'NO_TIME' | 'NO_DATE' | 'CONFLICT' | 'UNKNOWN'; message: string };
export interface DayLoad { counts: [number, number, number, number, number, number]; error: string | null; }

export interface PlacementSlot {
  index: number;
  day: DayIdx; period: PeriodIdx;
  title: string;
  subjects: string[];
  banCounts: number[];
  banCountTotal: number;
  takers: number;
  nonTakers: number;
}
export type CellValue = string;
export const isWaitCell = (v: CellValue): boolean => Boolean(v && v.startsWith('대기'));
export const isForbiddenCell = (v: CellValue): boolean => v === '배치금지';
export const parseWaitCount = (v: CellValue): number => {
  if (!v) return 0;
  const match = v.match(/(\d+)\s*명/);
  if (match) return Number(match[1]);
  const nums = v.replace(/[^0-9]/g, '');
  return nums ? Number(nums) : 0;
};
export type PlacementGrid = Record<number, Record<string, CellValue>>;

export interface CellInfo {
  slotIndex: number; roomId: string; roomIndex: number;
  roomName: string; ban: string;
  day: DayIdx; period: PeriodIdx; title: string;
  allExamRemainCount: number;
  noExamRemainCount: number;
  examRemainCount: number;
  subject: CellValue; classRoom: string; stuCount: number;
}
export type PlacementErrorKey = '응시초과' | '응시미배치' | '미응시미배치' | '미응시초과' | 'OK' | '';
export interface SlotSummary {
  total:     { ban: number; takers: number; nonTakers: number };
  placed:    { ban: number; takers: number; nonTakers: number };
  remaining: { ban: number; takers: number; nonTakers: number };
  errorKey: PlacementErrorKey;
}

export interface AttendanceRow {
  key1: string; key2: string; key3: string;
  day: DayLabel; period: PeriodLabel; examRoom: string;
  subject: string;
  grade: string; ban: string; num: number; name: string;
  classRoom: string;
  seq: number;
  seat: number | null;
}

export interface LabelRow {
  seq: number; day: DayLabel; period: PeriodLabel; date: string; time: string;
  subject: string;
  examRoom: string; classRoom: string; stuCount: number;
}

export interface AppMeta {
  schemaVersion: 1;
  appVersion: string;
  title: string;
  sourceFileName: string | null;
  createdAt: string; updatedAt: string;
}
export type AppTheme = 'blue' | 'red' | 'green';

export interface Settings {
  maxSubjectsPerSlot: number;
  theme?: AppTheme;
  seatColumns: number;
  seatsPerColumn: number;
  labelsPerPage: number;
  showSeatOnStudentTable: boolean;
  seatLayoutDirection?: 'col' | 'row';
  studentTicketNotice?: string;
}
export interface Stages {
  stage1: boolean;
  stage2: boolean;
  stage3: boolean;
  stage4: boolean;
  stage5: boolean;
  step1?: boolean;
  step2?: boolean;
  step3?: boolean;
  step4?: boolean;
  step5?: boolean;
  step6?: boolean;
  step7?: boolean;
  step8?: boolean;
  [key: string]: boolean | undefined;
}
export type GradeId = '2' | '3';

export interface GradeData {
  meta: AppMeta;
  settings: Settings;
  stages: Stages;
  neis: NeisRow[];
  days: ExamDay[];
  times: ExamTime[];
  rooms: ExamRoom[];
  subjectSummary: SubjectSummary[];
  subjectBans: SubjectBan[];
  evalTargets: Record<string, boolean>;
  evalSubjects: SubjectSummary[];
  compat: CompatGroup[];
  compatOverflow: boolean;
  students: Student[];
  timetable: Timetable;
  placement: PlacementGrid;
  studentPlacements?: Record<number, Record<string, string>>;
  lockedCells?: Record<number, Record<string, boolean>>;
  slotRoomCapacity?: SlotRoomCapacity;
  attendance: AttendanceRow[];
  subjectCodes: Record<string, string>;
  ui: {
    selectedTimetableSlot: SlotKey | null;
    selectedPlacementCell: { slot: number; roomId: string } | null;
    report: { day: DayLabel | null; period: PeriodLabel | null; room: string | null; ban: string | null; studentIdx: number | null; labelSelection: number[] }
  };
}

export interface AppState {
  activeGrade: GradeId;
  gradeData?: Partial<Record<GradeId, GradeData>>;
  meta: AppMeta; settings: Settings; stages: Stages;
  neis: NeisRow[];
  days: ExamDay[]; times: ExamTime[]; rooms: ExamRoom[];
  subjectSummary: SubjectSummary[]; subjectBans: SubjectBan[];
  evalTargets: Record<string, boolean>;
  evalSubjects: SubjectSummary[]; compat: CompatGroup[]; compatOverflow: boolean;
  students: Student[];
  timetable: Timetable;
  placement: PlacementGrid;
  studentPlacements?: Record<number, Record<string, string>>;
  lockedCells?: Record<number, Record<string, boolean>>;
  slotRoomCapacity?: SlotRoomCapacity;
  attendance: AttendanceRow[];
  subjectCodes: Record<string, string>;
  ui: {
    selectedTimetableSlot: SlotKey | null;
    selectedPlacementCell: { slot: number; roomId: string } | null;
    report: { day: DayLabel | null; period: PeriodLabel | null; room: string | null; ban: string | null; studentIdx: number | null; labelSelection: number[] }
  };
}
