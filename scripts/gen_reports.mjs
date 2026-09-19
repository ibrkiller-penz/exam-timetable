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

// 1. gradeTable.ts (9-1)
write('src/domain/reports/gradeTable.ts', `
import { ExamRoom, ExamDay, ExamTime, PlacementSlot, PlacementGrid, SubjectBanKey, SubjectBanEntry, isUsableRoom, isWaitCell } from '../types';
import { getForTime } from '../util/time';
import { cellDerived } from '../placement';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export interface GradeTableRow {
  dateText: string;
  periodLabel: string;
  timeRange: string;
  isFirstOfDate: boolean;
  dateRowSpan: number;
  cells: Array<{ subject: string; stuCount: number | '·' }>;
  totalStuCount: number;
}

export function buildGradeTable(
  rooms: ExamRoom[],
  days: ExamDay[],
  times: ExamTime[],
  placementSlots: PlacementSlot[],
  placement: PlacementGrid,
  entries: Map<SubjectBanKey, SubjectBanEntry>
): { columns: ExamRoom[]; rows: GradeTableRow[] } {
  const cols = rooms.filter(isUsableRoom);
  const rows: GradeTableRow[] = [];

  for (let i = 0; i < placementSlots.length; i++) {
    const ps = placementSlots[i];
    const dayObj = days[ps.day - 1];
    const timeObj = times.find(t => t.day === ps.day && t.period === ps.period);
    const timeStr = (timeObj?.time ?? '').trim();

    let dateText = '';
    if (dayObj?.date) {
      const d = dayjs(dayObj.date).locale('ko');
      dateText = \`\${d.format('M. D.')}\\n(\${d.format('dd')})\`;
    }

    const duration = getForTime(timeStr);
    const periodLabel = \`\${ps.period}교시(\${duration})\`;
    const timeRange = timeStr.replace(/\\s/g, '');

    const cells: Array<{ subject: string; stuCount: number | '·' }> = [];
    let oldSubj = '';
    let slotTotal = 0;

    for (const c of cols) {
      const v = placement[ps.index]?.[c.id] ?? '';
      let displaySubj = '';
      let displayCount: number | '·' = '·';

      if (!v || v === '') {
        displaySubj = '·';
        displayCount = '·';
      } else if (isWaitCell(v)) {
        displaySubj = '대기';
        const d = cellDerived(v, entries);
        displayCount = typeof d.stuCount === 'number' ? d.stuCount : '·';
        if (typeof displayCount === 'number') slotTotal += displayCount;
      } else {
        const hyphenIdx = v.lastIndexOf('-');
        const rawSubj = hyphenIdx !== -1 ? v.slice(0, hyphenIdx).trim() : v.trim();
        const d = cellDerived(v, entries);
        displayCount = typeof d.stuCount === 'number' ? d.stuCount : '·';
        if (typeof displayCount === 'number') slotTotal += displayCount;

        if (oldSubj !== rawSubj) {
          displaySubj = rawSubj;
          oldSubj = rawSubj;
        } else {
          displaySubj = '';
        }
      }

      cells.push({ subject: displaySubj, stuCount: displayCount });
    }

    rows.push({
      dateText,
      periodLabel,
      timeRange,
      isFirstOfDate: false,
      dateRowSpan: 1,
      cells,
      totalStuCount: slotTotal,
    });
  }

  let curDate = '';
  let curStart = 0;
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].dateText !== curDate) {
      if (curDate !== '') {
        rows[curStart].isFirstOfDate = true;
        rows[curStart].dateRowSpan = r - curStart;
      }
      curDate = rows[r].dateText;
      curStart = r;
    }
  }
  if (rows.length > 0 && curDate !== '') {
    rows[curStart].isFirstOfDate = true;
    rows[curStart].dateRowSpan = rows.length - curStart;
  }

  return { columns: cols, rows };
}
`);

// 2. examRoom.ts (9-2)
write('src/domain/reports/examRoom.ts', `
import { AttendanceRow, DayLabel, PeriodLabel } from '../types';
import { hakbun } from '../util/text';

export interface ExamRoomReportData {
  day: DayLabel;
  period: PeriodLabel;
  examRoom: string;
  subject: string;
  isWaitRoom: boolean;
  totalStudents: number;
  students: Array<{
    seq: number;
    hakbun: string;
    name: string;
    seat: number | null;
    note: string;
  }>;
}

export function buildExamRoomReport(
  attendance: AttendanceRow[],
  day: DayLabel,
  period: PeriodLabel,
  examRoom: string
): ExamRoomReportData | null {
  const filtered = attendance.filter(
    r => r.day === day && r.period === period && r.examRoom === examRoom
  );
  if (filtered.length === 0) return null;

  const first = filtered[0];
  const isWaitRoom = first.subject === '미응시';

  const students = filtered
    .sort((a, b) => a.seq - b.seq)
    .map(r => ({
      seq: r.seq,
      hakbun: hakbun(r.grade, r.ban, r.num),
      name: r.name,
      seat: r.seat,
      note: '',
    }));

  return {
    day,
    period,
    examRoom,
    subject: first.subject,
    isWaitRoom,
    totalStudents: students.length,
    students,
  };
}
`);

// 3. roomTimetable.ts (9-3)
write('src/domain/reports/roomTimetable.ts', `
import { AttendanceRow, ExamDay, ExamTime, ExamRoom, DayIdx, PeriodIdx, DayLabel, PeriodLabel } from '../types';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export interface RoomTimetableCell {
  subject: string;
  stuCount: number | '';
  timeStr: string;
}

export interface RoomTimetableReportData {
  room: ExamRoom;
  activeDays: Array<{ day: DayIdx; label: string; dateText: string }>;
  activePeriods: PeriodIdx[];
  grid: Record<PeriodIdx, Record<DayIdx, RoomTimetableCell>>;
}

export function buildRoomTimetableReport(
  room: ExamRoom,
  attendance: AttendanceRow[],
  days: ExamDay[],
  times: ExamTime[]
): RoomTimetableReportData {
  const activeDays = days
    .filter(d => d.date && d.date.trim() !== '')
    .map(d => {
      const parsed = dayjs(d.date).locale('ko');
      return {
        day: d.day,
        label: \`\${d.day}일차\`,
        dateText: \`\${parsed.format('M. D.')}(\${parsed.format('dd')})\`,
      };
    });

  const activePeriods = [1, 2, 3, 4, 5].filter(p =>
    times.some(t => t.period === p && t.time && t.time.trim() !== '')
  ) as PeriodIdx[];

  const grid: Record<PeriodIdx, Record<DayIdx, RoomTimetableCell>> = {} as any;

  for (const p of activePeriods) {
    grid[p] = {} as any;
    for (const d of activeDays) {
      const timeObj = times.find(t => t.day === d.day && t.period === p);
      const timeStr = timeObj?.time ? timeObj.time.replace(/\\s/g, '') : '';

      const dayLabel: DayLabel = \`\${d.day}일차\`;
      const periodLabel: PeriodLabel = \`\${p}교시\`;
      const matched = attendance.filter(
        r => r.day === dayLabel && r.period === periodLabel && r.examRoom === room.roomName
      );

      if (matched.length > 0) {
        const first = matched[0];
        grid[p][d.day] = {
          subject: first.subject === '미응시' ? '대기실' : first.subject,
          stuCount: matched.length,
          timeStr,
        };
      } else {
        const anyInSlot = attendance.some(
          r => r.day === dayLabel && r.period === periodLabel
        );
        if (!anyInSlot && room.banName && room.banName !== '위탁학생') {
          grid[p][d.day] = {
            subject: '자습',
            stuCount: room.stuCount ?? '',
            timeStr,
          };
        } else {
          grid[p][d.day] = {
            subject: '',
            stuCount: '',
            timeStr: '',
          };
        }
      }
    }
  }

  return {
    room,
    activeDays,
    activePeriods,
    grid,
  };
}
`);

// 4. seatMap.ts (9-4)
write('src/domain/reports/seatMap.ts', `
import { AttendanceRow, DayLabel, PeriodLabel } from '../types';
import { hakbun } from '../util/text';

export interface SeatCell {
  seat: number;
  hakbun: string;
  name: string;
}

export interface SeatMapReportData {
  day: DayLabel;
  period: PeriodLabel;
  examRoom: string;
  subject: string;
  isWaitRoom: boolean;
  totalStudents: number;
  columns: number;
  rowsPerColumn: number;
  grid: SeatCell[][]; // [column][row] (from front row to back)
  studentList: Array<{
    seq: number;
    hakbun: string;
    name: string;
    seat: number | null;
  }>;
}

export function buildSeatMapReport(
  attendance: AttendanceRow[],
  day: DayLabel,
  period: PeriodLabel,
  examRoom: string,
  cols: number = 5
): SeatMapReportData | null {
  const filtered = attendance.filter(
    r => r.day === day && r.period === period && r.examRoom === examRoom
  );
  if (filtered.length === 0) return null;

  const first = filtered[0];
  const isWaitRoom = first.subject === '미응시';
  const totalStudents = filtered.length;
  const rowsPerColumn = Math.ceil(totalStudents / cols);

  const seatMap = new Map<number, AttendanceRow>();
  for (const r of filtered) {
    if (r.seat !== null) {
      seatMap.set(r.seat, r);
    }
  }

  const grid: SeatCell[][] = [];
  for (let c = 1; c <= cols; c++) {
    const colCells: SeatCell[] = [];
    for (let r = 1; r <= rowsPerColumn; r++) {
      const seatNum = (c - 1) * rowsPerColumn + r;
      if (seatNum <= totalStudents) {
        const rowData = seatMap.get(seatNum);
        colCells.push({
          seat: seatNum,
          hakbun: rowData ? hakbun(rowData.grade, rowData.ban, rowData.num) : '',
          name: rowData ? rowData.name : '',
        });
      }
    }
    grid.push(colCells);
  }

  const studentList = filtered
    .sort((a, b) => a.seq - b.seq)
    .map(r => ({
      seq: r.seq,
      hakbun: hakbun(r.grade, r.ban, r.num),
      name: r.name,
      seat: r.seat,
    }));

  return {
    day,
    period,
    examRoom,
    subject: first.subject,
    isWaitRoom,
    totalStudents,
    columns: cols,
    rowsPerColumn,
    grid,
    studentList,
  };
}
`);

// 5. classTable.ts (9-5)
write('src/domain/reports/classTable.ts', `
import { AttendanceRow, ExamDay, ExamTime, ExamRoom, Student, DayIdx, PeriodIdx, DayLabel, PeriodLabel } from '../types';
import { onlySubject } from '../util/text';

export interface ClassTableStudentRow {
  num: number;
  name: string;
  periods: Record<PeriodIdx, { subject: string; room: string }>;
}

export interface ClassTableReportData {
  ban: string;
  day: DayIdx;
  dayDateText: string;
  roomName: string;
  activePeriods: PeriodIdx[];
  students: ClassTableStudentRow[];
}

export function buildClassTableReport(
  ban: string,
  day: DayIdx,
  students: Student[],
  attendance: AttendanceRow[],
  days: ExamDay[],
  times: ExamTime[],
  rooms: ExamRoom[]
): ClassTableReportData {
  const banStudents = students.filter(s => s.ban === ban).sort((a, b) => a.num - b.num);
  const banRoom = rooms.find(r => r.banName === ban)?.roomName ?? '';
  const dayLabel: DayLabel = \`\${day}일차\`;
  const dayDate = days[day - 1]?.date ?? '';

  const activePeriods = [1, 2, 3, 4, 5].filter(p =>
    times.some(t => t.period === p && t.time && t.time.trim() !== '')
  ) as PeriodIdx[];

  const studentRows: ClassTableStudentRow[] = banStudents.map(s => {
    const periodMap: Record<PeriodIdx, { subject: string; room: string }> = {} as any;

    for (const p of activePeriods) {
      const pLabel: PeriodLabel = \`\${p}교시\`;
      const k3 = \`\${s.ban}\${s.num}번\${dayLabel}\${pLabel}\`;
      const att = attendance.find(a => a.key3 === k3);

      if (att) {
        periodMap[p] = {
          subject: att.subject === '미응시' ? '미응시' : onlySubject(att.subject),
          room: att.examRoom,
        };
      } else {
        periodMap[p] = {
          subject: '자습',
          room: banRoom,
        };
      }
    }

    return {
      num: s.num,
      name: s.name,
      periods: periodMap,
    };
  });

  return {
    ban,
    day,
    dayDateText: dayDate,
    roomName: banRoom,
    activePeriods,
    students: studentRows,
  };
}
`);

// 6. studentTable.ts (9-6)
write('src/domain/reports/studentTable.ts', `
import { Student, AttendanceRow, ExamDay, ExamTime, ExamRoom, DayIdx, PeriodIdx, DayLabel, PeriodLabel } from '../types';
import { onlySubject, hakbun } from '../util/text';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export interface StudentTableCell {
  subject: string;
  examRoom: string;
  seat: number | null;
  timeStr: string;
}

export interface StudentTableReportData {
  student: Student;
  hakbun: string;
  activeDays: Array<{ day: DayIdx; dateText: string }>;
  activePeriods: PeriodIdx[];
  grid: Record<PeriodIdx, Record<DayIdx, StudentTableCell>>;
  unplacedSubjects: string[];
}

export function buildStudentTableReport(
  student: Student,
  attendance: AttendanceRow[],
  days: ExamDay[],
  times: ExamTime[],
  rooms: ExamRoom[],
  showSeat: boolean = true
): StudentTableReportData {
  const activeDays = days
    .filter(d => d.date && d.date.trim() !== '')
    .map(d => {
      const parsed = dayjs(d.date).locale('ko');
      return {
        day: d.day,
        dateText: \`\${parsed.format('M. D.')}(\${parsed.format('dd')})\`,
      };
    });

  const activePeriods = [1, 2, 3, 4, 5].filter(p =>
    times.some(t => t.period === p && t.time && t.time.trim() !== '')
  ) as PeriodIdx[];

  const defaultRoom = rooms.find(r => r.banName === student.ban)?.roomName ?? '';
  const grid: Record<PeriodIdx, Record<DayIdx, StudentTableCell>> = {} as any;
  const placedSubjects = new Set<string>();

  for (const p of activePeriods) {
    grid[p] = {} as any;
    for (const d of activeDays) {
      const dayLabel: DayLabel = \`\${d.day}일차\`;
      const pLabel: PeriodLabel = \`\${p}교시\`;
      const k3 = \`\${student.ban}\${student.num}번\${dayLabel}\${pLabel}\`;
      const att = attendance.find(a => a.key3 === k3);

      const timeObj = times.find(t => t.day === d.day && t.period === p);
      const timeStr = timeObj?.time ? timeObj.time.replace(/\\s/g, '') : '';

      if (att) {
        if (att.subject !== '미응시') {
          placedSubjects.add(att.subject);
        }
        grid[p][d.day] = {
          subject: att.subject === '미응시' ? '자습' : onlySubject(att.subject),
          examRoom: att.examRoom,
          seat: showSeat ? att.seat : null,
          timeStr,
        };
      } else {
        grid[p][d.day] = {
          subject: '자습',
          examRoom: defaultRoom,
          seat: null,
          timeStr: '',
        };
      }
    }
  }

  const unplacedSubjects = student.subjects.filter(s => !placedSubjects.has(s));

  return {
    student,
    hakbun: hakbun(student.grade, student.ban, student.num),
    activeDays,
    activePeriods,
    grid,
    unplacedSubjects,
  };
}
`);

// 7. labels.ts (9-7)
write('src/domain/reports/labels.ts', `
import { LabelRow, PlacementSlot, PlacementGrid, ExamRoom, ExamDay, ExamTime, SubjectBanKey, SubjectBanEntry, DayLabel, PeriodLabel, isUsableRoom, isWaitCell } from '../types';
import { onlySubject } from '../util/text';

export function buildLabels(
  placementSlots: PlacementSlot[],
  placement: PlacementGrid,
  rooms: ExamRoom[],
  days: ExamDay[],
  times: ExamTime[],
  entries: Map<SubjectBanKey, SubjectBanEntry>
): LabelRow[] {
  const out: LabelRow[] = [];
  let seq = 0;

  for (const ps of placementSlots) {
    const dayDate = days[ps.day - 1]?.date ?? '';
    const timeObj = times.find(t => t.day === ps.day && t.period === ps.period);
    const timeStr = timeObj?.time ? timeObj.time.replace(/\\s/g, '') : '';

    for (const r of rooms.filter(isUsableRoom)) {
      const v = placement[ps.index]?.[r.id] ?? '';
      if (!v || v === '' || isWaitCell(v)) continue;

      const e = entries.get(v);
      if (!e) continue;

      const hyphenIdx = v.lastIndexOf('-');
      const cleanSubject = hyphenIdx !== -1 ? v.slice(0, hyphenIdx) : v;

      out.push({
        seq: ++seq,
        day: \`\${ps.day}일차\` as DayLabel,
        period: \`\${ps.period}교시\` as PeriodLabel,
        date: dayDate,
        time: timeStr,
        subject: cleanSubject,
        examRoom: r.roomName,
        classRoom: e.room,
        stuCount: e.stuCount,
      });
    }
  }

  return out;
}
`);

console.log('Part 3 written.');
