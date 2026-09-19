import * as LZStringModule from 'lz-string';
const LZString = (LZStringModule as any).default || LZStringModule;
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { AppState } from './types';

const firebaseConfig = {
  apiKey: "AIzaSyClQdRIlbNJMy8qyQacFqqRJoNPSj23jo8",
  authDomain: "school-schedule-ad811.firebaseapp.com",
  projectId: "school-schedule-ad811",
  storageBucket: "school-schedule-ad811.appspot.com",
  messagingSenderId: "789522158878",
  appId: "1:789522158878:web:7836bf982b8d7c7f44250f"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);


const isLocal = window.location.protocol === 'file:';
export type CloudSyncStatus = 'idle' | 'saving' | 'saved' | 'error';
let currentSyncStatus: CloudSyncStatus = 'saved';
const listeners: Set<(status: CloudSyncStatus) => void> = new Set();

export function onSyncStatusChange(callback: (status: CloudSyncStatus) => void) {
  listeners.add(callback);
  callback(currentSyncStatus);
  return () => {
    listeners.delete(callback);
  };
}

export function setSyncStatus(status: CloudSyncStatus) {
  currentSyncStatus = status;
  listeners.forEach(fn => fn(status));
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function triggerCloudAutoSave(state: AppState) {
  if (isLocal) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  setSyncStatus('saving');
  saveTimer = setTimeout(async () => {
    try {
      await saveCurrentStateToCloud(state);
      setSyncStatus('saved');
    } catch (err) {
      console.error('Cloud auto-save error:', err);
      setSyncStatus('error');
    }
  }, 400);
}

export async function saveCloudImmediately(state: AppState, snapshotTitle?: string): Promise<boolean> {
  if (isLocal) return true;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  setSyncStatus('saving');
  try {
    await saveCurrentStateToCloud(state);
    if (snapshotTitle) {
      await saveSnapshotToCloud(state, snapshotTitle);
    }
    setSyncStatus('saved');
    return true;
  } catch (err) {
    console.error('Immediate cloud save error:', err);
    setSyncStatus('error');
    return false;
  }
}

export async function saveCurrentStateToCloud(state: AppState): Promise<boolean> {
  try {
    const docRef = doc(db, 'exam_saves', 'latest');
    const payload = {
      title: state.meta?.title || '시험시간표',
      updatedAt: new Date().toISOString(),
      stateJsonLz: LZString.compressToBase64(JSON.stringify(state)),
    };
    await setDoc(docRef, payload);
    return true;
  } catch (err) {
    console.error('Failed to save to Firestore:', err);
    throw err;
  }
}

export async function loadLatestStateFromCloud(): Promise<{ state: AppState; title: string; updatedAt: string } | null> {
  if (isLocal) return null;
  try {
    const docRef = doc(db, 'exam_saves', 'latest');
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data || (!data.stateJson && !data.stateJsonLz)) return null;
    const stateStr = data.stateJsonLz ? LZString.decompressFromBase64(data.stateJsonLz) : data.stateJson;
    if (!stateStr) return null;
    const state = JSON.parse(stateStr) as AppState;
    return {
      state,
      title: data.title || state.meta?.title || '시험시간표',
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error('Failed to load from Firestore:', err);
    return null;
  }
}

export interface CloudSnapshotMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export async function saveSnapshotToCloud(state: AppState, title?: string): Promise<string> {
  const id = `snap_${Date.now()}`;
  const snapTitle = title || state.meta?.title || `스냅샷_${new Date().toLocaleDateString()}`;
  const docRef = doc(db, 'exam_snapshots', id);
  const payload = {
    id,
    title: snapTitle,
    updatedAt: new Date().toISOString(),
    stateJsonLz: LZString.compressToBase64(JSON.stringify(state)),
  };
  await setDoc(docRef, payload);
  return id;
}

export async function listCloudSnapshots(): Promise<CloudSnapshotMeta[]> {
  try {
    const colRef = collection(db, 'exam_snapshots');
    const snap = await getDocs(colRef);
    const result: CloudSnapshotMeta[] = [];
    snap.forEach(d => {
      const data = d.data();
      result.push({
        id: d.id,
        title: data.title || d.id,
        updatedAt: data.updatedAt || new Date().toISOString(),
      });
    });
    return result.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  } catch (err) {
    console.error('Failed to list cloud snapshots:', err);
    return [];
  }
}

export async function loadSnapshotFromCloud(id: string): Promise<AppState | null> {
  try {
    const docRef = doc(db, 'exam_snapshots', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data || (!data.stateJson && !data.stateJsonLz)) return null;
    const stateStr = data.stateJsonLz ? LZString.decompressFromBase64(data.stateJsonLz) : data.stateJson;
    if (!stateStr) return null;
    return JSON.parse(stateStr) as AppState;
  } catch (err) {
    console.error('Failed to load cloud snapshot:', err);
    return null;
  }
}

export async function deleteCloudSnapshot(id: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'exam_snapshots', id);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error('Failed to delete cloud snapshot:', err);
    return false;
  }
}
