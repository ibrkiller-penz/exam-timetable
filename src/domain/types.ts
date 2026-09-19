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
  attendance: AttendanceRow[];
  subjectCodes: Record<string, string>;
  ui: {
    selectedTimetableSlot: SlotKey | null;
    selectedPlacementCell: { slot: number; roomId: string } | null;
    report: { day: DayLabel | null; period: PeriodLabel | null; room: string | null; ban: string | null; studentIdx: number | null; labelSelection: number[] }
  };
}
