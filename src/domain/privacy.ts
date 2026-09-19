/**
 * 학생 이름 가리기.
 *
 * 화면에 학생 이름이 그대로 떠 있으면 지나가는 사람도 보게 됩니다.
 * 기본은 가린 상태이고, 비밀번호로 푼 기기에서만 보입니다.
 *
 * 푼 상태는 브라우저(localStorage)에만 둡니다.
 * 작업 파일이나 서버에 저장되지 않으므로, 다른 기기에서 열면 다시 가려집니다.
 */

const STORAGE_KEY = 'examtable.showStudentNames';
const UNLOCK_CODE = '1004';

/** 이 기기에서 이름을 보이도록 풀어 두었는지. */
export function isNameVisible(): boolean {
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
