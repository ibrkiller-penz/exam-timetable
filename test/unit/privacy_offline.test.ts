import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 오프라인(USB) 버전에서는 학생 이름을 가리지 않습니다.
 *
 * 프로그램이 학교 컴퓨터 안에서만 돌고 학생 정보가 밖으로 나가지 않으니
 * 그 자체가 보호막입니다. 그 안에서 또 가리면 명단을 볼 때마다 비밀번호를
 * 넣어야 해 일만 늘어납니다. 웹 주소로 열었을 때는 그대로 가립니다.
 */
describe('이름 가리기는 웹에서만', () => {
  // 테스트는 브라우저가 아닌 node 에서 돕니다. jsdom 을 끌어들이면 모든 테스트가
  // 느려지므로, 이 파일에서만 쓰는 만큼의 저장소 대역을 둡니다.
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };

  beforeEach(() => {
    vi.resetModules();
    store.clear();
  });

  it('오프라인 버전에서는 비밀번호 없이도 이름이 그대로 보인다', async () => {
    vi.doMock('../../src/utils/electronBridge', () => ({ isLocal: true, isElectron: true }));
    const { isNameVisible, displayName } = await import('../../src/domain/privacy');

    expect(isNameVisible()).toBe(true);
    expect(displayName('가나다')).toBe('가나다');
  });

  it('웹에서는 기본이 가린 상태이고, 비밀번호를 넣어야 보인다', async () => {
    vi.doMock('../../src/utils/electronBridge', () => ({ isLocal: false, isElectron: false }));
    const { isNameVisible, displayName, unlockNames, lockNames } = await import('../../src/domain/privacy');

    expect(isNameVisible()).toBe(false);
    expect(displayName('가나다')).toBe('가○○');

    expect(unlockNames('틀린비번')).toBe(false);
    expect(isNameVisible()).toBe(false);

    expect(unlockNames('1004')).toBe(true);
    expect(displayName('가나다')).toBe('가나다');

    lockNames();
    expect(displayName('가나다')).toBe('가○○');
  });
});
