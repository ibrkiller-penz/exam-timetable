/**
 * 새 버전이 올라왔는지 지켜봅니다.
 *
 * 이 앱은 한 화면짜리(SPA)라, 창을 열어 둔 채로는 새로 배포해도 옛 화면이
 * 그대로 돕니다. 고친 것을 분명히 올렸는데 "그대로인데요" 하는 일이 생깁니다.
 * 학교에서 하루 종일 창을 띄워 두고 쓰기 때문에 더 그렇습니다.
 *
 * 그래서 가끔 서버의 index.html 을 다시 읽어, 그 안에 적힌 묶음 파일 이름이
 * 지금 돌고 있는 것과 다르면 알려 줍니다. 파일 이름에 내용 해시가 붙어 있어
 * 내용이 바뀌면 이름도 바뀝니다.
 *
 * 저절로 새로고침하지는 않습니다. 작업 중일 수 있으니 고르게 둡니다.
 */

/** 지금 돌고 있는 묶음 파일 이름 (예: 'assets/index-DkgNHQp6.js'). */
function currentBundle(): string | null {
  const src = Array.from(document.scripts)
    .map(s => s.src)
    .find(s => /\/assets\/index-[\w-]+\.js/.test(s));
  const m = src?.match(/assets\/index-[\w-]+\.js/);
  return m ? m[0] : null;
}

export function watchForNewVersion(onFound: () => void): () => void {
  // 오프라인(USB) 버전은 서버가 없으니 볼 것이 없습니다.
  if (typeof window === 'undefined' || window.location.protocol === 'file:') return () => {};

  const mine = currentBundle();
  if (!mine) return () => {};

  let stopped = false;

  const check = async () => {
    if (stopped) return;
    try {
      const res = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const html = await res.text();
      const m = html.match(/assets\/index-[\w-]+\.js/);
      if (m && m[0] !== mine) {
        stopped = true;
        onFound();
      }
    } catch {
      // 망이 끊겼거나 서버가 잠깐 안 될 수 있습니다. 다음 차례에 다시 봅니다.
    }
  };

  // 창을 다시 볼 때, 그리고 십 분마다.
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(check, 10 * 60 * 1000);
  const first = window.setTimeout(check, 20 * 1000);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
    window.clearTimeout(first);
  };
}
