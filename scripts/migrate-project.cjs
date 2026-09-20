// 한 Firebase 프로젝트의 작업 공간을 다른 프로젝트로 옮깁니다.
//
//   node scripts/migrate-project.cjs <보내는 프로젝트> <보내는 API 키> <받는 프로젝트> <받는 API 키> <작업 공간 키>
//
// 고사시간표를 전용 프로젝트(examtable-app)로 떼어 내면서 한 번 썼습니다.
// 앱과 같은 방식(공개 웹 설정 + 작업 공간 키)으로 읽고 씁니다. 두 프로젝트의
// 보안 규칙이 그 키를 허용해야 하므로, 키를 모르는 사람은 쓸 수 없습니다.
const [FROM_P, FROM_K, TO_P, TO_K, WS] = process.argv.slice(2);
if (!FROM_P || !FROM_K || !TO_P || !TO_K || !/^[a-f0-9]{32}$/.test(WS || '')) {
  console.error('쓰는 법: node scripts/migrate-project.cjs <보내는 프로젝트> <보내는 키> <받는 프로젝트> <받는 키> <작업 공간 키>');
  process.exit(1);
}

const base = (p) => `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * 잇달아 빠르게 쓰면 서버가 가끔 403(PERMISSION_DENIED)으로 되돌립니다.
 * 규칙 문제가 아니라 잠깐 막히는 것이라, 쉬었다가 다시 보냅니다.
 */
async function put(project, apiKey, docPath, fields) {
  const body = JSON.stringify({ fields });
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${base(project)}/${docPath}?key=${apiKey}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
    });
    if (r.ok) return;
    const text = (await r.text()).slice(0, 200);
    if (attempt >= 6) throw new Error(`PATCH ${docPath}: ${r.status} ${text}`);
    await sleep(attempt * 1500);
  }
}

/**
 * 규칙이 받는 필드만 남깁니다.
 *
 * stateJson 을 빠뜨리면 안 됩니다. 옛날 저장본은 압축하지 않은 stateJson 에
 * 내용이 들어 있고(앱도 두 가지를 모두 읽습니다), 이것을 버리면 껍데기만
 * 남은 스냅샷이 됩니다.
 */
const KEEP = ['id', 'title', 'updatedAt', 'stateJson', 'stateJsonLz'];
const pick = (fields) => {
  const out = {};
  for (const k of KEEP) if (fields[k]) out[k] = fields[k];
  return out;
};

/** 내용이 아예 없는 껍데기 문서인지. 옮겨 봐야 앱이 열지 못합니다. */
const isEmpty = (fields) => !fields || (!fields.stateJson && !fields.stateJsonLz);

(async () => {
  // 1) 최근 자동 저장본
  const latest = await getJson(`${base(FROM_P)}/workspaces/${WS}?key=${FROM_K}`);
  await put(TO_P, TO_K, `workspaces/${WS}`, pick(latest.fields));
  console.log('latest →', TO_P, '|', latest.fields.title && latest.fields.title.stringValue);

  // 2) 스냅샷 전부. 큰 문서라 하나씩 옮깁니다.
  const metas = [];
  let token = '';
  for (;;) {
    const j = await getJson(`${base(FROM_P)}/workspaces/${WS}/snapshots?key=${FROM_K}&pageSize=300&mask.fieldPaths=title${token ? `&pageToken=${token}` : ''}`);
    metas.push(...(j.documents || []));
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  console.log('snapshots to move:', metas.length);

  let n = 0;
  const skipped = [];
  for (const m of metas) {
    const id = m.name.split('/').pop();
    const full = await getJson(`${base(FROM_P)}/workspaces/${WS}/snapshots/${id}?key=${FROM_K}`);
    if (isEmpty(full.fields)) { skipped.push(id); continue; }
    await put(TO_P, TO_K, `workspaces/${WS}/snapshots/${id}`, pick(full.fields));
    await sleep(120); // 너무 몰아치지 않게 한 박자 쉽니다.
    if (++n % 20 === 0) console.log(`  ${n}/${metas.length}`);
  }
  if (skipped.length) console.log('내용이 없어 건너뜀:', skipped.length, skipped.join(', '));

  // 3) 받는 쪽 개수 확인
  const copied = [];
  token = '';
  for (;;) {
    const j = await getJson(`${base(TO_P)}/workspaces/${WS}/snapshots?key=${TO_K}&pageSize=300&mask.fieldPaths=title${token ? `&pageToken=${token}` : ''}`);
    copied.push(...(j.documents || []));
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  const ok = copied.length === n;
  console.log(`moved snapshots: ${copied.length}/${n} (원본 ${metas.length}, 빈 문서 ${skipped.length} 제외) → ${ok ? 'OK' : 'MISMATCH'}`);
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error(e.message); process.exit(1); });
