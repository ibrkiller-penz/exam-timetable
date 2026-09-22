import { ExamRoom, ExamDay, ExamTime, PlacementSlot, PlacementGrid, SubjectBanKey, SubjectBanEntry, Student, isUsableRoom, isWaitCell } from '../types';
import { getForTime } from '../util/time';
import { cellDerived } from '../placement';
import { BanLabelConfig, banSuffix } from '../banLabel';
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
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  banCfg?: BanLabelConfig,
  /**
   * 실제로 어느 방에 몇 명이 앉았는지. 주면 이 수를 씁니다.
   *
   * 예전에는 칸 이름만 보고 인원을 적었습니다. 편성현황의 분반 인원이나
   * 대기 칸 이름에 적힌 숫자였습니다. 그래서 손으로 학생을 옮기면 이 표만
   * 옛 숫자를 보여 주었고, 학번순으로 나눈 칸(`수학(4)-1실`)은 편성현황에
   * 없어 인원이 점으로 빠지고 인원계까지 어긋났습니다.
   */
  students?: Student[],
  studentPlacements?: Record<number, Record<string, string>>
): { columns: ExamRoom[]; rows: GradeTableRow[] } {
  const cols = rooms.filter(isUsableRoom);
  const rows: GradeTableRow[] = [];

  /** 그 교시 그 방에 실제로 앉은 사람 수. 셀 수 없으면 null. */
  const seatedCount = (slotIndex: number, roomId: string): number | null => {
    const sp = studentPlacements?.[slotIndex];
    if (!sp || !students || students.length === 0) return null;
    return students.filter(st => sp[`${st.ban}-${st.num}`] === roomId).length;
  };

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

      if (!v || v === '' || v === '배치금지') {
        displaySubj = '·';
        displayCount = '·';
      } else if (isWaitCell(v)) {
        displaySubj = '대기';
        const real = seatedCount(ps.index, c.id);
        const d = cellDerived(v, entries);
        displayCount = real ?? (typeof d.stuCount === 'number' ? d.stuCount : '·');
        if (typeof displayCount === 'number') slotTotal += displayCount;
      } else {
        const hyphenIdx = v.lastIndexOf('-');
        const rawSubj = hyphenIdx !== -1 ? v.slice(0, hyphenIdx).trim() : v.trim();
        const real = seatedCount(ps.index, c.id);
        const d = cellDerived(v, entries);
        displayCount = real ?? (typeof d.stuCount === 'number' ? d.stuCount : '·');
        if (typeof displayCount === 'number') slotTotal += displayCount;

        // 분반 표기가 있으면 고사실마다 '과목 가반'처럼 붙여 어느 분반인지 드러냅니다.
        // 표기를 쓰지 않는 학교에서는 예전처럼 같은 과목이 이어지면 한 번만 적습니다.
        const suffix = banSuffix(hyphenIdx !== -1 ? v.slice(hyphenIdx + 1).trim() : '', ps.index, c.id, banCfg);
        if (suffix) {
          displaySubj = `${rawSubj} ${suffix}`;
          oldSubj = rawSubj;
        } else if (oldSubj !== rawSubj) {
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
