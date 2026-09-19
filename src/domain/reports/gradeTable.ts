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
      dateText = `${d.format('M. D.')}\n(${d.format('dd')})`;
    }

    const duration = getForTime(timeStr);
    const periodLabel = `${ps.period}교시(${duration})`;
    const timeRange = timeStr.replace(/\s/g, '');

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
