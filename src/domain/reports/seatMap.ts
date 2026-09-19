import { AttendanceRow, DayLabel, PeriodLabel } from '../types';
import { hakbun } from '../util/text';

export interface SeatCell {
  seat: number;
  physicalSeatNum: number;
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


export function calcPhysicalSeatNum(
  assignSeq: number,
  cols: number,
  totalStudents: number,
  direction: 'col' | 'row',
  customRows?: number
): number {
  if (direction === 'col') return assignSeq;
  
  const minRows = Math.ceil(totalStudents / cols);
  const rowsPerColumn = (customRows && customRows >= minRows) ? customRows : minRows;
  
  const r = Math.ceil(assignSeq / cols);
  const c = assignSeq - (r - 1) * cols;
  return (c - 1) * rowsPerColumn + r;
}

export function buildSeatMapReport(
  attendance: AttendanceRow[],
  day: DayLabel,
  period: PeriodLabel,
  examRoom: string,
  cols: number = 5,
  direction: 'col' | 'row' = 'col',
  rows?: number
): SeatMapReportData | null {
  const filtered = attendance.filter(
    r => r.day === day && r.period === period && r.examRoom === examRoom
  );
  if (filtered.length === 0) return null;

  const first = filtered[0];
  const isWaitRoom = first.subject === '미응시';
  const totalStudents = filtered.length;
  
  // Use provided rows if valid (must be large enough), otherwise auto-calculate
  const minRows = Math.ceil(totalStudents / cols);
  const rowsPerColumn = (rows && rows >= minRows) ? rows : minRows;

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
      const physicalSeatNum = (c - 1) * rowsPerColumn + r;
      const assignSeq = direction === 'col' 
        ? physicalSeatNum
        : (r - 1) * cols + c;
        
      if (assignSeq <= totalStudents) {
        const rowData = seatMap.get(assignSeq);
        colCells.push({
          seat: assignSeq,
          physicalSeatNum: physicalSeatNum,
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
