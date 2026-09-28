/**
 * 오프라인 배포판에서 클라우드 자리를 대신하는 빈 껍데기.
 *
 * 왜 두는가.
 *   USB나 공모전 제출본처럼 인터넷 없이 도는 빌드에서는 서버로 나가는 길이
 *   아예 없어야 합니다. 예전에는 파일 프로토콜일 때 함수 첫 줄에서 되돌아
 *   나왔지만, 그래도 파이어베이스 라이브러리와 접속 설정값(키·프로젝트 이름)이
 *   실행 파일 안에 그대로 실려 다녔습니다. 열어 보면 보이고, 심사에서
 *   '키가 박혀 있다'는 말을 듣기 좋습니다.
 *
 *   빌드할 때 이 파일이 `firebase.ts` 자리를 대신합니다. 그러면 라이브러리도
 *   설정값도 실행 파일에 들어가지 않습니다. 화면의 클라우드 단추는 `isLocal`
 *   이 참이라 나오지 않으므로, 쓰는 사람 눈에는 아무 차이가 없습니다.
 *
 * 규칙: `firebase.ts` 가 내보내는 이름은 여기에도 모두 있어야 합니다.
 *       하나라도 빠지면 오프라인 빌드가 깨집니다.
 */
import { AppState } from './types';

/** 서버가 없으므로 아무것도 가리키지 않습니다. */
export const db = null as unknown as never;

/* ── 작업 공간 키 ─────────────────────────────────────────────────────────
 * 서버가 없으면 공간을 나눌 일도 없습니다. 빈 값을 돌려주고, 바꾸려 하면
 * 바뀌지 않았다고 알립니다. 화면에서 이 기능은 아예 보이지 않습니다.
 */
export function getWorkspaceKey(): string {
  return '';
}

export function setWorkspaceKey(_key: string): boolean {
  return false;
}

export function workspaceLink(): string {
  return '';
}

export type CloudSyncStatus = 'idle' | 'saving' | 'saved' | 'error';

export function onSyncStatusChange(_callback: (status: CloudSyncStatus) => void) {
  // 상태가 바뀔 일이 없습니다. 해지 함수만 돌려줍니다.
  return () => { /* 아무것도 하지 않습니다 */ };
}

export function setSyncStatus(_status: CloudSyncStatus) { /* 아무것도 하지 않습니다 */ }

export function triggerCloudAutoSave(_state: AppState) { /* 아무것도 하지 않습니다 */ }

/**
 * 참을 돌려줍니다.
 *
 * 부르는 쪽은 '확정하고 저장까지 끝났는가'를 묻습니다. 오프라인에서는 저장이
 * 이 컴퓨터 안에서 이미 끝났으므로, 거짓을 돌려주면 멀쩡한 확정이 실패로
 * 보입니다. 서버에 보낼 것이 없다는 뜻에서 참입니다.
 */
export async function saveCloudImmediately(_state: AppState, _snapshotTitle?: string): Promise<boolean> {
  return true;
}

export async function saveCurrentStateToCloud(_state: AppState): Promise<boolean> {
  return true;
}

export async function loadLatestStateFromCloud(): Promise<{ state: AppState; title: string; updatedAt: string } | null> {
  return null;
}

export interface CloudSnapshotMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export async function saveSnapshotToCloud(_state: AppState, _title?: string): Promise<string> {
  return '';
}

export async function listCloudSnapshots(): Promise<CloudSnapshotMeta[]> {
  return [];
}

export async function loadSnapshotFromCloud(_id: string): Promise<AppState | null> {
  return null;
}

export async function deleteCloudSnapshot(_id: string): Promise<boolean> {
  return false;
}
