// 서버(workspaces/{작업 공간 키})에 저장된 상태를 내려받아 JSON 파일로 풉니다.
//
// 쓰임: 인쇄물 검증 테스트(src/__tests__/verify_reports.test.ts)의 재료.
//   node scripts/fetch-state.cjs <저장할 경로> <작업 공간 키>
//   STATE_DUMP=<그 경로> npx vitest run src/__tests__/verify_reports.test.ts
//
// 키는 앱의 '서버 동기화 & 스냅샷' 창에 있습니다. 앱과 같은 방식(공개 웹 설정,
// 로그인 없음)으로 읽되, 키를 모르면 서버 규칙이 거절합니다. 저장된 토큰이나
// 비밀은 전혀 쓰지 않습니다. 학생 자료가 들어 있으니 저장소 밖에 두세요.
const fs = require('fs');
const path = require('path');
const LZString = require('lz-string');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/domain/firebase.ts'), 'utf8');
const apiKey = (src.match(/apiKey:\s*["'`]([^"'`]+)/) || [])[1];
const projectId = (src.match(/projectId:\s*["'`]([^"'`]+)/) || [])[1];
const [OUT, KEY] = process.argv.slice(2);
if (!OUT || !/^[a-f0-9]{32}$/.test(KEY || '')) {
  console.error('쓰는 법: node scripts/fetch-state.cjs <저장할 경로> <작업 공간 키 32자리>');
  process.exit(1);
}

(async () => {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/workspaces/${KEY}?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) { console.error('firestore', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  const f = (await r.json()).fields || {};
  const lz = f.stateJsonLz && f.stateJsonLz.stringValue;
  const raw = lz ? LZString.decompressFromBase64(lz) : (f.stateJson && f.stateJson.stringValue);
  if (!raw) { console.error('상태가 없습니다', Object.keys(f)); process.exit(1); }
  const state = JSON.parse(raw);
  fs.writeFileSync(OUT, JSON.stringify(state));

  console.log(JSON.stringify({
    updatedAt: f.updatedAt && f.updatedAt.stringValue,
    title: state.meta && state.meta.title,
    activeGrade: state.activeGrade,
    students: (state.students || []).length,
    attendance: (state.attendance || []).length,
    rooms: (state.rooms || []).length,
    separate: state.separateExaminers,
  }, null, 1));
})();
