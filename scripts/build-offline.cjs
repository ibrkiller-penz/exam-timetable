/**
 * 오프라인 배포판용 빌드.
 *
 * 환경변수 OFFLINE=1 을 켜고 평소 빌드를 돌립니다. 그러면 vite.config.ts 가
 * 클라우드 모듈을 빈 껍데기로 바꿔 끼우고, 화면의 클라우드 갈래를 지웁니다.
 * 결과물에는 파이어베이스 라이브러리도, 접속 설정값도 들어가지 않습니다.
 *
 * 윈도에서 `OFFLINE=1 npm run build` 가 통하지 않아 이 파일을 둡니다.
 * 도구는 node 로 바로 부릅니다. `npx.cmd` 를 부르면 윈도에서 껍데기 셸이
 * 필요해 실패하고, require.resolve 는 두 꾸러미가 내부 경로를 막아 두어
 * 쓸 수 없습니다. 그래서 node_modules 안의 실행 파일을 곧장 가리킵니다.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const env = { ...process.env, OFFLINE: '1' };
const run = (rel, args) => {
  const bin = path.join(root, 'node_modules', ...rel);
  if (!fs.existsSync(bin)) throw new Error('도구를 찾지 못했습니다: ' + bin + ' (npm install 을 먼저 하세요)');
  execFileSync(process.execPath, [bin, ...args], { cwd: root, env, stdio: 'inherit' });
};

console.log('오프라인 빌드를 시작합니다 (클라우드 코드 제외).');
run(['typescript', 'bin', 'tsc'], []);
run(['vite', 'bin', 'vite.js'], ['build']);
console.log('오프라인 빌드 끝.');
