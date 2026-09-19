import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// 3. messages.ts
write('src/domain/messages.ts', `
export const MSG = {
  NEIS_NOT_FILE_1: '나이스 학생편성현황 파일이 아닙니다.',
  NEIS_NOT_FILE_2: '나이스 학생편성현황 파일이 아닙니다..',
  NEIS_NOT_FILE_3: '나이스 학생편성현황 파일이 아닙니다...',
  NEIS_NOT_FILE_4: '나이스 학생편성현황 파일이 아닙니다....',
  NEIS_REMOVED: '미재학 학생은 삭제하였습니다.\\n\\n성명 예시: (미재학) 홍길동',
  
  S1_LOCKED: '학생편성현황이 확정 상태입니다. 확정 취소하고 시도하세요.',
  S1_NO_FILE: '먼저 나이스 학생편성현황 파일을 선택하십시오.',
  S1_CANCEL_CONFIRM: '확정 취소할까요?\\n\\n배치 내역이 있으면 모두 삭제됩니다.',
  S1_MOVE_SELECT: '편의반으로 이동시킬 학생을 선택하고 버튼을 누르세요.',
  S1_MOVE_CONFIRM: (ban: string, num: number, name: string) =>
    \`【 \${ban} \${num}번  \${name} 】 ← 편의반으로 이동시킬까요?\\n\\n(주의) 취소하려면 나이스 학생편성현황 파일을 다시 선택하여야 합니다.\`,
  S1_DEL_SELECT: '삭제할 학생을 선택하고 버튼을 누르세요.',
  S1_DEL_CONFIRM: (ban: string, num: number, name: string) =>
    \`【 \${ban} \${num}번  \${name} 】 ← 삭제할까요?\`,
  S1_DEL_NOTFOUND: '해당 학생이 존재하지 않습니다.',
  S1_DELALL_NONE: '삭제할 데이터가 없습니다.',
  S1_DELALL_CONFIRM: '모든 데이터를 삭제할까요?',
  S1_GUIDE_NEXT: '삭제할 학생이 더 이상 없으면 학생편성현황을 확정하고 [2.기초정보] 단계로 이동하세요.',
  S1_GUIDE_DONE: '[2.기초정보] 단계로 이동하세요.',

  S2_GUIDE_NOFILE: '(주의) [1.편성현황] 시트에서 나이스 학생편성현황 파일 가져오기를 먼저 실행하세요.',
  S2_GUIDE_NOCONFIRM: '(주의) 먼저 학생편성현황을 확정하세요.',
  S2_GUIDE_NEXT: '입력을 완료하고 [3.과목] 단계로 이동하세요.',
  S2_HELP_1: '← 고사실명과 최대 수용인원은 수정 가능합니다.',
  S2_HELP_2: '최대 수용인원: 고사실, 대기실로 사용될 때 최대 배치 인원(책상 수 고려)',
  S2_HELP_3: '별도실: 학반이 아닌 특별실에서 고사를 치를 때 사용합니다. 명칭과 최대 수용인원 변경 가능',
  S2_HELP_4: '(중요) 시험을 치는 학생은 별도실로 이동하고, 남은 학생들은 소속 학반에서 자습하는 경우 필요한 고사실 수만큼의 별도실을 입력하세요. (편의반도 별도실 필요)',

  S3_CONV: '※ 편의반도 반수에 포함됩니다.',
  S3_READONLY: '조회만 가능합니다.',
  S3_NEXT: '이상이 없으면 [4.평가과목] 단계로 이동하세요.',

  S4_NEED_S1: '[1.학생편성현황]을 확정하세요.',
  S4_NEED_O: '평가 대상을 체크하세요.',
  S4_CONFIRM_N: (n: number) => \`\${n}개 과목을 평가하시겠습니까?\`,
  S4_LOCKED: '평가 대상 과목이 확정되었습니다.',
  S4_GUIDE_DONE: '평가 대상 과목을 확정하였습니다.',
  S4_GUIDE_ENTER_O: '← 평가 대상을 체크하세요.',
  S4_GUIDE_CLICK: '평가 대상을 모두 체크했으면 \\'확정\\'을 누르세요.',
  S4_GUIDE_PENDING: '미확정 상태입니다.',
  S4_GUIDE_NEXT: '평가 과목 및 동시 시험 가능 과목을 확인하고 [5.학생과목] 단계로 이동하세요.\\n평가 과목을 다시 지정하려면 \\'확정 취소\\'를 누르세요.',
  S4_CANCEL_TT: '고사시간표가 확정된 상태입니다.\\n\\n고사시간표를 삭제하고, 평가 대상 과목 확정을 취소할까요?',
  S4_TOO_MANY: '고사시간표 작성이 불가능합니다. 과목이 너무 많습니다.',

  S5_READONLY: '조회만 가능합니다. 이상이 없으면 [6.시간표작성]으로 이동하세요.',

  S6_NEED_S2: '먼저 평가과목을 확정하세요.',
  S6_DONE: '고사시간표를 확정하였습니다. [7.학생배치] 단계로 이동하세요.',
  S6_DUP: '중복으로 편성된 과목이 있습니다.',
  S6_ALL: '모두 편성하였습니다. 이상이 없으면 \\'시간표 확정\\'을 누르세요.',
  S6_REMAIN: (list: string) => \`미편성한 과목이 있습니다.\\n\\n미편성 과목: \${list}\`,
  S6_HAS_ERROR: '오류가 있습니다.',
  S6_ST_NO_TIME: '오류: 고사 시간이 누락되었습니다. 기초정보 확인',
  S6_ST_NO_DATE: '오류: 고사 일자가 누락되었습니다. 기초정보 확인',
  S6_ST_CONFLICT: '오류: 동시 시험 불가',
  S6_ST_OK: ' 정상',
  S6_ST_ERR: '오류',
  S6_LOAD_ERR: '오류: 동시시험 불가',
  S6_CAN_BELOW: '동시 편성 가능 과목이 화면 아래쪽에 있습니다.',
  S6_CAN_HEADER: (d: number, p: number) => \`\${d}일차 \${p}교시 편성 가능 과목 ☞ \`,
  S6_REMAIN_HEADER: '미편성 과목 ☞ ',
  S6_ALL_DONE_TEXT: '모두 편성하였습니다.',
  S6_SWAP_SELECT: '교환할 과목 2개를 선택하세요.',
  S6_LOCKED: '시간표가 확정되었습니다.',
  S6_CANCEL_BAECHI: '학생 배치가 확정된 상태입니다.\\n\\n학생 배치를 취소하고, 고사시간표도 확정 취소할까요?',
  S6_MODAL_TITLE: (d: number, n: number, count: number) => \`\${d}일차 \${n}과목: \${count}명\`,

  S7_NEED_S3: '고사시간표가 미확정 상태입니다. \\n\\n먼저 고사시간표를 확정하세요.',
  S7_LOCKED: '배치가 확정되었습니다.\\n\\n수정하려면 \\'배치 확정 취소\\' 하세요.',
  S7_DONE: '확정하였습니다. [8.응시현황] 단계로 이동하세요.',
  S7_ALL: '모두 배치하였습니다. 확정할 수 있습니다.',
  S7_ERR_1: '응시 인원을 초과하여 배치하였습니다.',
  S7_ERR_2: '응시 인원을 배치하세요. 빈 셀 더블클릭.',
  S7_ERR_3: '대기(미응시) 인원을 배치하세요.',
  S7_ERR_4: '대기(미응시) 인원을 초과하여 배치하였습니다.',
  S7_SELECT_CELL: '배치할 고사실의 \\'과목-반\\' 셀을 선택하세요.\\n또는 고사실 셀을 더블클릭해도 배치창이 나타납니다.',
  S7_ONE_CELL: '셀을 하나만 선택하세요.',
  S7_DEL_SLOT: '선택한 교시의 배치를 초기화할까요?',
  S7_DEL_ALL: '모든 교시의 배치를 초기화할까요?',
  S7_DEL_SLOT2: (title: string) => \`\${title} 배치 내역을 모두 삭제할까요?\`,
  S7_AUTO_ALL: '모든 교시(고사실)에 학생들을 자동 배치할까요?\\n\\n※ 대기실에는 소속학생 우선 및 최대 수용인원을 배치됩니다.',
  S7_AUTO_EXTRA: (title: string, subs: string, n: number, m: number) =>
    \`♥ \${title} 수험생을 별도 고사실에 배치할까요?\\n\\n시험 과목: \${subs}\\n필요 고사실 수: \${n}\\n별도 고사실 수: \${m}\`,
  S7_WAIT_NOMORE: '대기 인원은 더 이상 배치할 수 없습니다.',
  S7_WAIT_LEFT: (n: number) => \`대기 인원이 \${n}명 남았습니다.\\n\\n\${n}을 배치할까요?\`,
  S7_CANCEL_SEAT: '응시현황이 확정 상태입니다. \\n응시현황 확정을 취소하고, 배치를 확정 취소할까요?',
  S7_CANCEL_SIMPLE: '확정 취소할까요?',
  S7_DUP_BAN: (v: string) => \`\${v}    ☜   중복 편성되었습니다.\`,
  S7_WRONG_SUBJ: (v: string, list: string) => \`\${v} ← 과목이 잘못 편성되었습니다.\\n\\n가능과목: \${list}\`,
  S7_ROOM_MISSING: '고사실명이 누락되었습니다.',
  S7_ROOM_DUP: '고사실명 중복되었습니다.',
  S7_STU_COUNT: (subject: string, n: number) => \`학생수 오류\\n\${subject} \${n}명\`,
  S7_WAIT_MOVED: (d: number, p: number, room: string, ban: string, n: number) =>
    \`\${d}일차 \${p}교시 \${room}실(\${ban}) 대기 인원 \${n}명이 다른 대기실로 이동 되었습니다.\`,
  S7_WAIT_UNPLACED: '대기실에 배치되지 않은 인원 존재',
  S7_ROOMINFO_TITLE: (room: string, subject: string) => \`【\${room}】  \${subject}\`,

  S8_NEED_S4: '먼저 학생 배치를 확정하세요.',
  S8_LOCKED: '응시현황이 확정되었기 때문에 실행할 수 없습니다.\\n\\n확정 취소 후 시도하세요.',
  S8_SEAT_SEQ: '좌석번호를 학번순으로 지정할까요?',
  S8_SEAT_RAND: '좌석번호를 랜덤으로 지정할까요?\\n\\n※ 대기실은 제외됩니다.',
  S8_GUIDE_ENTER_SEAT: '좌석번호를 부여하세요.',
  S8_GUIDE_READY: '이상이 없으면 \\'응시현황 확정\\'을 누르세요.',
  S8_GUIDE_DONE: '응시현황(좌석번호)을 확정하였습니다. 고사시간표 작성완료!!!',
  S8_NO_SEAT: (n: number) => \`좌석번호가 부여되지 않은 행이 \${n}건 존재합니다.\`,
  S8_ERR_ROOM_DUP: (room: string) => \`\${room} <- 고사실명이 중복되었습니다. [2.기초정보]\`,
  S8_ERR_MISSING: (k: string) => \`\${k}: 배치가 누락되었습니다.\`,
  S8_ERR_WRONG_SUBJ: (k: string, subj: string) => \`\${k} : \${subj} 배치된 과목명이 이상합니다.\`,
  S8_ERR_WRONG_ROOM: (k: string, room: string) => \`\${k} \${room} <- 고사실명이 이상합니다.\`,
  S8_ERR_WRONG_SEAT: (k: string, seat: any) => \`\${k} \${seat} <- 좌석번호가 이상합니다.\`,
  S8_ERR_UNPLACED_SUBJ: (ban: string, num: number) => \`\${ban}\${num}번 배치되지 않은 과목이 있습니다.\`,
  S8_DONE: '확정하였습니다.',
  S8_CANCEL: '응시현황 확정을 취소할까요?',

  R_NOT_CONFIRMED: '응시현황이 미확정 상태입니다.',
  R_COUNT_MISMATCH: '응시인원이 이상합니다.',
  R4_COLS_ERR: '← 오류: 열의 수가 너무 작습니다.',
  R4_COLS_OK: '← 수정 가능',
  R6_UNPLACED: (subject: string) => \`오류: \${subject} ← 배치되지 않았습니다.\`,
  R_PRINT_ALL_ROOMS: (n: number) => \`\${n}개 고사실을 모두 인쇄할까요?\`,
  R_PRINT_ALL_PERIODS: (n: number) => \`\${n}개 교시를 모두 인쇄할까요?\`,
  R_PRINT_ALL_STUDENTS: (n: number) => \`\${n}명을 모두 인쇄할까요?\`,
  R_PRINT_BAN: (ban: string) => \`\${ban}을 인쇄할까요?\`,
  R_PRINT_LABELS: (n: number) => \`\${n}개를 인쇄할까요?\`,

  TITLE_DEFAULT: '2026학년도 X학년 2학기 중간고사  시험시간표'
};
`);

// 4. util/vbaVal.ts
write('src/domain/util/vbaVal.ts', `
export function vbaVal(s: string): number {
  if (!s) return 0;
  const trimmed = s.trim();
  const match = /^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))/.exec(trimmed);
  if (!match || !match[1]) return 0;
  const num = Number(match[1]);
  return isNaN(num) ? 0 : num;
}
`);

// 5. util/sort.ts
write('src/domain/util/sort.ts', `
export function stableSort<T>(array: T[], compareFn: (a: T, b: T) => number): T[] {
  return array
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const order = compareFn(a.item, b.item);
      return order !== 0 ? order : a.index - b.index;
    })
    .map(({ item }) => item);
}

export function compareBanNameEmptyLast(a: string, b: string): number {
  if (a === '' && b === '') return 0;
  if (a === '') return 1;
  if (b === '') return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
`);

// 6. util/text.ts
write('src/domain/util/text.ts', `
export function onlySubject(subject: string): string {
  if (!subject) return '';
  const idx = subject.lastIndexOf('(');
  if (idx !== -1 && subject.endsWith(')')) {
    return subject.slice(0, idx).trim();
  }
  return subject.trim();
}

export function hakbun(grade: string, ban: string, num: number): string {
  const g = grade ? grade.charAt(0) : '1';
  const b = ban.length > 3 ? ban : ban.replace('반', '').padStart(2, '0');
  const n = String(num).padStart(2, '0');
  return \`\${g}\${b}\${n}\`;
}
`);

// 7. util/time.ts
write('src/domain/util/time.ts', `
export function getForTime(timeStr: string | null): string {
  if (!timeStr) return 'XX분';
  const clean = timeStr.replace(/\\s/g, '');
  const parts = clean.split('~');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 'XX분';
  
  const parseMin = (t: string): number | null => {
    const [hStr, mStr] = t.split(':');
    if (!hStr || !mStr) return null;
    const h = Number(hStr);
    const m = Number(mStr);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };
  
  const t1 = parseMin(parts[0]);
  const t2 = parseMin(parts[1]);
  if (t1 === null || t2 === null) return 'XX분';
  const diff = t2 - t1;
  return \`\${diff}분\`;
}
`);

console.log('Part 1-2 written.');
