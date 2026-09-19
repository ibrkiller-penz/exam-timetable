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

// 1. persistence.ts
write('src/store/persistence.ts', `
import { get, set, del } from 'idb-keyval';
import { AppState } from '../domain/types';

const STORAGE_KEY = 'exam-state-v1';

export async function saveStateToIdb(state: AppState): Promise<void> {
  try {
    await set(STORAGE_KEY, state);
  } catch (err) {
    console.error('Failed to save state to IndexedDB:', err);
  }
}

export async function loadStateFromIdb(): Promise<AppState | null> {
  try {
    const data = await get<AppState>(STORAGE_KEY);
    return data || null;
  } catch (err) {
    console.error('Failed to load state from IndexedDB:', err);
    return null;
  }
}

export async function clearStateIdb(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear state from IndexedDB:', err);
  }
}
`);

// 2. selectors.ts
write('src/store/selectors.ts', `
import { AppState, SlotKey, ExamRoom, PlacementSlot, SlotSummary, StudentKey, SubjectBanKey, SubjectBanEntry, CellInfo } from '../domain/types';
import { subjectBanEntries, slotSummary as calcSlotSummary, cellInfo as calcCellInfo, waitByBan as calcWaitByBan, cellDerived } from '../domain/placement';
import { buildTakers } from '../domain/subjects';
import { buildPlacementInfo } from '../domain/placementInfo';
import { duplicateSubjects, remainSubjects, canSubjectsForSlot, dayLoad } from '../domain/timetable';

export const selGrade = (state: AppState): string => {
  if (state.neis.length > 1 && state.neis[1]?.grade) {
    return state.neis[1].grade.charAt(0);
  }
  return state.neis[0]?.grade?.charAt(0) ?? '1';
};

export const selTotalStudents = (state: AppState): number => {
  return state.rooms.reduce((acc, r) => acc + (r.stuCount ?? 0), 0);
};

export const selHasConvenience = (state: AppState): boolean => {
  return state.neis.some(r => r.room.includes('편의'));
};

export const selSubjectBanEntries = (state: AppState): Map<SubjectBanKey, SubjectBanEntry> => {
  return subjectBanEntries(state.subjectBans);
};

export const selTakersBySubject = (state: AppState): Map<string, Set<StudentKey>> => {
  return buildTakers(state.neis, state.evalSubjects);
};

export const selPlacementSlots = (state: AppState): PlacementSlot[] => {
  return buildPlacementInfo(state.timetable, state.students, state.evalSubjects);
};

export const selDuplicateSubjects = (state: AppState): string[] => {
  return duplicateSubjects(state.timetable);
};

export const selRemainSubjects = (state: AppState): string[] => {
  return remainSubjects(state.evalSubjects, state.timetable);
};

export const selCanSubjects = (state: AppState, slot: SlotKey | null): string[] => {
  const takers = selTakersBySubject(state);
  return canSubjectsForSlot(slot, state.evalSubjects, state.timetable, takers);
};

export const selDayLoad = (state: AppState, day: 1 | 2 | 3 | 4 | 5) => {
  return dayLoad(day, state.timetable, state.students);
};

export const selSlotSummary = (state: AppState, slotIndex: number): SlotSummary => {
  const pSlots = selPlacementSlots(state);
  const entries = selSubjectBanEntries(state);
  return calcSlotSummary(slotIndex, state.placement, pSlots, entries);
};

export const selCellInfo = (state: AppState, slotIndex: number, roomId: string): CellInfo | null => {
  const pSlots = selPlacementSlots(state);
  const entries = selSubjectBanEntries(state);
  return calcCellInfo(slotIndex, roomId, state.placement, pSlots, state.rooms, entries);
};

export const selExtraRooms = (state: AppState): ExamRoom[] => {
  return state.rooms.filter(r => (r.maxClassSize === null || r.maxClassSize === 0) && r.capacity > 0);
};
`);

// 3. appStore.ts
write('src/store/appStore.ts', `
import { create } from 'zustand';
import { AppState, SlotKey, DayIdx, PeriodIdx, CellValue, ExamDay, ExamTime, ExamRoom } from '../domain/types';
import { createInitialDays, createInitialTimes, createInitialTimetable, APP_VERSION } from '../domain/constants';
import { MSG } from '../domain/messages';
import { confirmStage1, cancelStage1, confirmStage2, cancelStage2, confirmStage3, cancelStage3, confirmStage4, cancelStage4, confirmStage5, cancelStage5 } from '../domain/stages';
import { moveToConvenience, deleteStudent } from '../domain/baseData';
import { saveStateToIdb, loadStateFromIdb, clearStateIdb } from './persistence';

export const createInitialState = (): AppState => ({
  meta: {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    title: MSG.TITLE_DEFAULT,
    sourceFileName: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  settings: {
    maxSubjectsPerSlot: 4,
    seatColumns: 5,
    seatsPerColumn: 8,
    labelsPerPage: 2,
    showSeatOnStudentTable: true,
  },
  stages: {
    stage1: false,
    stage2: false,
    stage3: false,
    stage4: false,
    stage5: false,
  },
  neis: [],
  days: createInitialDays(),
  times: createInitialTimes(),
  rooms: [],
  subjectSummary: [],
  subjectBans: [],
  evalTargets: {},
  evalSubjects: [],
  compat: [],
  compatOverflow: false,
  students: [],
  timetable: createInitialTimetable(),
  placement: {},
  attendance: [],
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
});

interface AppStoreActions {
  // Persistence & Lifecycle
  initStore: () => Promise<void>;
  resetAll: () => Promise<void>;
  loadSavedState: (state: AppState) => Promise<void>;

  // Meta & Settings
  setTitle: (title: string) => void;
  updateSettings: (settings: Partial<AppState['settings']>) => void;

  // UI state
  setSelectedTimetableSlot: (slot: SlotKey | null) => void;
  setSelectedPlacementCell: (cell: { slot: number; roomId: string } | null) => void;
  setReportSelection: (report: Partial<AppState['ui']['report']>) => void;

  // Stage 1 (Neis & BaseData)
  setNeisData: (neis: AppState['neis'], fileName: string) => void;
  moveToConvenience: (ban: string, num: number) => void;
  deleteStudent: (ban: string, num: number) => void;
  confirmStage1: () => void;
  cancelStage1: () => void;

  // Stage 2 (Basic Info & Eval Targets)
  setExamDays: (days: ExamDay[]) => void;
  setExamTimes: (times: ExamTime[]) => void;
  setRooms: (rooms: ExamRoom[]) => void;
  updateRoom: (id: string, partial: Partial<ExamRoom>) => void;
  addExtraRoom: () => void;
  deleteRoom: (id: string) => void;
  toggleEvalTarget: (subject: string) => void;
  setAllEvalTargets: (value: boolean) => void;
  confirmStage2: () => void;
  cancelStage2: () => void;

  // Stage 3 (Timetable)
  setTimetableSlot: (slot: SlotKey, subjects: string[]) => void;
  swapTimetableSubjects: (sub1: string, sub2: string) => void;
  clearTimetable: () => void;
  confirmStage3: () => void;
  cancelStage3: () => void;

  // Stage 4 (Placement)
  setPlacementCell: (slotIndex: number, roomId: string, value: CellValue) => void;
  setPlacementGrid: (placement: AppState['placement']) => void;
  clearPlacementSlot: (slotIndex: number) => void;
  clearAllPlacement: () => void;
  confirmStage4: () => string[]; // returns notices
  cancelStage4: () => void;

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
    const saved = await loadStateFromIdb();
    if (saved) {
      set(saved);
    }
  },

  resetAll: async () => {
    const initial = createInitialState();
    set(initial);
    await clearStateIdb();
  },

  loadSavedState: async (newState: AppState) => {
    set(newState);
    await saveStateToIdb(newState);
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

  setNeisData: (neis, fileName) => {
    set(state => {
      const grade = neis[0]?.grade?.charAt(0) ?? '1';
      const year = neis[0]?.year ?? '2026';
      const sem = neis[0]?.semester ?? '2';
      const defaultTitle = \`\${year}학년도 \${grade}학년 \${sem}학기 중간고사  시험시간표\`;

      const next: AppState = {
        ...createInitialState(),
        neis,
        meta: {
          ...state.meta,
          sourceFileName: fileName,
          title: defaultTitle,
          updatedAt: new Date().toISOString(),
        },
      };
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

  confirmStage1: () => {
    set(state => {
      const next = confirmStage1(state);
      saveStateToIdb(next);
      return next;
    });
  },

  cancelStage1: () => {
    set(state => {
      const next = cancelStage1(state);
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
      const nextRooms = state.rooms.map(r => (r.id === id ? { ...r, ...partial } : r));
      const next = { ...state, rooms: nextRooms };
      saveStateToIdb(next);
      return next;
    });
  },

  addExtraRoom: () => {
    set(state => {
      const existingExtras = state.rooms.filter(r => r.roomName.startsWith('별도실'));
      const num = existingExtras.length + 1;
      const newRoom: ExamRoom = {
        id: \`extra_\${Date.now()}_\${num}\`,
        banName: '',
        stuCount: null,
        maxClassSize: null,
        roomName: \`별도실\${num}\`,
        capacity: 30,
      };
      const next = { ...state, rooms: [...state.rooms, newRoom] };
      saveStateToIdb(next);
      return next;
    });
  },

  deleteRoom: (id) => {
    set(state => {
      const next = { ...state, rooms: state.rooms.filter(r => r.id !== id) };
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

  confirmStage2: () => {
    set(state => {
      const next = confirmStage2(state);
      saveStateToIdb(next);
      return next;
    });
  },

  cancelStage2: () => {
    set(state => {
      const next = cancelStage2(state);
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

  clearTimetable: () => {
    set(state => {
      if (state.stages.stage3) throw new Error(MSG.S6_LOCKED);
      const next = { ...state, timetable: createInitialTimetable() };
      saveStateToIdb(next);
      return next;
    });
  },

  confirmStage3: () => {
    set(state => {
      const next = confirmStage3(state);
      saveStateToIdb(next);
      return next;
    });
  },

  cancelStage3: () => {
    set(state => {
      const next = cancelStage3(state);
      saveStateToIdb(next);
      return next;
    });
  },

  setPlacementCell: (slotIndex, roomId, value) => {
    set(state => {
      if (state.stages.stage4) throw new Error(MSG.S7_LOCKED);
      const row = { ...(state.placement[slotIndex] ?? {}) };
      if (value === '') {
        delete row[roomId];
      } else {
        row[roomId] = value;
      }
      const nextPlacement = { ...state.placement, [slotIndex]: row };
      const next = { ...state, placement: nextPlacement };
      saveStateToIdb(next);
      return next;
    });
  },

  setPlacementGrid: (placement) => {
    set(state => {
      if (state.stages.stage4) throw new Error(MSG.S7_LOCKED);
      const next = { ...state, placement };
      saveStateToIdb(next);
      return next;
    });
  },

  clearPlacementSlot: (slotIndex) => {
    set(state => {
      if (state.stages.stage4) throw new Error(MSG.S7_LOCKED);
      const nextPlacement = { ...state.placement, [slotIndex]: {} };
      const next = { ...state, placement: nextPlacement };
      saveStateToIdb(next);
      return next;
    });
  },

  clearAllPlacement: () => {
    set(state => {
      if (state.stages.stage4) throw new Error(MSG.S7_LOCKED);
      const next = { ...state, placement: {} };
      saveStateToIdb(next);
      return next;
    });
  },

  confirmStage4: () => {
    let notices: string[] = [];
    set(state => {
      const res = confirmStage4(state);
      notices = res.notices;
      saveStateToIdb(res.state);
      return res.state;
    });
    return notices;
  },

  cancelStage4: () => {
    set(state => {
      const next = cancelStage4(state);
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
            key2: \`\${r.day}\${r.period}\${r.examRoom}_\${seat ?? ''}\`,
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
        key2: \`\${r.day}\${r.period}\${r.examRoom}_\${r.seq}\`,
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
        const k = \`\${r.day}_\${r.period}_\${r.examRoom}_\${r.subject}\`;
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
          r.key2 = \`\${r.day}\${r.period}\${r.examRoom}_\${r.seat}\`;
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
      const next = confirmStage5(state);
      saveStateToIdb(next);
      return next;
    });
  },

  cancelStage5: () => {
    set(state => {
      const next = cancelStage5(state);
      saveStateToIdb(next);
      return next;
    });
  },
}));
`);

console.log('Part 4 (Store) written.');
