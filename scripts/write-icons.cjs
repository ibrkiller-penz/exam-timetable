// 브라우저에서 줄여 만든 아이콘(base64 PNG)을 파일로 씁니다.
// 한 번 쓰고 나면 다시 쓸 일은 없지만, 아이콘을 바꿀 때 같은 방법을 쓰면 됩니다.
//
//   node scripts/write-icons.cjs <브라우저 결과가 저장된 파일>
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) { console.error('결과 파일 경로를 주세요'); process.exit(1); }

let text = JSON.parse(fs.readFileSync(src, 'utf8')).map(x => x.text).join('');
// 꼬리말('(captured at origin ...)')을 떼어 냅니다.
const tail = text.indexOf('\n(captured at origin');
if (tail > 0) text = text.slice(0, tail);
text = text.trim();

// 결과가 따옴표로 감싼 JSON 문자열일 수 있습니다. 객체가 나올 때까지 풉니다.
let obj = text;
for (let i = 0; i < 3 && typeof obj === 'string'; i++) obj = JSON.parse(obj);

const names = {
  16: ['public', 'favicon-16.png'],
  32: ['public', 'favicon-32.png'],
  48: ['public', 'favicon-48.png'],
  64: ['public', 'favicon-64.png'],
  180: ['public', 'apple-touch-icon.png'],
  192: ['public', 'icon-192.png'],
  256: ['build', 'icon-256.png'],
  512: ['build', 'icon.png'],
};

fs.mkdirSync('build', { recursive: true });
for (const [size, b64] of Object.entries(obj)) {
  const spec = names[size];
  if (!spec) continue;
  const buf = Buffer.from(b64, 'base64');
  const out = path.join(spec[0], spec[1]);
  fs.writeFileSync(out, buf);
  console.log(out, buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20), (buf.length / 1024).toFixed(1) + 'KB');
}
