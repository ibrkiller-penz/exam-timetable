import { create } from 'zustand';
import { AppState, Stages, SlotKey, DayIdx, PeriodIdx, CellValue, ExamDay, ExamTime, ExamRoom, slotKey, isWaitCell, GradeId, GradeData, AppTheme, isExtraRoom, BanLabelStyle, CapacityBasis, SeparateExaminer } from '../domain/types';
import { createInitialDays, createInitialTimes, createInitialTimetable, APP_VERSION } from '../domain/constants';
import { MSG } from '../domain/messages';
import { confirmStage1, cancelStage1, confirmStage2, cancelStage2, confirmStage3, cancelStage3, confirmStage4, cancelStage4, confirmStage5, cancelStage5 } from '../domain/stages';
import { moveToConvenience, deleteStudent, buildSubjectTables, buildRooms, normalizeNeisRooms } from '../domain/baseData';
import { buildTakers, buildStudents } from '../domain/subjects';
import { recommendIdealTimetable, RecommendationResult } from '../domain/recommendTimetable';
import { initSlotStudentPlacements, sanitizePlacementGrid } from '../domain/autoPlace';
import { subjectBanEntries } from '../domain/placement';
import { selPlacementSlots, selSubjectBanEntries } from './selectors';
import { saveStateToIdb, loadStateFromIdb, clearStateIdb, loadBaseInfoDefaults, saveBaseInfoDefaults, setStoreInitialized } from './persistence';
import { loadLatestStateFromCloud } from '../domain/firebase';
import { SAMPLE_GRADE_2, SAMPLE_GRADE_3 } from '../data/samples';

export const createInitialGradeData = (grade: GradeId, defaults?: any): GradeData => {
  const defaultTitle = grade === '2' ? '2학년 1학기 지필평가' : '3학년 1학기 지필평가';
  const defaultTheme: AppTheme = grade === '2' ? 'blue' : 'red';
  return {
    meta: {
      schemaVersion: 1,
      appVersion: APP_VERSION,
      title: defaultTitle,
      sourceFileName: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    settings: {
      ...(defaults?.settings || {
        maxSubjectsPerSlot: 4,
        seatColumns: 5,
        separateRoomCount: 2,
        seatsPerColumn: 8,
        labelsPerPage: 2,
        showSeatOnStudentTable: true,
      }),
      theme: defaultTheme,
    },
    stages: {
      stage1: false,
      stage2: false,
      stage3: false,
      stage4: false,
      stage5: false,
    },
    neis: [],
    days: defaults?.days ? JSON.parse(JSON.stringify(defaults.days)) : createInitialDays(),
    times: defaults?.times ? JSON.parse(JSON.stringify(defaults.times)) : createInitialTimes(),
    rooms: defaults?.rooms ? JSON.parse(JSON.stringify(defaults.rooms)) : [],
    subjectSummary: [],
    subjectBans: [],
    evalTargets: defaults?.evalTargets ? { ...defaults.evalTargets } : {},
    evalSubjects: [],
    compat: [],
    compatOverflow: false,
    students: [],
    timetable: createInitialTimetable(),
    placement: {},
    slotRoomCapacity: {},
    slotBanLabels: {},
    slotBanLabelStyle: {},
    slotCapacityBasis: {},
    attendance: [],
    separateExaminers: {},
    subjectCodes: {},
    ui: {
      selectedTimetableSlot: null,
      selectedPlacementCell: null,
      report: {
        day: null,
        period: null,
        room: null,
        ban: null,
        studentIdx: null,
        labelSelection: [],
      },
    },
  };
};

export const extractGradeData = (state: AppState): GradeData => {
  return {
    meta: state.meta,
    settings: state.settings,
    stages: state.stages,
    neis: state.neis,
    days: state.days,
    times: state.times,
    rooms: state.rooms,
    subjectSummary: state.subjectSummary,
    subjectBans: state.subjectBans,
    evalTargets: state.evalTargets,
    evalSubjects: state.evalSubjects,
    compat: state.compat,
    compatOverflow: state.compatOverflow,
    students: state.students,
    timetable: state.timetable,
    placement: state.placement,
    studentPlacements: state.studentPlacements,
    lockedCells: state.lockedCells,
    slotRoomCapacity: state.slotRoomCapacity,
    slotBanLabels: state.slotBanLabels,
    slotBanLabelStyle: state.slotBanLabelStyle,
    slotCapacityBasis: state.slotCapacityBasis,
    attendance: state.attendance,
    separateExaminers: state.separateExaminers,
    subjectCodes: state.subjectCodes,
    ui: state.ui,
  };
};

export const createInitialState = (): AppState => {
  const defaults = loadBaseInfoDefaults();
  const g2 = createInitialGradeData('2', defaults);
  const g3 = createInitialGradeData('3', defaults);
  return {
    activeGrade: '2',
    gradeData: {
      '2': g2,
      '3': g3,
    },
    ...g2,
  };
};

interface AppStoreActions {
  // Persistence & Lifecycle
  initStore: () => Promise<void>;
  resetAll: () => Promise<void>;
  loadSavedState: (state: AppState) => Promise<void>;

  // Multi-Grade Actions
  switchGrade: (targetGrade: GradeId) => void;
  importCombinedNeis: (rows: AppState['neis'], fileName: string) => { grade2Count: number; grade3Count: number };
  loadGradeSample: (grade: GradeId) => void;
  loadBothGradeSamples: () => void;
  copyBaseInfoFromGrade: (fromGrade: GradeId) => void;
  resetCurrentGrade: () => void;

  // Meta & Settings
  setTitle: (title: string) => void;
  updateSettings: (settings: Partial<AppState['settings']>) => void;

  // UI state
  setSelectedTimetableSlot: (slot: SlotKey | null) => void;
  setSelectedPlacementCell: (cell: { slot: number; roomId: string } | null) => void;
  setReportSelection: (report: Partial<AppState['ui']['report']>) => void;

  setStepConfirmed: (stepNumber: number, confirmed: boolean) => void;

  // Stage 1 (Neis & BaseData)
  setNeisData: (neis: AppState['neis'], fileName: string, append?: boolean) => void;
  moveToConvenience: (ban: string, num: number) => void;
  deleteStudent: (ban: string, num: number) => void;
  confirmStage1: () => void;
  cancelStage1: () => void;

  // Stage 2 (Basic Info & Eval Targets)
  setExamDays: (days: ExamDay[]) => void;
  setExamTimes: (times: ExamTime[]) => void;
  setRooms: (rooms: ExamRoom[]) => void;
  updateRoom: (id: string, partial: Partial<ExamRoom>) => void;
  generateRooms: (banCount: number, capacity: number, padZero: boolean) => void;
  addRegularRoom: (banName?: string, roomName?: string, capacity?: number) => void;
  addExtraRoom: () => void;
  addRoom: (room: ExamRoom) => void;
  deleteRoom: (id: string) => void;
  toggleEvalTarget: (subject: string) => void;
  setAllEvalTargets: (value: boolean) => void;
  setMultipleEvalTargets: (subjects: string[], value: boolean) => void;
  invertEvalTargets: () => void;
  invertMultipleEvalTargets: (subjects: string[]) => void;
  selectOnlySubjects: (subjects: string[]) => void;
  confirmStage2: () => void;
  cancelStage2: () => void;

  // Stage 3 (Timetable)
  setTimetableSlot: (slot: SlotKey, subjects: string[]) => void;
  swapTimetableSubjects: (sub1: string, sub2: string) => void;
  moveSubjectToSlot: (subject: string, fromSlot: SlotKey, toSlot: SlotKey) => void;
  swapTimetableDays: (dayA: DayIdx, dayB: DayIdx) => void;
  swapTimetableSlots: (slotA: SlotKey, slotB: SlotKey) => void;
  clearTimetable: () => void;
  applyIdealRecommendation: () => RecommendationResult;
  confirmStage3: () => void;
  cancelStage3: () => void;

  // Stage 4 (Placement)
  setPlacementCell: (slotIndex: number, roomId: string, value: CellValue) => void;
  swapPlacementCells: (slotIndex: number, roomId1: string, roomId2: string) => void;
  setLockedCell: (slotIndex: number, roomId: string, locked: boolean) => void;
  /** 해당 교시에만 적용되는 고사실 정원을 지정합니다. capacity가 null이면 기본 정원으로 되돌립니다. */
  setSlotRoomCapacity: (slotIndex: number, roomId: string, capacity: number | null) => void;
  /** 교시별 분반 이름을 직접 지정합니다. label이 비면 자동 표기로 되돌립니다. */
  setSlotBanLabel: (slotIndex: number, roomId: string, label: string | null) => void;
  /** 교시별 분반 표기 방식(가나다/ABC). null이면 설정의 기본 방식을 따릅니다. */
  setSlotBanLabelStyle: (slotIndex: number, style: BanLabelStyle | null) => void;
  /** 교시별 정원 기준(고사실 좌석 / 반 인원). null이면 교시 성격에 맞는 기본값을 씁니다. */
  setSlotCapacityBasis: (slotIndex: number, basis: CapacityBasis | null) => void;
  setPlacementGrid: (placement: AppState['placement']) => void;
  transferStudentsAndUpdatePlacement: (slotIndex: number, transfers: Record<string, string>) => void;
  setSlotStudentPlacements: (slotIndex: number, placements: Record<string, string>) => void;
  setAllStudentPlacements: (placements: Record<number, Record<string, string>>) => void;
  clearPlacementSlot: (slotIndex: number) => void;
  clearAllPlacement: () => void;
  /** 별도 고사장 응시자를 지정하거나 해제합니다. entry가 null이면 해제입니다. */
  setSeparateExaminer: (studentKey: string, entry: SeparateExaminer | null) => void;
  /** 모든 칸의 잠금 상태를 한꺼번에 바꿉니다. */
  setAllLockedCells: (locked: Record<number, Record<string, boolean>>) => void;
  confirmStage4: () => string[]; // returns notices
  cancelStage4: () => void;
  /** 7. 고사장 배치만 확정/해제합니다 (8. 학생 배치와 분리). */
  confirmStep7Rooms: () => void;
  cancelStep7Rooms: () => void;

  // Stage 5 (Attendance & Seats)
  updateAttendanceSeat: (key1: string, seat: number | null) => void;
  setAttendanceBySeq: () => void;
  setAttendanceRandom: () => void;
  setSubjectCode: (subject: string, code: string) => void;
  confirmStage5: () => void;
  cancelStage5: () => void;
}

export type AppStore = AppState & AppStoreActions;

export const useAppStore = create<AppStore>((set, get) => ({
  ...createInitialState(),

  initStore: async () => {
    let saved = await loadStateFromIdb();
    // Fallback to Cloud Firestore if local storage is missing or timetable is empty
    if (!saved || !saved.timetable || Object.values(saved.timetable).every(s => !s.subjects || s.subjects.length === 0)) {
      try {
        const cloudData = await Promise.race([
          loadLatestStateFromCloud(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 1500))
        ]);
        if (cloudData && cloudData.state && cloudData.state.timetable && Object.values(cloudData.state.timetable).some(s => s.subjects && s.subjects.length > 0)) {
          saved = cloudData.state;
        }
      } catch (e) {
        console.warn('Cloud restore check failed:', e);
      }
    }

    const defaults = loadBaseInfoDefaults();
    if (saved) {
      const activeGrade: GradeId = (saved.activeGrade === '2' || saved.activeGrade === '3') ? saved.activeGrade : '2';
      let gradeData = saved.gradeData || {};

      // Ensure both grade 2 and grade 3 data exist
      if (!gradeData['2']) {
        gradeData['2'] = activeGrade === '2' ? extractGradeData(saved) : createInitialGradeData('2', defaults);
      }
      if (!gradeData['3']) {
        gradeData['3'] = activeGrade === '3' ? extractGradeData(saved) : createInitialGradeData('3', defaults);
      }

      const days = saved.days && saved.days.some(d => d.date) ? saved.days : (defaults?.days || saved.days || createInitialDays());
      const times = saved.times && saved.times.some(t => t.time) ? saved.times : (defaults?.times || saved.times || createInitialTimes());
      const rooms = saved.rooms && saved.rooms.length > 0 ? saved.rooms : (defaults?.rooms || saved.rooms || []);
      const settings = saved.settings || defaults?.settings;
      const evalTargets = (saved.evalTargets && Object.keys(saved.evalTargets).length > 0)
        ? saved.evalTargets
        : (defaults?.evalTargets || {});
      const timetable = saved.timetable || createInitialTimetable();

      let neis = saved.neis;
      let subjectBans = saved.subjectBans;
      let subjectSummary = saved.subjectSummary;
      let students = saved.students;
      let evalSubjects = saved.evalSubjects || [];

      if (neis && neis.length > 0) {
        neis = normalizeNeisRooms(neis);
        const rebuilt = buildSubjectTables(neis, 1);
        subjectSummary = rebuilt.subjectSummary;
        subjectBans = rebuilt.subjectBans;
        students = buildStudents(neis, subjectSummary);

        const summaryMap = new Map(subjectSummary.map(s => [s.subject, s]));
        evalSubjects = evalSubjects.map(e => {
          const fresh = summaryMap.get(e.subject);
          return fresh ? { ...e, banCount: fresh.banCount, stuCount: fresh.stuCount } : e;
        });
      }

      const entries = subjectBanEntries(subjectBans || []);
      const placement = saved.placement ? sanitizePlacementGrid(saved.placement, rooms, entries) : {};

      const currentTheme = settings?.theme || (activeGrade === '2' ? 'blue' : 'red');
      document.documentElement.setAttribute('data-theme', currentTheme);

      set({
        ...saved,
        activeGrade,
        gradeData,
        ...(neis && neis.length > 0 ? { neis, subjectSummary, subjectBans, students } : {}),
        days,
        times,
        rooms,
        evalTargets,
        timetable,
        placement,
        evalSubjects,
        ...(settings ? { settings } : {}),
      });
    } else if (defaults) {
      const g2 = createInitialGradeData('2', defaults);
      const g3 = createInitialGradeData('3', defaults);
      set(state => ({
        ...state,
        activeGrade: '2',
        gradeData: { '2': g2, '3': g3 },
        ...g2,
      }));
    }
    // Mark store as initialized so subsequent saves will write to storage
    setStoreInitialized(true);
  },

  resetAll: async () => {
    const initial = createInitialState();
    set(initial);
    await clearStateIdb();
    setStoreInitialized(true);
  },

  switchGrade: (targetGrade: GradeId) => {
    const cur = get();
    if (cur.activeGrade === targetGrade) return;

    // 1. 현재 활성 학년 데이터 스냅샷
    const curGradeData = extractGradeData(cur);
    const updatedGradeData: Partial<Record<GradeId, GradeData>> = {
      ...(cur.gradeData || {}),
      [cur.activeGrade]: curGradeData,
    };

    // 2. 대상 학년 데이터 가져오기 (없으면 초기 생성)
    let targetData = updatedGradeData[targetGrade];
    if (!targetData) {
      targetData = createInitialGradeData(targetGrade);
      updatedGradeData[targetGrade] = targetData;
    }

    // 3. 상태 적용
    const newState: AppState = {
      ...cur,
      ...targetData,
      activeGrade: targetGrade,
      gradeData: updatedGradeData,
    };

    // 테마 적용
    const theme = newState.settings.theme || (targetGrade === '2' ? 'blue' : 'red');
    document.documentElement.setAttribute('data-theme', theme);

    set(newState);
    saveStateToIdb(newState);
  },

  importCombinedNeis: (rows: AppState['neis'], fileName: string) => {
    const g2Rows = rows.filter(r => {
      const g = String(r.grade || '').trim();
      const tr = String(r.track || '');
      const rm = String(r.room || '');
      return g === '2' || tr.includes('2학년') || rm.includes('2학년') || /^[2][0-9]{3}/.test(String(r.ban));
    });
    const g3Rows = rows.filter(r => {
      const g = String(r.grade || '').trim();
      const tr = String(r.track || '');
      const rm = String(r.room || '');
      return g === '3' || tr.includes('3학년') || rm.includes('3학년') || /^[3][0-9]{3}/.test(String(r.ban));
    });

    const cur = get();
    const currentSnap = extractGradeData(cur);
    const gradeData: Record<GradeId, GradeData> = {
      '2': cur.gradeData?.['2'] || createInitialGradeData('2'),
      '3': cur.gradeData?.['3'] || createInitialGradeData('3'),
      ...(cur.gradeData || {}),
    };
    gradeData[cur.activeGrade] = currentSnap;

    // 2학년 데이터 적재
    if (g2Rows.length > 0) {
      const existing2 = gradeData['2'];
      const norm2 = normalizeNeisRooms(g2Rows);
      const rebuilt2 = buildSubjectTables(norm2, 1);
      const rooms2 = buildRooms(norm2, rebuilt2.subjectSummary, rebuilt2.subjectBans);
      const students2 = buildStudents(norm2, rebuilt2.subjectSummary);
      gradeData['2'] = {
        ...existing2,
        neis: norm2,
        meta: {
          ...existing2.meta,
          sourceFileName: fileName,
          title: existing2.meta.title || '2학년 1학기 지필평가',
          updatedAt: new Date().toISOString(),
        },
        rooms: rooms2.length > 0 ? rooms2 : existing2.rooms,
        subjectSummary: rebuilt2.subjectSummary,
        subjectBans: rebuilt2.subjectBans,
        students: students2,
        stages: { ...existing2.stages, stage1: false, step1: false },
      };
    }

    // 3학년 데이터 적재
    if (g3Rows.length > 0) {
      const existing3 = gradeData['3'];
      const norm3 = normalizeNeisRooms(g3Rows);
      const rebuilt3 = buildSubjectTables(norm3, 1);
      const rooms3 = buildRooms(norm3, rebuilt3.subjectSummary, rebuilt3.subjectBans);
      const students3 = buildStudents(norm3, rebuilt3.subjectSummary);
      gradeData['3'] = {
        ...existing3,
        neis: norm3,
        meta: {
          ...existing3.meta,
          sourceFileName: fileName,
          title: existing3.meta.title || '3학년 1학기 지필평가',
          updatedAt: new Date().toISOString(),
        },
        rooms: rooms3.length > 0 ? rooms3 : existing3.rooms,
        subjectSummary: rebuilt3.subjectSummary,
        subjectBans: rebuilt3.subjectBans,
        students: students3,
        stages: { ...existing3.stages, stage1: false, step1: false },
      };
    }

    // 활성 학년 데이터 동기화
    const activeData = gradeData[cur.activeGrade];
    const newState: AppState = {
      ...cur,
      ...activeData,
      gradeData,
    };

    set(newState);
    saveStateToIdb(newState);

    return { grade2Count: g2Rows.length, grade3Count: g3Rows.length };
  },

  loadGradeSample: (grade: GradeId) => {
    const cur = get();
    // 1. 현재 활성 학년 데이터 스냅샷 저장
    const currentSnap = extractGradeData(cur);
    const defaults = loadBaseInfoDefaults();
    const gradeData: Record<GradeId, GradeData> = {
      '2': cur.gradeData?.['2'] || createInitialGradeData('2', defaults),
      '3': cur.gradeData?.['3'] || createInitialGradeData('3', defaults),
      ...(cur.gradeData || {}),
    };
    gradeData[cur.activeGrade] = currentSnap;

    // 2. 요청된 학년의 샘플 데이터 생성
    const rawRows = grade === '2' ? SAMPLE_GRADE_2 : SAMPLE_GRADE_3;
    const norm = normalizeNeisRooms(rawRows);
    const rebuilt = buildSubjectTables(norm, 1);
    const rooms = buildRooms(norm, rebuilt.subjectSummary, rebuilt.subjectBans);
    const students = buildStudents(norm, rebuilt.subjectSummary);
    const existing = gradeData[grade] || createInitialGradeData(grade, defaults);

    gradeData[grade] = {
      ...existing,
      neis: norm,
      meta: {
        ...existing.meta,
        sourceFileName: `샘플_학생편성현황_${grade}학년.xlsx`,
        title: `${grade}학년 1학기 지필평가`,
        updatedAt: new Date().toISOString(),
      },
      rooms: rooms.length > 0 ? rooms : existing.rooms,
      subjectSummary: rebuilt.subjectSummary,
      subjectBans: rebuilt.subjectBans,
      students,
      stages: { ...existing.stages, stage1: false, step1: false },
    };

    // 3. activeGrade를 요청된 grade로 즉각 전환하여 화면에 바로 표시
    const activeData = gradeData[grade];
    const newState: AppState = {
      ...cur,
      ...activeData,
      activeGrade: grade,
      gradeData,
    };

    const theme = newState.settings?.theme || (grade === '2' ? 'blue' : 'red');
    document.documentElement.setAttribute('data-theme', theme);

    set(newState);
    saveStateToIdb(newState);
  },

  loadBothGradeSamples: () => {
    const cur = get();
    const defaults = loadBaseInfoDefaults();
    const gradeData: Record<GradeId, GradeData> = {
      '2': cur.gradeData?.['2'] || createInitialGradeData('2', defaults),
      '3': cur.gradeData?.['3'] || createInitialGradeData('3', defaults),
      ...(cur.gradeData || {}),
    };

    // 2학년 생성
    const norm2 = normalizeNeisRooms(SAMPLE_GRADE_2);
    const rebuilt2 = buildSubjectTables(norm2, 1);
    const rooms2 = buildRooms(norm2, rebuilt2.subjectSummary, rebuilt2.subjectBans);
    const students2 = buildStudents(norm2, rebuilt2.subjectSummary);
    const ex2 = gradeData['2'];
    gradeData['2'] = {
      ...ex2,
      neis: norm2,
      meta: {
        ...ex2.meta,
        sourceFileName: '샘플_학생편성현황_2학년.xlsx',
        title: '2학년 1학기 지필평가',
        updatedAt: new Date().toISOString(),
      },
      rooms: rooms2.length > 0 ? rooms2 : ex2.rooms,
      subjectSummary: rebuilt2.subjectSummary,
      subjectBans: rebuilt2.subjectBans,
      students: students2,
      stages: { ...ex2.stages, stage1: false, step1: false },
    };

    // 3학년 생성
    const norm3 = normalizeNeisRooms(SAMPLE_GRADE_3);
    const rebuilt3 = buildSubjectTables(norm3, 1);
    const rooms3 = buildRooms(norm3, rebuilt3.subjectSummary, rebuilt3.subjectBans);
    const students3 = buildStudents(norm3, rebuilt3.subjectSummary);
    const ex3 = gradeData['3'];
    gradeData['3'] = {
      ...ex3,
      neis: norm3,
      meta: {
        ...ex3.meta,
        sourceFileName: '샘플_학생편성현황_3학년.xlsx',
        title: '3학년 1학기 지필평가',
        updatedAt: new Date().toISOString(),
      },
      rooms: rooms3.length > 0 ? rooms3 : ex3.rooms,
      subjectSummary: rebuilt3.subjectSummary,
      subjectBans: rebuilt3.subjectBans,
      students: students3,
      stages: { ...ex3.stages, stage1: false, step1: false },
    };

    // 현재 활성 학년 데이터 동기화
    const activeData = gradeData[cur.activeGrade];
    const newState: AppState = {
      ...cur,
      ...activeData,
      gradeData,
    };
    const theme = newState.settings?.theme || (cur.activeGrade === '2' ? 'blue' : 'red');
    document.documentElement.setAttribute('data-theme', theme);

    set(newState);
    saveStateToIdb(newState);
  },

  copyBaseInfoFromGrade: (fromGrade: GradeId) => {
    const cur = get();
    const sourceData = cur.gradeData?.[fromGrade] || (cur.activeGrade === fromGrade ? extractGradeData(cur) : null);
    if (!sourceData) return;

    const newDays = JSON.parse(JSON.stringify(sourceData.days));
    const newTimes = JSON.parse(JSON.stringify(sourceData.times));
    const newRooms = JSON.parse(JSON.stringify(sourceData.rooms));

    set(state => {
      const next = {
        ...state,
        days: newDays,
        times: newTimes,
        rooms: newRooms,
      };
      saveStateToIdb(next);
      return next;
    });
  },

  resetCurrentGrade: () => {
    const cur = get();
    const defaults = loadBaseInfoDefaults();
    const freshGradeData = createInitialGradeData(cur.activeGrade, defaults);
    const updatedGradeData = {
      ...(cur.gradeData || {}),
      [cur.activeGrade]: freshGradeData,
    };
    const newState: AppState = {
      ...cur,
      ...freshGradeData,
      gradeData: updatedGradeData,
    };
    set(newState);
    saveStateToIdb(newState);
  },

  loadSavedState: async (newState: AppState) => {
    const activeGrade: GradeId = (newState.activeGrade === '2' || newState.activeGrade === '3') ? newState.activeGrade : '2';
    const gradeData = newState.gradeData || { [activeGrade]: extractGradeData(newState) };

    let neis = newState.neis;
    let subjectBans = newState.subjectBans;
    let subjectSummary = newState.subjectSummary;
    let students = newState.students;
    let evalSubjects = newState.evalSubjects || [];

    if (neis && neis.length > 0) {
      neis = normalizeNeisRooms(neis);
      const rebuilt = buildSubjectTables(neis, 1);
      subjectSummary = rebuilt.subjectSummary;
      subjectBans = rebuilt.subjectBans;
      students = buildStudents(neis, subjectSummary);

      const summaryMap = new Map(subjectSummary.map(s => [s.subject, s]));
      evalSubjects = evalSubjects.map(e => {
        const fresh = summaryMap.get(e.subject);
        return fresh ? { ...e, banCount: fresh.banCount, stuCount: fresh.stuCount } : e;
      });
    }

    const entries = subjectBanEntries(subjectBans || []);
    const cleanPlacement = sanitizePlacementGrid(newState.placement || {}, newState.rooms || [], entries);
    const cleanState: AppState = {
      ...newState,
      activeGrade,
      gradeData,
      ...(neis && neis.length > 0 ? { neis, subjectSummary, subjectBans, students } : {}),
      evalSubjects,
      placement: cleanPlacement,
    };

    const theme = cleanState.settings?.theme || (activeGrade === '2' ? 'blue' : 'red');
    document.documentElement.setAttribute('data-theme', theme);

    set(cleanState);
    setStoreInitialized(true);
    await saveStateToIdb(cleanState);
  },

  setTitle: (title: string) => {
    set(state => {
      const next = { ...state, meta: { ...state.meta, title, updatedAt: new Date().toISOString() } };
      saveStateToIdb(next);
      return next;
    });
  },

  updateSettings: (settingsPartial) => {
    set(state => {
      const next = { ...state, settings: { ...state.settings, ...settingsPartial } };
      saveStateToIdb(next);
      return next;
    });
  },

  setSelectedTimetableSlot: (slot) => {
    set(state => ({ ...state, ui: { ...state.ui, selectedTimetableSlot: slot } }));
  },

  setSelectedPlacementCell: (cell) => {
    set(state => ({ ...state, ui: { ...state.ui, selectedPlacementCell: cell } }));
  },

  setReportSelection: (reportPartial) => {
    set(state => ({
      ...state,
      ui: { ...state.ui, report: { ...state.ui.report, ...reportPartial } },
    }));
  },

  setNeisData: (rawNeis, fileName, append = false) => {
    set(state => {
      
      let neis = normalizeNeisRooms(rawNeis);
      if (append && state.neis && state.neis.length > 0) {
        // filter out existing rows that might be exact duplicates, though usually they are different grades
        neis = [...state.neis, ...neis];
      }
      
      // Check if multiple grades exist. If so, prefix subjects with [N학년]
      const distinctGrades = new Set(neis.map(r => r.grade?.charAt(0)).filter(Boolean));
      if (distinctGrades.size > 1) {
        neis = neis.map(r => {
          const g = r.grade?.charAt(0);
          if (!g) return r;
          let newSubj = r.subject.replace(/^\[\d학년\]\s*/, ''); // remove existing prefix if any
          newSubj = `[${g}학년] ${newSubj}`;
          return { ...r, subject: newSubj };
        });
      }

      const grade = neis[0]?.grade?.charAt(0) ?? '1';
      const year = neis[0]?.year ?? '2026';
      const sem = neis[0]?.semester ?? '2';
      const gradesLabel = distinctGrades && distinctGrades.size > 1 ? Array.from(distinctGrades).sort().join(',') : grade;
      const defaultTitle = `${year}학년도 ${gradesLabel}학년 ${sem}학기 중간고사  시험시간표`;

      let { subjectSummary, subjectBans } = buildSubjectTables(neis, 1);
      const defaults = loadBaseInfoDefaults();

      // 1. Rooms: always generate base rooms from new NEIS data to ensure all grades/classes exist
      let generatedRooms = buildRooms(neis, subjectSummary, subjectBans);
      // Merge with existing rooms to preserve manual edits (like maxClassSize or roomName)
      let rooms = generatedRooms.map(gen => {
        const existing = state.rooms?.find(r => r.id === gen.id);
        if (existing) {
           return { ...gen, maxClassSize: existing.maxClassSize, roomName: existing.roomName };
        }
        return gen;
      });
      // Also keep any extra manual rooms that the user added that don't match NEIS classes
      const manualRooms = (state.rooms || []).filter(r => !generatedRooms.find(g => g.id === r.id) && !r.banName);
      rooms = [...rooms, ...manualRooms];

      // 2. Days: preserve configured dates or defaults
      const hasConfiguredDays = state.days && state.days.some(d => d.date && d.date.trim() !== '');
      const days = hasConfiguredDays
        ? state.days
        : (defaults?.days && defaults.days.some(d => d.date) ? defaults.days : createInitialDays());

      // 3. Times: preserve configured times or defaults
      const hasConfiguredTimes = state.times && state.times.some(t => t.time && t.time.trim() !== '');
      const times = hasConfiguredTimes
        ? state.times
        : (defaults?.times && defaults.times.some(t => t.time) ? defaults.times : createInitialTimes());

      // 4. Settings: preserve current settings or defaults
      const settings = state.settings || defaults?.settings || {
        maxSubjectsPerSlot: 4,
        seatColumns: 5,
        separateRoomCount: 2,
        seatsPerColumn: 8,
        labelsPerPage: 2,
        showSeatOnStudentTable: true,
      };

      const evalTargets: Record<string, boolean> = {};
      const savedTargets = (state.evalTargets && Object.keys(state.evalTargets).length > 0)
        ? state.evalTargets
        : (defaults?.evalTargets || {});
      for (const s of subjectSummary) {
        evalTargets[s.subject] = savedTargets[s.subject] ?? false;
      }

      const activeGrade = state.activeGrade || '2';
      const initialGrade = createInitialGradeData(activeGrade, defaults);
      const students = buildStudents(neis, subjectSummary);

      const activeGradeData: GradeData = {
        ...initialGrade,
        meta: {
          ...state.meta,
          sourceFileName: fileName,
          title: (state.meta.title && state.meta.title !== '2026학년도 1학년 2학기 중간고사  시험시간표' && state.meta.title !== MSG.TITLE_DEFAULT)
            ? state.meta.title
            : defaultTitle,
          updatedAt: new Date().toISOString(),
        },
        settings,
        stages: { stage1: false, stage2: false, stage3: false, stage4: false, stage5: false, step1: false, step2: false, step3: false, step4: false, step5: false, step6: false, step7: false, step8: false },
        neis,
        days,
        times,
        rooms,
        subjectSummary,
        subjectBans,
        evalTargets,
        students,
        timetable: createInitialTimetable(),
        placement: {},
        studentPlacements: {},
        lockedCells: {},
        attendance: [],
        subjectCodes: {},
        ui: {
          ...state.ui,
          selectedTimetableSlot: null,
          selectedPlacementCell: null,
        },
      };

      const updatedGradeData: Record<GradeId, GradeData> = {
        '2': state.gradeData?.['2'] || createInitialGradeData('2', defaults),
        '3': state.gradeData?.['3'] || createInitialGradeData('3', defaults),
        ...(state.gradeData || {}),
        [activeGrade]: activeGradeData,
      };

      const next: AppState = {
        ...state,
        ...activeGradeData,
        activeGrade,
        gradeData: updatedGradeData,
      };

      const theme = next.settings?.theme || (activeGrade === '2' ? 'blue' : 'red');
      document.documentElement.setAttribute('data-theme', theme);

      saveStateToIdb(next);
      return next;
    });
  },

  moveToConvenience: (ban, num) => {
    set(state => {
      if (state.stages.stage1) throw new Error(MSG.S1_LOCKED);
      const nextNeis = moveToConvenience(state.neis, ban, num);
      const next = { ...state, neis: nextNeis };
      saveStateToIdb(next);
      return next;
    });
  },

  deleteStudent: (ban, num) => {
    set(state => {
      if (state.stages.stage1) throw new Error(MSG.S1_LOCKED);
      const nextNeis = deleteStudent(state.neis, ban, num);
      const next = { ...state, neis: nextNeis };
      saveStateToIdb(next);
      return next;
    });
  },

  setStepConfirmed: (stepNumber: number, confirmed: boolean) => {
    set(state => {
      const stepKey = `step${stepNumber}` as keyof Stages;
      const nextStages = { ...state.stages, [stepKey]: confirmed };
      if (stepNumber === 1) nextStages.stage1 = confirmed;
      if (stepNumber === 4) nextStages.stage2 = confirmed;
      if (stepNumber === 6) nextStages.stage3 = confirmed;
      // 7단계(고사장 배치)는 stage4를 건드리지 않습니다. stage4는 8단계(학생 배치) 확정입니다.
      if (stepNumber === 8) nextStages.stage4 = confirmed;
      if (stepNumber === 9) nextStages.stage5 = confirmed;
      const next = { ...state, stages: nextStages };
      saveStateToIdb(next, confirmed, `[확정] ${stepNumber}단계 ${confirmed ? '확정' : '취소'}`);
      return next;
    });
  },

  confirmStage1: () => {
    set(state => {
      const nextState = confirmStage1(state);
      const next = { ...nextState, stages: { ...nextState.stages, step1: true } };
      saveStateToIdb(next, true, '[확정] 1단계. 학생편성현황 확정');
      return next;
    });
  },

  cancelStage1: () => {
    set(state => {
      const nextState = cancelStage1(state);
      const next = { ...nextState, stages: { ...nextState.stages, step1: false } };
      saveStateToIdb(next);
      return next;
    });
  },

  setExamDays: (days) => {
    set(state => {
      const next = { ...state, days };
      saveStateToIdb(next);
      return next;
    });
  },

  setExamTimes: (times) => {
    set(state => {
      const next = { ...state, times };
      saveStateToIdb(next);
      return next;
    });
  },

  setRooms: (rooms) => {
    set(state => {
      const next = { ...state, rooms };
      saveStateToIdb(next);
      return next;
    });
  },

  updateRoom: (id, partial) => {
    set(state => {
      const nextRooms = state.rooms.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, ...partial };
        // 별도실/추가 고사실인 경우 고사실명(roomName)과 반명(banName) 상호 자동 연동
        if (isExtraRoom(r) || r.id.startsWith('extra_') || r.banName === '' || r.roomName.startsWith('별도')) {
          if (partial.roomName !== undefined && (!r.banName || r.banName === r.roomName || r.banName.startsWith('별도'))) {
            updated.banName = partial.roomName;
          } else if (partial.banName !== undefined && (!r.roomName || r.banName === r.roomName || r.roomName.startsWith('별도'))) {
            updated.roomName = partial.banName;
          }
        }
        return updated;
      });
      const next = { ...state, rooms: nextRooms };
      saveStateToIdb(next);
      return next;
    });
  },

  generateRooms: (banCount: number, capacity: number, padZero: boolean) => {
    set(state => {
      const existingExtras = state.rooms.filter(r => isExtraRoom(r) || r.id.startsWith('extra_') || r.roomName.startsWith('별도') || r.banName === '');
      const newRegularRooms: ExamRoom[] = [];
      for (let b = 1; b <= banCount; b++) {
        const banName = padZero ? `${String(b).padStart(2, '0')}반` : `${b}반`;
        const matchingNeisStudents = new Set(
          state.neis
            .filter(r => r.ban === banName || r.ban === `${b}반` || r.ban === `${String(b).padStart(2, '0')}반`)
            .map(r => `${r.ban}${r.num}`)
        );
        const stuCount = matchingNeisStudents.size > 0 ? matchingNeisStudents.size : null;

        newRegularRooms.push({
          id: `room_${b}`,
          banName,
          stuCount,
          maxClassSize: capacity,
          roomName: banName,
          capacity,
        });
      }
      const nextRooms = [...newRegularRooms, ...existingExtras];
      const next = { ...state, rooms: nextRooms };
      saveStateToIdb(next);
      return next;
    });
  },

  addRegularRoom: (banName = '', roomName = '', capacity = 25) => {
    set(state => {
      const num = state.rooms.length + 1;
      const bName = banName || `${num}반`;
      const rName = roomName || bName;
      const newRoom: ExamRoom = {
        id: `room_${Date.now()}_${num}`,
        banName: bName,
        stuCount: null,
        maxClassSize: capacity,
        roomName: rName,
        capacity,
      };
      const next = { ...state, rooms: [...state.rooms, newRoom] };
      saveStateToIdb(next);
      return next;
    });
  },

  addExtraRoom: () => {
    set(state => {
      const existingExtras = state.rooms.filter(r => isExtraRoom(r) || r.id.startsWith('extra_') || r.roomName.startsWith('별도'));
      const num = existingExtras.length + 1;
      const defaultName = `별도실${num}`;
      const newRoom: ExamRoom = {
        id: `extra_${Date.now()}_${num}`,
        banName: defaultName,
        stuCount: null,
        maxClassSize: null,
        roomName: defaultName,
        capacity: 30,
      };
      const next = { ...state, rooms: [...state.rooms, newRoom] };
      saveStateToIdb(next);
      return next;
    });
  },

  addRoom: (room: ExamRoom) => {
    set(state => {
      const next = { ...state, rooms: [...state.rooms, room] };
      saveStateToIdb(next);
      return next;
    });
  },

  deleteRoom: (id) => {
    set(state => {
      const nextRooms = state.rooms.filter(r => r.id !== id);
      const nextPlacement = { ...state.placement };
      for (const slotStr in nextPlacement) {
        const slot = Number(slotStr);
        if (nextPlacement[slot] && nextPlacement[slot][id]) {
          const row = { ...nextPlacement[slot] };
          delete row[id];
          nextPlacement[slot] = row;
        }
      }
      const next = { ...state, rooms: nextRooms, placement: nextPlacement };
      saveStateToIdb(next);
      return next;
    });
  },

  toggleEvalTarget: (subject) => {
    set(state => {
      if (state.stages.stage2) throw new Error(MSG.S4_LOCKED);
      const nextTargets = { ...state.evalTargets, [subject]: !state.evalTargets[subject] };
      const next = { ...state, evalTargets: nextTargets };
      saveStateToIdb(next);
      return next;
    });
  },

  setAllEvalTargets: (value) => {
    set(state => {
      if (state.stages.stage2) throw new Error(MSG.S4_LOCKED);
      const nextTargets: Record<string, boolean> = {};
      for (const s of state.subjectSummary) {
        nextTargets[s.subject] = value;
      }
      const next = { ...state, evalTargets: nextTargets };
      saveStateToIdb(next);
      return next;
    });
  },

  setMultipleEvalTargets: (subjects, value) => {
    set(state => {
      if (state.stages.stage2) throw new Error(MSG.S4_LOCKED);
      const nextTargets = { ...state.evalTargets };
      for (const s of subjects) {
        nextTargets[s] = value;
      }
      const next = { ...state, evalTargets: nextTargets };
      saveStateToIdb(next);
      return next;
    });
  },

  invertEvalTargets: () => {
    set(state => {
      if (state.stages.stage2) throw new Error(MSG.S4_LOCKED);
      const nextTargets = { ...state.evalTargets };
      for (const key in nextTargets) {
        nextTargets[key] = !nextTargets[key];
      }
      const next = { ...state, evalTargets: nextTargets };
      saveStateToIdb(next);
      return next;
    });
  },
  invertMultipleEvalTargets: (subjects) => {
    set(state => {
      if (state.stages.stage2) throw new Error(MSG.S4_LOCKED);
      const nextTargets = { ...state.evalTargets };
      for (const s of subjects) {
        nextTargets[s] = !nextTargets[s];
      }
      const next = { ...state, evalTargets: nextTargets };
      saveStateToIdb(next);
      return next;
    });
  },

  selectOnlySubjects: (subjects) => {
    set(state => {
      if (state.stages.stage2) throw new Error(MSG.S4_LOCKED);
      const setSubs = new Set(subjects);
      const nextTargets: Record<string, boolean> = {};
      for (const s of state.subjectSummary) {
        const nakedSubject = s.subject.replace(/^\[\d학년\]\s*/, '');
        // Check for exact match or legacy match (without prefix)
        nextTargets[s.subject] = setSubs.has(s.subject) || setSubs.has(nakedSubject);
      }
      const next = { ...state, evalTargets: nextTargets };
      saveStateToIdb(next);
      return next;
    });
  },

  confirmStage2: () => {
    set(state => {
      const nextState = confirmStage2(state);
      const next = { ...nextState, stages: { ...nextState.stages, step4: true } };
      saveStateToIdb(next, true, '[확정] 4단계. 평가과목 확정');
      return next;
    });
  },

  cancelStage2: () => {
    set(state => {
      const nextState = cancelStage2(state);
      const next = { ...nextState, stages: { ...nextState.stages, step4: false } };
      saveStateToIdb(next);
      return next;
    });
  },

  setTimetableSlot: (slot, subjects) => {
    set(state => {
      if (state.stages.stage3) throw new Error(MSG.S6_LOCKED);
      const nextTimetable = { ...state.timetable, [slot]: { subjects } };
      const next = { ...state, timetable: nextTimetable };
      saveStateToIdb(next);
      return next;
    });
  },

  swapTimetableSlots: (slotA, slotB) => {
    set(state => {
      if (state.stages.stage3) throw new Error(MSG.S6_LOCKED);
      if (slotA === slotB) return state;

      const nextTimetable = { ...state.timetable };
      const subsA = nextTimetable[slotA]?.subjects ?? [];
      const subsB = nextTimetable[slotB]?.subjects ?? [];
      nextTimetable[slotA] = { subjects: [...subsB] };
      nextTimetable[slotB] = { subjects: [...subsA] };

      const next = { ...state, timetable: nextTimetable };
      saveStateToIdb(next);
      return next;
    });
  },

  swapTimetableSubjects: (sub1, sub2) => {
    set(state => {
      if (state.stages.stage3) throw new Error(MSG.S6_LOCKED);
      let slot1: SlotKey | null = null;
      let slot2: SlotKey | null = null;

      for (const [k, s] of Object.entries(state.timetable)) {
        if (s.subjects.includes(sub1)) slot1 = k as SlotKey;
        if (s.subjects.includes(sub2)) slot2 = k as SlotKey;
      }

      if (!slot1 || !slot2) return state;

      const nextTimetable = { ...state.timetable };
      if (slot1 === slot2) {
        const arr = [...nextTimetable[slot1].subjects];
        const idx1 = arr.indexOf(sub1);
        const idx2 = arr.indexOf(sub2);
        arr[idx1] = sub2;
        arr[idx2] = sub1;
        nextTimetable[slot1] = { subjects: arr };
      } else {
        const arr1 = nextTimetable[slot1].subjects.map(s => (s === sub1 ? sub2 : s));
        const arr2 = nextTimetable[slot2].subjects.map(s => (s === sub2 ? sub1 : s));
        nextTimetable[slot1] = { subjects: arr1 };
        nextTimetable[slot2] = { subjects: arr2 };
      }

      const next = { ...state, timetable: nextTimetable };
      saveStateToIdb(next);
      return next;
    });
  },

  moveSubjectToSlot: (subject, fromSlot, toSlot) => {
    set(state => {
      if (state.stages.stage3) throw new Error(MSG.S6_LOCKED);
      if (fromSlot === toSlot) return state;

      const nextTimetable = { ...state.timetable };
      const fromSubs = nextTimetable[fromSlot]?.subjects ?? [];
      const toSubs = nextTimetable[toSlot]?.subjects ?? [];

      nextTimetable[fromSlot] = { subjects: fromSubs.filter(s => s !== subject) };
      if (!toSubs.includes(subject)) {
        nextTimetable[toSlot] = { subjects: [...toSubs, subject] };
      }

      const next = { ...state, timetable: nextTimetable };
      saveStateToIdb(next);
      return next;
    });
  },

  swapTimetableDays: (dayA, dayB) => {
    set(state => {
      if (state.stages.stage3) throw new Error(MSG.S6_LOCKED);
      if (dayA === dayB) return state;

      const nextTimetable = { ...state.timetable };
      for (const p of [1, 2, 3, 4, 5] as PeriodIdx[]) {
        const keyA = slotKey(dayA, p);
        const keyB = slotKey(dayB, p);
        const subsA = nextTimetable[keyA]?.subjects ?? [];
        const subsB = nextTimetable[keyB]?.subjects ?? [];
        nextTimetable[keyA] = { subjects: subsB };
        nextTimetable[keyB] = { subjects: subsA };
      }

      const next = { ...state, timetable: nextTimetable };
      saveStateToIdb(next);
      return next;
    });
  },

  clearTimetable: () => {
    set(state => {
      if (state.stages.stage3) throw new Error(MSG.S6_LOCKED);
      const next = { ...state, timetable: createInitialTimetable() };
      saveStateToIdb(next);
      return next;
    });
  },

  applyIdealRecommendation: () => {
    const state = get();
    if (state.stages.stage3) throw new Error(MSG.S6_LOCKED);

    let evalSubjects = state.evalSubjects;
    if (evalSubjects.length === 0) {
      evalSubjects = state.subjectSummary.filter(s => state.evalTargets[s.subject]);
      if (evalSubjects.length === 0) {
        evalSubjects = state.subjectSummary;
      }
    }

    const takers = buildTakers(state.neis, evalSubjects);
    let students = state.students;
    if (students.length === 0) {
      students = buildStudents(state.neis, evalSubjects);
    }

    const activeDayIndices = state.days
      .filter(d => d.date && d.date.trim() !== '')
      .map(d => d.day);
    const activeDays = (activeDayIndices.length > 0 ? activeDayIndices : [1, 2, 3, 4]) as DayIdx[];

    const res = recommendIdealTimetable(
      evalSubjects,
      takers,
      students,
      activeDays,
      state.times,
      state.settings?.maxSubjectsPerSlot || 4
    );

    set(curr => {
      const next = {
        ...curr,
        evalSubjects,
        students,
        timetable: res.timetable,
      };
      saveStateToIdb(next);
      return next;
    });

    return res;
  },

  confirmStage3: () => {
    set(state => {
      const nextState = confirmStage3(state);
      const next = { ...nextState, stages: { ...nextState.stages, step6: true } };
      saveStateToIdb(next, true, '[확정] 6단계. 시간표작성 확정');
      return next;
    });
  },

  cancelStage3: () => {
    set(state => {
      const nextState = cancelStage3(state);
      const next = { ...nextState, stages: { ...nextState.stages, step6: false } };
      saveStateToIdb(next);
      return next;
    });
  },

  swapPlacementCells: (slotIndex, roomId1, roomId2) => {
    set(state => {
      if (state.stages.step7) throw new Error(MSG.S7_ROOMS_LOCKED);
      if (state.lockedCells?.[slotIndex]?.[roomId1] || state.lockedCells?.[slotIndex]?.[roomId2]) {
        return state;
      }
      const row = { ...(state.placement[slotIndex] ?? {}) };
      const val1 = row[roomId1] || '';
      const val2 = row[roomId2] || '';
      
      if (val2 === '') delete row[roomId1];
      else row[roomId1] = val2;

      if (val1 === '') delete row[roomId2];
      else row[roomId2] = val1;

      const nextPlacement = { ...state.placement, [slotIndex]: row };
      
      const pSlots = selPlacementSlots(state);
      const entries = selSubjectBanEntries(state);

      let existingSp = state.studentPlacements?.[slotIndex];
      if (!existingSp || Object.keys(existingSp).length === 0) {
        existingSp = initSlotStudentPlacements(
          slotIndex,
          state.placement[slotIndex] ?? {},
          pSlots,
          state.rooms,
          entries,
          state.students,
          state.neis
        );
      }

      const sp = { ...existingSp };
      Object.keys(sp).forEach(key => {
        if (sp[key] === roomId1) sp[key] = roomId2;
        else if (sp[key] === roomId2) sp[key] = roomId1;
      });
      const nextStudentPlacements = { ...state.studentPlacements, [slotIndex]: sp };

      const next = { ...state, placement: nextPlacement, studentPlacements: nextStudentPlacements };
      saveStateToIdb(next);
      return next;
    });
  },

  setPlacementCell: (slotIndex, roomId, value) => {
    set(state => {
      if (state.stages.step7) throw new Error(MSG.S7_ROOMS_LOCKED);
      if (state.lockedCells?.[slotIndex]?.[roomId]) {
        return state;
      }
      const row = { ...(state.placement[slotIndex] ?? {}) };
      if (value === '') {
        delete row[roomId];
      } else {
        row[roomId] = value;
      }
      const nextPlacement = { ...state.placement, [slotIndex]: row };

      const pSlots = selPlacementSlots(state);
      const entries = selSubjectBanEntries(state);
      let nextStudentPlacements = state.studentPlacements;
      if (state.studentPlacements?.[slotIndex] && Object.keys(state.studentPlacements[slotIndex]).length > 0) {
        const updatedSlotSp = initSlotStudentPlacements(
          slotIndex,
          row,
          pSlots,
          state.rooms,
          entries,
          state.students,
          state.neis,
          state.studentPlacements[slotIndex],
          state.lockedCells?.[slotIndex]
        );
        nextStudentPlacements = { ...state.studentPlacements, [slotIndex]: updatedSlotSp };
      }

      const next = { ...state, placement: nextPlacement, studentPlacements: nextStudentPlacements };
      saveStateToIdb(next);
      return next;
    });
  },

  setLockedCell: (slotIndex, roomId, locked) => {
    set(state => {
      const lockedCells = { ...(state.lockedCells || {}) };
      const row = { ...(lockedCells[slotIndex] || {}) };
      row[roomId] = locked;
      lockedCells[slotIndex] = row;
      const next = { ...state, lockedCells };
      saveStateToIdb(next);
      return next;
    });
  },

  setSlotRoomCapacity: (slotIndex, roomId, capacity) => {
    set(state => {
      const slotRoomCapacity = { ...(state.slotRoomCapacity || {}) };
      const row = { ...(slotRoomCapacity[slotIndex] || {}) };

      if (capacity === null || !Number.isFinite(capacity) || capacity <= 0) {
        delete row[roomId];
      } else {
        row[roomId] = Math.floor(capacity);
      }

      // 예외가 하나도 남지 않은 교시는 아예 비워 두어 저장 파일이 불필요하게 커지지 않게 합니다.
      if (Object.keys(row).length === 0) {
        delete slotRoomCapacity[slotIndex];
      } else {
        slotRoomCapacity[slotIndex] = row;
      }

      const next = { ...state, slotRoomCapacity };
      saveStateToIdb(next);
      return next;
    });
  },

  setSlotBanLabel: (slotIndex, roomId, label) => {
    set(state => {
      const all = { ...(state.slotBanLabels || {}) };
      const row = { ...(all[slotIndex] || {}) };
      const clean = (label ?? '').trim();
      if (clean) row[roomId] = clean;
      else delete row[roomId];
      if (Object.keys(row).length === 0) delete all[slotIndex];
      else all[slotIndex] = row;
      const next = { ...state, slotBanLabels: all };
      saveStateToIdb(next);
      return next;
    });
  },

  setSlotBanLabelStyle: (slotIndex, style) => {
    set(state => {
      const all = { ...(state.slotBanLabelStyle || {}) };
      if (style) all[slotIndex] = style;
      else delete all[slotIndex];
      const next = { ...state, slotBanLabelStyle: all };
      saveStateToIdb(next);
      return next;
    });
  },

  setSlotCapacityBasis: (slotIndex, basis) => {
    set(state => {
      const all = { ...(state.slotCapacityBasis || {}) };
      if (basis) all[slotIndex] = basis;
      else delete all[slotIndex];
      const next = { ...state, slotCapacityBasis: all };
      saveStateToIdb(next);
      return next;
    });
  },

  setPlacementGrid: (placement) => {
    set(state => {
      if (state.stages.step7) throw new Error(MSG.S7_ROOMS_LOCKED);
      const next = { ...state, placement };
      saveStateToIdb(next);
      return next;
    });
  },

  transferStudentsAndUpdatePlacement: (slotIndex, transfers) => {
    set(state => {
      if (state.stages.stage4) throw new Error(MSG.S8_STUDENTS_LOCKED);

      const pSlots = selPlacementSlots(state);
      const entries = selSubjectBanEntries(state);

      let existingSp = state.studentPlacements?.[slotIndex];
      if (!existingSp || Object.keys(existingSp).length === 0) {
        existingSp = initSlotStudentPlacements(
          slotIndex,
          state.placement[slotIndex] ?? {},
          pSlots,
          state.rooms,
          entries,
          state.students,
          state.neis
        );
      }

      const curSlotPlacements: Record<string, string> = { ...existingSp };

      for (const [stKey, targetRoomId] of Object.entries(transfers)) {
        if (targetRoomId && targetRoomId !== 'unplaced') {
          const currentRoomId = curSlotPlacements[stKey];
          // Skip if either source or target room is locked
          if (state.lockedCells?.[slotIndex]?.[currentRoomId] || state.lockedCells?.[slotIndex]?.[targetRoomId]) {
            continue;
          }
          // Skip if target room is '배치금지'
          if (state.placement?.[slotIndex]?.[targetRoomId] === '배치금지') {
            continue;
          }
          curSlotPlacements[stKey] = targetRoomId;
        } else {
          // targetRoomId is '' or 'unplaced': remove placement so student becomes unplaced
          const currentRoomId = curSlotPlacements[stKey];
          if (currentRoomId && state.lockedCells?.[slotIndex]?.[currentRoomId]) {
            continue;
          }
          delete curSlotPlacements[stKey];
        }
      }

      const nextRow = { ...(state.placement[slotIndex] ?? {}) };

      for (const room of state.rooms) {
        if (!room.roomName || room.roomName === '0') continue;

        const currentVal = nextRow[room.id] ?? '';
        if (currentVal === '배치금지') continue; // Strictly preserve 배치금지

        const roomStudents = state.students.filter(st => curSlotPlacements[`${st.ban}-${st.num}`] === room.id);
        const count = roomStudents.length;

        if (count === 0) {
          // 담당자가 손으로 열어 둔 빈 대기실은 지우지 않습니다.
          // 한두 명을 옮기려고 미리 열어 둔 실이 사라지면 옮길 곳이 없어집니다.
          if (isWaitCell(currentVal)) {
            nextRow[room.id] = '대기 - 0명';
          } else if (!currentVal) {
            delete nextRow[room.id];
          }
        } else {
          if (currentVal && !isWaitCell(currentVal)) {
            // Keep exam ban key
          } else {
            const isRegularHome = Boolean(room.banName && room.banName.trim() !== '');
            if (isRegularHome) {
              const banKey = room.banName.replace('반', '');
              nextRow[room.id] = `대기${banKey}반 - ${count}명`;
            } else {
              // Extra rooms (별도실1, 별도실2, 별도실3...) are ALWAYS labeled "대기 - N명"
              nextRow[room.id] = `대기 - ${count}명`;
            }
          }
        }
      }

      const nextPlacement = sanitizePlacementGrid({ ...state.placement, [slotIndex]: nextRow }, state.rooms);
      const nextStudentPlacements = { ...(state.studentPlacements ?? {}), [slotIndex]: curSlotPlacements };
      const next = { ...state, placement: nextPlacement, studentPlacements: nextStudentPlacements };
      saveStateToIdb(next);
      return next;
    });
  },

  setSlotStudentPlacements: (slotIndex, placements) => {
    set(state => {
      const nextStudentPlacements = { ...(state.studentPlacements ?? {}), [slotIndex]: placements };
      const next = { ...state, studentPlacements: nextStudentPlacements };
      saveStateToIdb(next);
      return next;
    });
  },
  setAllStudentPlacements: (placements) => {
    set(state => {
      // 이름 그대로 '전부 바꾸기'입니다. 예전에는 기존 값에 덮어쓰기만 해서,
      // 빈 값을 넣어 비우려 해도 비워지지 않고 실행 취소도 제대로 되돌아가지 않았습니다.
      const next = { ...state, studentPlacements: { ...placements } };
      saveStateToIdb(next);
      return next;
    });
  },

  /** 교시·고사실 칸의 잠금을 한꺼번에 바꿉니다 (전체 잠금 / 전체 해제). */
  setAllLockedCells: (locked) => {
    set(state => {
      const next = { ...state, lockedCells: locked };
      saveStateToIdb(next);
      return next;
    });
  },

  clearPlacementSlot: (slotIndex) => {
    set(state => {
      if (state.stages.step7) throw new Error(MSG.S7_ROOMS_LOCKED);
      const nextPlacement = { ...state.placement, [slotIndex]: {} };
      const next = { ...state, placement: nextPlacement };
      saveStateToIdb(next);
      return next;
    });
  },

  setSeparateExaminer: (studentKey, entry) => {
    set(state => {
      const next_ = { ...(state.separateExaminers ?? {}) };
      if (entry) next_[studentKey] = entry;
      else delete next_[studentKey];
      const next = { ...state, separateExaminers: next_ };
      saveStateToIdb(next);
      return next;
    });
  },

  clearAllPlacement: () => {
    set(state => {
      if (state.stages.step7) throw new Error(MSG.S7_ROOMS_LOCKED);
      const next = { ...state, placement: {}, studentPlacements: {}, lockedCells: {} };
      saveStateToIdb(next);
      return next;
    });
  },

  confirmStage4: () => {
    let notices: string[] = [];
    set(state => {
      const res = confirmStage4(state);
      notices = res.notices;
      const next = { ...res.state, stages: { ...res.state.stages, step8: true } };
      saveStateToIdb(next, true, '[확정] 8단계. 학생 배치 확정');
      return next;
    });
    return notices;
  },

  cancelStage4: () => {
    set(state => {
      const nextState = cancelStage4(state);
      const next = { ...nextState, stages: { ...nextState.stages, step8: false } };
      saveStateToIdb(next);
      return next;
    });
  },

  /**
   * 7. 고사장 배치 확정 — 고사실 구성과 정원만 잠급니다.
   * 예전에는 7번과 8번이 같은 플래그(stage4)를 써서, 7번을 확정하면
   * 8번의 자동배치와 학생 이동까지 함께 잠겼습니다.
   */
  confirmStep7Rooms: () => {
    set(state => {
      const next = { ...state, stages: { ...state.stages, step7: true } };
      saveStateToIdb(next, true, '[확정] 7단계. 고사장 배치 확정');
      return next;
    });
  },

  cancelStep7Rooms: () => {
    set(state => {
      const next = { ...state, stages: { ...state.stages, step7: false } };
      saveStateToIdb(next);
      return next;
    });
  },

  updateAttendanceSeat: (key1, seat) => {
    set(state => {
      if (state.stages.stage5) throw new Error(MSG.S8_LOCKED);
      const nextAttendance = state.attendance.map(r => {
        if (r.key1 === key1) {
          return {
            ...r,
            seat,
            key2: `${r.day}${r.period}${r.examRoom}_${seat ?? ''}`,
          };
        }
        return r;
      });
      const next = { ...state, attendance: nextAttendance };
      saveStateToIdb(next);
      return next;
    });
  },

  setAttendanceBySeq: () => {
    set(state => {
      if (state.stages.stage5) throw new Error(MSG.S8_LOCKED);
      const nextAttendance = state.attendance.map(r => ({
        ...r,
        seat: r.seq,
        key2: `${r.day}${r.period}${r.examRoom}_${r.seq}`,
      }));
      const next = { ...state, attendance: nextAttendance };
      saveStateToIdb(next);
      return next;
    });
  },

  setAttendanceRandom: () => {
    set(state => {
      if (state.stages.stage5) throw new Error(MSG.S8_LOCKED);
      const cloned = state.attendance.map(r => ({ ...r }));
      const groups = new Map<string, typeof cloned>();

      for (const r of cloned) {
        const k = `${r.day}_${r.period}_${r.examRoom}_${r.subject}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      }

      for (const [k, g] of groups.entries()) {
        if (k.endsWith('_미응시')) continue;
        const perm = g.map(r => r.seq);
        for (let i = perm.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = perm[i];
          perm[i] = perm[j];
          perm[j] = temp;
        }
        g.forEach((r, idx) => {
          r.seat = perm[idx];
          r.key2 = `${r.day}${r.period}${r.examRoom}_${r.seat}`;
        });
      }

      const next = { ...state, attendance: cloned };
      saveStateToIdb(next);
      return next;
    });
  },

  setSubjectCode: (subject, code) => {
    set(state => {
      const next = { ...state, subjectCodes: { ...state.subjectCodes, [subject]: code } };
      saveStateToIdb(next);
      return next;
    });
  },

  confirmStage5: () => {
    set(state => {
      const nextState = confirmStage5(state);
      const next = { ...nextState, stages: { ...nextState.stages, step8: true } };
      saveStateToIdb(next, true, '[확정] 8단계. 응시현황 확정');
      return next;
    });
  },

  cancelStage5: () => {
    set(state => {
      const nextState = cancelStage5(state);
      const next = { ...nextState, stages: { ...nextState.stages, step8: false } };
      saveStateToIdb(next);
      return next;
    });
  },
}));
