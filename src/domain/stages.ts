import { AppState, isWaitCell } from './types';
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
      if (!isWaitCell(v)) {
        const sb = entries.get(v);
        if (!sb || !canSub.includes(sb.subject)) {
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
  hasErrorBaechi(state.placement, placementSlots, state.rooms, entries);

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
