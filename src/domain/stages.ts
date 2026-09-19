import { AppState, isWaitCell, isForbiddenCell, capacityForSlot } from './types';
import { MSG } from './messages';
import { createInitialTimetable } from './constants';
import { buildSubjectTables, buildRooms } from './baseData';
import { buildTakers, findCompatGroups, buildStudents } from './subjects';
import { duplicateSubjects, slotStatus, remainSubjects } from './timetable';
import { buildPlacementInfo } from './placementInfo';
import { subjectBanEntries, hasErrorBaechi, cellDerived } from './placement';
import { buildAttendance, hasErrorSeat } from './attendance';
import { buildGradeTable } from './reports/gradeTable';
import { buildLabels } from './reports/labels';

export function confirmStage1(state: AppState): AppState {
  if (!state.neis || state.neis.length === 0) {
    throw new Error(MSG.S1_NO_FILE);
  }

  let { subjectSummary, subjectBans } = buildSubjectTables(state.neis, 1);
  // Preserve already configured rooms if available; otherwise build default rooms
  const rooms = (state.rooms && state.rooms.length > 0)
    ? state.rooms
    : buildRooms(state.neis, subjectSummary, subjectBans);

  // Preserve existing evalTargets selections or default to false
  const evalTargets: Record<string, boolean> = {};
  for (const s of subjectSummary) {
    evalTargets[s.subject] = state.evalTargets?.[s.subject] ?? false;
  }

  return {
    ...state,
    subjectSummary,
    subjectBans,
    rooms,
    evalTargets,
    stages: { ...state.stages, stage1: true },
  };
}

export function cancelStage1(state: AppState): AppState {
  const s2 = cancelStage2(state);
  return {
    ...s2,
    subjectSummary: [],
    subjectBans: [],
    evalTargets: {},
    stages: { ...s2.stages, stage1: false },
  };
}

export function confirmStage2(state: AppState): AppState {
  if (!state.stages.stage1) throw new Error(MSG.S4_NEED_S1);
  const targets = state.subjectSummary.filter(s => state.evalTargets[s.subject]);
  if (targets.length === 0) throw new Error(MSG.S4_NEED_O);

  const evalSubjects = targets;
  const takers = buildTakers(state.neis, evalSubjects);
  const uniqueStudents = new Set(state.neis.map(r => `${r.ban}${r.num}`)).size;
  const totalStudents = uniqueStudents > 0 ? uniqueStudents : state.rooms.reduce((acc, r) => acc + (r.stuCount ?? 0), 0);
  const { groups: compat, overflow: compatOverflow } = findCompatGroups(evalSubjects, takers, totalStudents);
  const students = buildStudents(state.neis, evalSubjects);

  // Preserve existing timetable if available, filtering out any subjects no longer in evalSubjects
  const validEvalSet = new Set(evalSubjects.map(s => s.subject));
  const hasExistingSubjects = state.timetable && Object.values(state.timetable).some(slot => slot.subjects && slot.subjects.length > 0);

  let timetable: AppState['timetable'];
  if (hasExistingSubjects) {
    timetable = { ...state.timetable };
    for (const key of Object.keys(timetable) as (keyof AppState['timetable'])[]) {
      const subs = timetable[key]?.subjects ?? [];
      timetable[key] = { subjects: subs.filter(s => validEvalSet.has(s)) };
    }
  } else {
    timetable = createInitialTimetable();
  }

  return {
    ...state,
    evalSubjects,
    compat,
    compatOverflow,
    students,
    timetable,
    stages: { ...state.stages, stage2: true },
  };
}

export function cancelStage2(state: AppState): AppState {
  const s3 = cancelStage3(state);
  return {
    ...s3,
    evalSubjects: [],
    compat: [],
    compatOverflow: false,
    students: [],
    stages: { ...s3.stages, stage2: false },
  };
}

export function confirmStage3(state: AppState): AppState {
  if (!state.stages.stage2) throw new Error(MSG.S6_NEED_S2);

  const dups = duplicateSubjects(state.timetable);
  if (dups.length > 0) throw new Error(MSG.S6_DUP);

  const takers = buildTakers(state.neis, state.evalSubjects);
  for (let d = 1; d <= 5; d++) {
    for (let p = 1; p <= 5; p++) {
      const st = slotStatus(d as any, p as any, state.timetable, state.days, state.times, takers);
      if (st.kind === 'error') {
        throw new Error(st.message || MSG.S6_HAS_ERROR);
      }
    }
  }

  const remain = remainSubjects(state.evalSubjects, state.timetable);
  if (remain.length > 0) {
    throw new Error(MSG.S6_REMAIN(remain.join(', ')));
  }

  const placementSlots = buildPlacementInfo(state.timetable, state.students, state.evalSubjects);
  const entries = subjectBanEntries(state.subjectBans);
  const newPlacement: AppState['placement'] = JSON.parse(JSON.stringify(state.placement));

  for (let i = 1; i <= 25; i++) {
    const slot = placementSlots.find(s => s.index === i);
    const canSub = slot?.subjects ?? [];
    const row = newPlacement[i] ?? {};
    let shouldClear = false;

    for (const v of Object.values(row)) {
      if (!v || v === '') continue;
      if (canSub.length === 0) {
        shouldClear = true;
        break;
      }
      if (!isWaitCell(v) && !isForbiddenCell(v)) {
        const hyphenIdx = v.lastIndexOf('-');
        const subjName = hyphenIdx !== -1 ? v.slice(0, hyphenIdx).trim() : v.trim();
        const sb = entries.get(v);
        const subjectToCheck = sb ? sb.subject : subjName;
        if (!canSub.includes(subjectToCheck)) {
          shouldClear = true;
          break;
        }
      }
    }

    if (shouldClear) {
      newPlacement[i] = {};
    }
  }

  return {
    ...state,
    placement: newPlacement,
    stages: { ...state.stages, stage3: true },
  };
}

export function cancelStage3(state: AppState): AppState {
  const s4 = cancelStage4(state);
  return {
    ...s4,
    stages: { ...s4.stages, stage3: false },
  };
}

export function confirmStage4(state: AppState): { state: AppState; notices: string[] } {
  if (!state.stages.stage3) throw new Error(MSG.S7_NEED_S3);

  const placementSlots = buildPlacementInfo(state.timetable, state.students, state.evalSubjects);
  const entries = subjectBanEntries(state.subjectBans);
  // 아래 두 검사(정원 초과 / 미배치)가 먼저입니다.
  // 어느 교시 누구인지 짚어 주므로, 두루뭉술한 안내보다 손볼 곳을 찾기 쉽습니다.

  // 정원을 넘긴 고사실이 있으면 확정하지 않습니다.
  // 분반을 통째로 유지하느라 좌석을 넘길 수 있으므로, 확정 전에 손으로 정리해야 합니다.
  const overflows: string[] = [];
  for (const ps of placementSlots) {
    const row = state.placement?.[ps.index] ?? {};
    const sp = state.studentPlacements?.[ps.index];
    if (!sp) continue;

    for (const r of state.rooms) {
      const cellValue = row[r.id];
      if (!cellValue || cellValue === '배치금지') continue;

      const assigned = state.students.filter(st => sp[`${st.ban}-${st.num}`] === r.id).length;
      const cap = capacityForSlot(
        r, ps.index, state.slotRoomCapacity, ps, cellValue, state.slotCapacityBasis?.[ps.index]
      );
      if (assigned > cap) {
        overflows.push(`${ps.title} ${r.roomName}: 정원 ${cap}석에 ${assigned}명 (${assigned - cap}명 초과)`);
      }
    }
  }

  if (overflows.length > 0) {
    const shown = overflows.slice(0, 8).join('\n');
    const more = overflows.length > 8 ? `\n… 외 ${overflows.length - 8}곳` : '';
    throw new Error(
      `정원을 넘긴 고사실이 ${overflows.length}곳 있어 확정할 수 없습니다.\n\n` +
      shown + more +
      '\n\n정원을 올리거나, 칸을 더블클릭해 학생을 다른 고사실로 옮겨 주세요.'
    );
  }

  // 어느 고사실에도 앉지 못한 학생이 있으면 확정하지 않습니다.
  //
  // 응시현황은 '고사실에 앉은 학생'만으로 만들어집니다. 미배치 학생은
  // 명단에도 수험표에도 좌석배치도에도 나오지 않습니다. 그대로 확정하면
  // 시험 당일 갈 곳이 없는 학생이 생기고, 인쇄물만 보면 알 길이 없습니다.
  const unplaced: string[] = [];
  for (const ps of placementSlots) {
    const row = state.placement?.[ps.index] ?? {};
    const sp = state.studentPlacements?.[ps.index];
    if (!sp) continue;

    const missing = state.students.filter(st => {
      const rId = sp[`${st.ban}-${st.num}`];
      return !rId || !row[rId] || row[rId] === '배치금지';
    });
    if (missing.length > 0) {
      const who = missing.slice(0, 3).map(st => `${st.ban} ${st.num}번`).join(', ');
      const rest = missing.length > 3 ? ` 외 ${missing.length - 3}명` : '';
      unplaced.push(`${ps.title}: ${missing.length}명 (${who}${rest})`);
    }
  }

  if (unplaced.length > 0) {
    const shown = unplaced.slice(0, 8).join('\n');
    const more = unplaced.length > 8 ? `\n… 외 ${unplaced.length - 8}교시` : '';
    throw new Error(
      `아직 자리를 받지 못한 학생이 있어 확정할 수 없습니다.\n\n` +
      shown + more +
      '\n\n교시 칸의 [미배치] 버튼을 눌러 남은 학생을 고사실에 넣어 주세요.\n' +
      '자리가 모자라면 7. 고사장 배치에서 고사실을 늘리거나 정원을 올리면 됩니다.'
    );
  }

  // 위 검사에 걸리지 않은 나머지 이상(칸은 있는데 분반이 비었다든지)을 봅니다.
  hasErrorBaechi(state.placement, placementSlots, state.rooms, entries, state.studentPlacements, state.students);

  const { rows: attendance, notices } = buildAttendance(
    state.neis,
    state.students,
    state.rooms,
    placementSlots,
    state.placement,
    entries,
    state.studentPlacements
  );

  return {
    state: {
      ...state,
      attendance,
      stages: { ...state.stages, stage4: true },
    },
    notices,
  };
}

export function cancelStage4(state: AppState): AppState {
  const s5 = cancelStage5(state);
  return {
    ...s5,
    attendance: [],
    stages: { ...s5.stages, stage4: false },
  };
}

export function confirmStage5(state: AppState): AppState {
  if (!state.stages.stage4) throw new Error(MSG.S8_NEED_S4);

  const placementSlots = buildPlacementInfo(state.timetable, state.students, state.evalSubjects);
  hasErrorSeat(state.attendance, state.rooms, placementSlots, state.students);

  const codes: Record<string, string> = { ...state.subjectCodes };
  for (const s of state.evalSubjects) {
    if (!codes[s.subject]) codes[s.subject] = '';
  }

  return {
    ...state,
    subjectCodes: codes,
    stages: { ...state.stages, stage5: true },
  };
}

export function cancelStage5(state: AppState): AppState {
  return {
    ...state,
    stages: { ...state.stages, stage5: false },
  };
}
