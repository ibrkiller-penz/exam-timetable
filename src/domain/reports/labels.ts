import { LabelRow, PlacementSlot, PlacementGrid, ExamRoom, ExamDay, ExamTime, SubjectBanKey, SubjectBanEntry, DayLabel, PeriodLabel, isUsableRoom, isWaitCell } from '../types';
import { onlySubject } from '../util/text';
import { BanLabelConfig, banSuffix } from '../banLabel';

export function buildLabels(
  placementSlots: PlacementSlot[],
  placement: PlacementGrid,
  rooms: ExamRoom[],
  days: ExamDay[],
  times: ExamTime[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  banCfg?: BanLabelConfig
): LabelRow[] {
  const out: LabelRow[] = [];
  let seq = 0;

  for (const ps of placementSlots) {
    const dayDate = days[ps.day - 1]?.date ?? '';
    const timeObj = times.find(t => t.day === ps.day && t.period === ps.period);
    const timeStr = timeObj?.time ? timeObj.time.replace(/\s/g, '') : '';

    for (const r of rooms.filter(isUsableRoom)) {
      const v = placement[ps.index]?.[r.id] ?? '';
      if (!v || v === '' || isWaitCell(v) || v === '배치금지') continue;

      const e = entries.get(v);
      const hyphenIdx = v.lastIndexOf('-');
      const cleanSubject = hyphenIdx !== -1 ? v.slice(0, hyphenIdx).trim() : v.trim();
      const banLabel = hyphenIdx !== -1 ? v.slice(hyphenIdx + 1).trim() : '';

      out.push({
        seq: ++seq,
        day: `${ps.day}일차` as DayLabel,
        period: `${ps.period}교시` as PeriodLabel,
        date: dayDate,
        time: timeStr,
        subject: cleanSubject,
        examRoom: r.roomName,
        // 화면에서 정한 분반 표기를 그대로 씁니다 (가나다 / ABC / 직접 지정 / 표시 안 함).
        classRoom: banSuffix(e ? e.room : banLabel, ps.index, r.id, banCfg),
        stuCount: e ? e.stuCount : 0,
      });
    }
  }

  return out;
}
