import { LabelRow, PlacementSlot, PlacementGrid, ExamRoom, ExamDay, ExamTime, SubjectBanKey, SubjectBanEntry, DayLabel, PeriodLabel, isUsableRoom, isWaitCell, Student, SeparateExaminers, separateRoomFor } from '../types';
import { onlySubject } from '../util/text';
import { BanLabelConfig, banSuffix } from '../banLabel';

export function buildLabels(
  placementSlots: PlacementSlot[],
  placement: PlacementGrid,
  rooms: ExamRoom[],
  days: ExamDay[],
  times: ExamTime[],
  entries: Map<SubjectBanKey, SubjectBanEntry>,
  banCfg?: BanLabelConfig,
  /** 전교생. 손으로 옮긴 결과까지 센 인원을 내려면 필요합니다. */
  students?: Student[],
  /** 교시별 학생 배치 (8단계 결과, 수기 이동 포함). */
  studentPlacements?: Record<number, Record<string, string>>,
  /** 별도 고사실 응시자. 봉투에서 몇 장이 빠져나가는지 알려 주려고 셉니다. */
  separateExaminers?: SeparateExaminers
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

      // 인원은 실제로 이 고사실에 앉은 학생을 셉니다.
      // 편성현황 분반 인원(e.stuCount)을 그대로 쓰면, 담당자가 8단계에서 손으로
      // 옮긴 학생이 봉투 인원에 반영되지 않아 시험지 수가 어긋납니다.
      // 아직 학생 배치를 하지 않았을 때만 분반 인원으로 어림잡습니다.
      const slotPlacements = studentPlacements?.[ps.index];
      const seated = slotPlacements && students
        ? students.filter(st => slotPlacements[`${st.ban}-${st.num}`] === r.id)
        : null;
      const separateCount = seated
        ? seated.filter(st => separateRoomFor(`${st.ban}-${st.num}`, ps.index, separateExaminers)).length
        : 0;

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
        stuCount: seated ? seated.length : (e ? e.stuCount : 0),
        separateCount,
      });
    }
  }

  return out;
}
