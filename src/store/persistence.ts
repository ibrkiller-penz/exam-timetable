import { get, set, del } from 'idb-keyval';
import { AppState, ExamDay, ExamTime, ExamRoom, Settings } from '../domain/types';
import { triggerCloudAutoSave, saveCloudImmediately } from '../domain/firebase';

const STORAGE_KEY = 'exam-state-v1';
const BASE_INFO_KEY = 'exam_base_info_defaults_v1';
const EVAL_TARGETS_PRESET_KEY = 'exam_saved_eval_targets_v1';

let isStoreInitialized = false;

export function setStoreInitialized(value: boolean = true) {
  isStoreInitialized = value;
}

export function isStoreFullyInitialized(): boolean {
  return isStoreInitialized;
}

declare global {
  interface Window {
    electronAPI?: {
      initialSyncData?: string | null;
      saveFile: (filename: string, data: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      loadFile: (filename: string) => Promise<{ success: boolean; data: string | null }>;
      listFiles: () => Promise<string[]>;
      deleteFile: (filename: string) => Promise<{ success: boolean }>;
      saveAsDialog: (defaultName: string, data: string) => Promise<{ success: boolean; filePath?: string; filename?: string }>;
      openFileDialog: () => Promise<{ success: boolean; data?: string; filename?: string }>;
      isElectron?: boolean;
    };
  }
}

export async function saveStateToIdb(state: AppState, isImmediate: boolean = false, snapshotTitle?: string): Promise<void> {
  if (!isStoreInitialized) {
    // Prevent overwriting stored state with uninitialized default state before rehydration completes
    return;
  }

  // 1. If running in Electron, save directly to local disk JSON file
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      await window.electronAPI.saveFile('_auto_save_state.json', JSON.stringify(state));
    } catch (e) {
      console.warn('Electron auto-save error:', e);
    }
  }

  // 2. Also save to IndexedDB for web browser
  try {
    await set(STORAGE_KEY, state);
  } catch (err) {
    // Ignore IndexedDB error when running under file:// protocol
  }

  if (isImmediate) {
    // Immediate direct Cloud Firestore save (non-debounced)
    await saveCloudImmediately(state, snapshotTitle);
  } else {
    // Fast 400ms debounced Cloud Firestore Auto-save
    triggerCloudAutoSave(state);
  }

  // Also auto-save current base info (days, times, rooms, settings, evalTargets) as defaults
  if (state.days?.some(d => d.date) || state.rooms?.length > 0 || state.times?.some(t => t.time) || (state.evalTargets && Object.keys(state.evalTargets).length > 0)) {
    saveBaseInfoDefaults({
      days: state.days,
      times: state.times,
      rooms: state.rooms,
      settings: state.settings,
      evalTargets: state.evalTargets,
    });
  }
}

export async function loadStateFromIdb(): Promise<AppState | null> {
  // 1. If running in Electron, check synchronous preloaded data first (0ms instantaneous!)
  if (typeof window !== 'undefined' && window.electronAPI) {
    if (window.electronAPI.initialSyncData) {
      try {
        return JSON.parse(window.electronAPI.initialSyncData) as AppState;
      } catch (e) {}
    }
    try {
      const res = await window.electronAPI.loadFile('_auto_save_state.json');
      if (res && res.success && res.data) {
        return JSON.parse(res.data) as AppState;
      }
    } catch (e) {
      console.warn('Electron file load error, falling back:', e);
    }
  }

  // 2. Fallback to IndexedDB (web browser)
  try {
    const data = await get<AppState>(STORAGE_KEY);
    return data || null;
  } catch (err) {
    console.warn('IndexedDB unaccessible in current origin:', err);
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

export interface BaseInfoDefaults {
  days: ExamDay[];
  times: ExamTime[];
  rooms: ExamRoom[];
  settings?: Settings;
  evalTargets?: Record<string, boolean>;
}

export function saveBaseInfoDefaults(defaults: BaseInfoDefaults): void {
  try {
    const existing = loadBaseInfoDefaults() || { days: [], times: [], rooms: [] };
    const merged: BaseInfoDefaults = {
      ...existing,
      ...defaults,
      evalTargets: defaults.evalTargets || existing.evalTargets,
    };
    localStorage.setItem(BASE_INFO_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('Failed to save base info defaults:', e);
  }
}

export function loadBaseInfoDefaults(): BaseInfoDefaults | null {
  try {
    const raw = localStorage.getItem(BASE_INFO_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export interface EvalTargetsPreset {
  savedAt: string;
  selectedSubjects: string[];
  totalSaved: number;
}

export function saveEvalTargetsPreset(evalTargets: Record<string, boolean>): EvalTargetsPreset {
  const selectedSubjects = Object.keys(evalTargets).filter(k => evalTargets[k]);
  const preset: EvalTargetsPreset = {
    savedAt: new Date().toISOString(),
    selectedSubjects,
    totalSaved: selectedSubjects.length,
  };
  try {
    localStorage.setItem(EVAL_TARGETS_PRESET_KEY, JSON.stringify(preset));
  } catch (e) {
    console.error('Failed to save eval targets preset:', e);
  }
  return preset;
}

export function loadEvalTargetsPreset(): EvalTargetsPreset | null {
  try {
    const raw = localStorage.getItem(EVAL_TARGETS_PRESET_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
