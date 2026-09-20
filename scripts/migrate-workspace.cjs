// 공개 문서(exam_saves/latest, exam_snapshots/*)를 비밀 키 아래(workspaces/{key}/…)로 옮깁니다.
//
//   node scripts/migrate-workspace.cjs copy   <key>   ← 새 자리로 복사하고 개수를 확인
//   node scripts/migrate-workspace.cjs delete        ← 복사가 확인된 뒤 옛 문서를 지움
//
// 규칙을 바꾸기 전에 돌려야 합니다(바꾼 뒤에는 옛 문서를 아무도 읽지 못합니다).
// 앱과 같은 공개 웹 설정으로 REST 를 부르며, 저장된 토큰은 쓰지 않습니다.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/domain/firebase.ts'), 'utf8');
const apiKey = (src.match(/apiKey:\s*["'`]([^"'`]+)/) || [])[1];
const projectId = (src.match(/projectId:\s*["'`]([^"'`]+)/) || [])[1];
const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const q = (extra = '') => `?key=${apiKey}${extra}`;

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 120)}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** 컬렉션의 문서를 전부 (페이지 넘겨 가며) 가져옵니다. */
async function listAll(col, mask) {
  const out = [];
  let token = '';
  for (;;) {
    const m = mask ? mask.map(f => `&mask.fieldPaths=${f}`).join('') : '';
    const j = await getJson(`${BASE}/${col}${q(`&pageSize=300${m}${token ? `&pageToken=${token}` : ''}`)}`);
    out.push(...(j.documents || []));
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  return out;
}

async function put(docPath, fields) {
  const r = await fetch(`${BASE}/${docPath}${q()}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`PATCH ${docPath}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function del(docPath) {
  const r = await fetch(`${BASE}/${docPath}${q()}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${docPath}: ${r.status}`);
}

/**
 * 옮길 필드만 남깁니다.
 *
 * stateJson 을 빠뜨리면 안 됩니다. 옛날 저장본은 압축하지 않은 stateJson 에
 * 내용이 들어 있고(앱도 두 가지를 모두 읽습니다), 이것을 버리면 껍데기만
 * 남은 스냅샷이 됩니다.
 */
const pick = (fields) => {
  const out = {};
  for (const k of ['id', 'title', 'updatedAt', 'stateJson', 'stateJsonLz']) if (fields[k]) out[k] = fields[k];
  return out;
};

(async () => {
  const [mode, key] = process.argv.slice(2);

  if (mode === 'copy') {
    if (!/^[a-f0-9]{32}$/.test(key || '')) { console.error('키는 32자리 소문자 16진수여야 합니다'); process.exit(1); }

    // 1) 최근 자동 저장본
    const latest = await getJson(`${BASE}/exam_saves/latest${q()}`);
    await put(`workspaces/${key}`, pick(latest.fields));
    console.log('latest → workspaces/' + key, '|', latest.fields.title && latest.fields.title.stringValue);

    // 2) 스냅샷 전부. 큰 문서라 하나씩 내려받아 바로 올립니다.
    const metas = await listAll('exam_snapshots', ['title']);
    console.log('snapshots to copy:', metas.length);
    let n = 0;
    for (const m of metas) {
      const id = m.name.split('/').pop();
      const full = await getJson(`${BASE}/exam_snapshots/${id}${q()}`);
      await put(`workspaces/${key}/snapshots/${id}`, pick(full.fields));
      n++;
      if (n % 10 === 0) console.log(`  ${n}/${metas.length}`);
    }

    // 3) 옮겨진 개수 확인
    const copied = await listAll(`workspaces/${key}/snapshots`, ['title']);
    const ok = copied.length === metas.length;
    console.log(`copied snapshots: ${copied.length}/${metas.length} → ${ok ? 'OK' : 'MISMATCH'}`);
    fs.writeFileSync(path.join(__dirname, '..', '.workspace-migration.json'),
      JSON.stringify({ key, latest: true, snapshots: copied.length, expected: metas.length, at: new Date().toISOString() }, null, 2));
    process.exit(ok ? 0 : 2);
  }

  if (mode === 'delete') {
    const metas = await listAll('exam_snapshots', ['title']);
    console.log('deleting old snapshots:', metas.length);
    for (const m of metas) await del(`exam_snapshots/${m.name.split('/').pop()}`);
    await del('exam_saves/latest');
    const left = await listAll('exam_snapshots', ['title']);
    console.log('remaining old snapshots:', left.length);
    process.exit(left.length === 0 ? 0 : 2);
  }

  console.error('copy <key> | delete');
  process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });
