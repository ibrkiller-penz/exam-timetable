const fs = require('fs');
const path = require('path');

function write(relPath, content) {
  const fullPath = path.join(__dirname, '..', relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Wrote ' + relPath);
}

// 1. types.ts
write('src/domain/types.ts', `
export type DayIdx = 1 | 2 | 3 | 4 | 5;
export type PeriodIdx = 1 | 2 | 3 | 4 | 5;
export type DayLabel = \`\${DayIdx}일차\`;
export type PeriodLabel = \`\${PeriodIdx}교시\`;
export type SlotKey = \`\${DayIdx}_\${PeriodIdx}\`;
export const slotKey = (d: DayIdx, p: PeriodIdx): SlotKey => \`\${d}_\${p}\`;

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
}
export const isExtraRoom = (r: ExamRoom): boolean =>
  (r.maxClassSize === null || r.maxClassSize === 0) && r.capacity > 0;
export const isUsableRoom = (r: ExamRoom): boolean =>
  r.roomName !== '' && r.roomName !== '0' && r.capacity >= 0;

export interface SubjectSummary { subject: string; banCount: number; stuCount: number; }
export interface SubjectBan     { subject: string; room: string; stuCount: number; subjectSeq: number; }
export type SubjectBanKey = string;
export interface SubjectBanEntry extends SubjectBan { key: SubjectBanKey; index: number; }

export interface CompatGroup { subjects: string[]; banCount: number; stuCount: number; nonTakers: number; }

export interface Student { grade: string; ban: string; num: number; name: string; subjects: string[]; }
export type StudentKey = string;
export const studentKey = (s: { ban: string; num: number }): StudentKey => \`\${s.ban}\${s.num}\`;

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
export const isWaitCell = (v: CellValue): boolean => v.startsWith('대기 -');
export const parseWaitCount = (v: CellValue): number => Number(v.slice(5).replace('명', '').trim());
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
export interface Settings {
  maxSubjectsPerSlot: number;
  seatColumns: number;
  seatsPerColumn: number;
  labelsPerPage: number;
  showSeatOnStudentTable: boolean;
}
export interface Stages { stage1: boolean; stage2: boolean; stage3: boolean; stage4: boolean; stage5: boolean; }
export interface AppState {
  meta: AppMeta; settings: Settings; stages: Stages;
  neis: NeisRow[];
  days: ExamDay[]; times: ExamTime[]; rooms: ExamRoom[];
  subjectSummary: SubjectSummary[]; subjectBans: SubjectBan[];
  evalTargets: Record<string, boolean>;
  evalSubjects: SubjectSummary[]; compat: CompatGroup[]; compatOverflow: boolean;
  students: Student[];
  timetable: Timetable;
  placement: PlacementGrid;
  attendance: AttendanceRow[];
  subjectCodes: Record<string, string>;
  ui: {
    selectedTimetableSlot: SlotKey | null;
    selectedPlacementCell: { slot: number; roomId: string } | null;
    report: { day: DayLabel | null; period: PeriodLabel | null; room: string | null; ban: string | null; studentIdx: number | null; labelSelection: number[] }
  };
}
`);

// 2. constants.ts
write('src/domain/constants.ts', `
import { DayIdx, PeriodIdx, ExamDay, ExamTime, Timetable } from './types';

export const DAYS: DayIdx[] = [1, 2, 3, 4, 5];
export const PERIODS: PeriodIdx[] = [1, 2, 3, 4, 5];
export const DEFAULT_TIME = '09:00 ~ 9:50';
export const EXTRA_ROOM_DEFAULT = 30;
export const MAX_COMPAT = 999;
export const APP_VERSION = '1.0.0';

export const createInitialDays = (): ExamDay[] => [
  { day: 1, date: null },
  { day: 2, date: null },
  { day: 3, date: null },
  { day: 4, date: null },
  { day: 5, date: null },
];

export const createInitialTimes = (): ExamTime[] => {
  const times: ExamTime[] = [];
  for (const day of DAYS) {
    for (const period of PERIODS) {
      times.push({ day, period, time: null });
    }
  }
  return times;
};

export const createInitialTimetable = (): Timetable => {
  const tt: Partial<Timetable> = {};
  for (const d of DAYS) {
    for (const p of PERIODS) {
      tt[\`\${d}_\${p}\`] = { subjects: [] };
    }
  }
  return tt as Timetable;
};
`);

console.log('Part 1 written.');
