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

/* ── 작업 공간 키 ──────────────────────────────────────────────────────────
 *
 * 이 앱은 로그인이 없습니다. 예전에는 모든 사람이 서버의 한 문서
 * (exam_saves/latest)를 같이 썼습니다. 누구나 읽을 수 있었고, 두 학교가
 * 쓰면 서로 덮어썼습니다.
 *
 * 이제 브라우저마다 아무도 짐작할 수 없는 32자리 키를 만들고, 서버에는
 * workspaces/{키} 아래에만 저장합니다. 키를 모르면 읽을 수 없고(규칙이
 * 목록 조회를 막습니다), 키를 아는 사람끼리는 같은 작업을 이어 갑니다.
 *
 * 다른 컴퓨터에서 이어 가려면 키를 옮기면 됩니다. 주소 뒤에 ?ws=키 를
 * 붙여 한 번 열면 그 브라우저가 키를 기억합니다.
 */
const KEY_STORAGE = 'exam.workspaceKey';
const KEY_RE = /^[a-f0-9]{32}$/;

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function readStoredKey(): string | null {
  try {
    const v = localStorage.getItem(KEY_STORAGE);
    return v && KEY_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** 주소에 ?ws=키 가 있으면 받아 두고, 주소에서는 지웁니다(북마크·화면 공유에 남지 않게). */
function adoptKeyFromUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const ws = url.searchParams.get('ws');
    if (!ws || !KEY_RE.test(ws)) return null;
    localStorage.setItem(KEY_STORAGE, ws);
    url.searchParams.delete('ws');
    window.history.replaceState(null, '', url.toString());
    return ws;
  } catch {
    return null;
  }
}

let workspaceKey: string = adoptKeyFromUrl() ?? readStoredKey() ?? '';

/** 지금 이 브라우저의 작업 공간 키. 없으면 새로 만들어 기억합니다. */
export function getWorkspaceKey(): string {
  if (!workspaceKey) {
    workspaceKey = randomKey();
    try { localStorage.setItem(KEY_STORAGE, workspaceKey); } catch { /* 저장 못 해도 이번 세션은 씁니다 */ }
  }
  return workspaceKey;
}

/** 다른 컴퓨터의 키로 바꿉니다. 모양이 틀리면 false. */
export function setWorkspaceKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (!KEY_RE.test(k)) return false;
  workspaceKey = k;
  try { localStorage.setItem(KEY_STORAGE, k); } catch { /* 위와 같음 */ }
  return true;
}

/** 다른 컴퓨터에서 한 번 열면 같은 작업 공간이 되는 주소. */
export function workspaceLink(): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('ws', getWorkspaceKey());
  return url.toString();
}

const latestRef = () => doc(db, 'workspaces', getWorkspaceKey());
const snapshotsRef = () => collection(db, 'workspaces', getWorkspaceKey(), 'snapshots');
const snapshotRef = (id: string) => doc(db, 'workspaces', getWorkspaceKey(), 'snapshots', id);

/* ── 동기화 상태 ─────────────────────────────────────────────────────── */
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
    const payload = {
      title: state.meta?.title || '시험시간표',
      updatedAt: new Date().toISOString(),
      stateJsonLz: LZString.compressToBase64(JSON.stringify(state)),
    };
    await setDoc(latestRef(), payload);
    return true;
  } catch (err) {
    console.error('Failed to save to Firestore:', err);
    throw err;
  }
}

export async function loadLatestStateFromCloud(): Promise<{ state: AppState; title: string; updatedAt: string } | null> {
  if (isLocal) return null;
  try {
    const snap = await getDoc(latestRef());
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
  const payload = {
    id,
    title: snapTitle,
    updatedAt: new Date().toISOString(),
    stateJsonLz: LZString.compressToBase64(JSON.stringify(state)),
  };
  await setDoc(snapshotRef(id), payload);
  return id;
}

export async function listCloudSnapshots(): Promise<CloudSnapshotMeta[]> {
  try {
    const snap = await getDocs(snapshotsRef());
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
    const snap = await getDoc(snapshotRef(id));
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
    await deleteDoc(snapshotRef(id));
    return true;
  } catch (err) {
    console.error('Failed to delete cloud snapshot:', err);
    return false;
  }
}
