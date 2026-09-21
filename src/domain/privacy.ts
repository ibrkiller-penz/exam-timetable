import { isLocal } from '../utils/electronBridge';

/**
 * 학생 이름 가리기.
 *
 * 웹 주소로 열었을 때만 가립니다. 인터넷에 올라가 있는 화면은 지나가는 사람도
 * 보게 되므로, 기본은 가린 상태이고 비밀번호로 푼 기기에서만 보입니다.
 * 푼 상태는 브라우저(localStorage)에만 둡니다. 작업 파일이나 서버에 저장되지
 * 않으므로, 다른 기기에서 열면 다시 가려집니다.
 *
 * 오프라인(USB) 버전에서는 가리지 않습니다. 프로그램이 학교 컴퓨터 안에서만
 * 돌고 학생 정보가 밖으로 나가지 않으니, 그 자체가 이미 보호막입니다.
 * 그 안에서 또 가리면 명단을 볼 때마다 비밀번호를 넣어야 해 일만 늘어납니다.
 */

const STORAGE_KEY = 'examtable.showStudentNames';
const UNLOCK_CODE = '1004';

/**
 * 인쇄 전 확인창에서만 잠깐 켜는 가리기.
 *
 * 확인창은 '이 종이가 맞나'를 보는 자리지 명단을 읽는 자리가 아닙니다.
 * 교무실 화면에 마흔 장이 한꺼번에 펼쳐지므로, 여기서만은 오프라인
 * 버전이든 이름을 푼 기기든 가리고 보여 줍니다. 종이에는 본명이 찍힙니다.
 *
 * 저장하지 않습니다. 확인창이 닫히면 원래대로 돌아옵니다.
 */
let previewMask = false;
const maskListeners = new Set<() => void>();

/** 확인창이 켜고 끕니다. 화면이 다시 그려지도록 듣고 있는 곳에 알립니다. */
export function setPreviewMask(on: boolean): void {
  if (previewMask === on) return;
  previewMask = on;
  maskListeners.forEach(fn => fn());
}

/** 지금 확인창용으로 가리고 있는지. */
export function isPreviewMask(): boolean {
  return previewMask;
}

/** 가리기가 켜지고 꺼질 때 알림을 받습니다(useSyncExternalStore 용). */
export function subscribePreviewMask(fn: () => void): () => void {
  maskListeners.add(fn);
  return () => { maskListeners.delete(fn); };
}

/** 이름을 그대로 보여 줄지. 오프라인 버전은 늘 보입니다. */
export function isNameVisible(): boolean {
  if (previewMask) return false; // 확인창이 켜 둔 동안에는 무엇보다 우선합니다.
  if (isLocal) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // 저장소를 못 쓰면 안전한 쪽(가리기)으로 둡니다.
  }
}

/** 비밀번호가 맞으면 이 기기에서 이름을 보이게 합니다. */
export function unlockNames(code: string): boolean {
  if (code.trim() !== UNLOCK_CODE) return false;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    return false;
  }
  return true;
}

/** 다시 가립니다. */
export function lockNames(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 저장소를 못 써도 가린 상태가 기본이라 문제없습니다. */
  }
}

/**
 * 이름을 가립니다. 성은 남기고 나머지는 ○로 바꿉니다 (홍길동 ➔ 홍○○).
 * 누구인지 특정할 수 없으면서도 명단에서 자리를 찾기는 쉽습니다.
 */
export function maskName(name: string): string {
  const n = (name ?? '').trim();
  if (n.length <= 1) return n ? '○' : '';
  return n[0] + '○'.repeat(n.length - 1);
}

/** 설정에 따라 이름을 그대로 쓰거나 가려서 돌려줍니다. */
export function displayName(name: string, visible = isNameVisible()): string {
  return visible ? name : maskName(name);
}
