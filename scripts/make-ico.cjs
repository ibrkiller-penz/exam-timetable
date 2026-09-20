// PNG 몇 장을 묶어 favicon.ico 를 만듭니다.
//
// 윈도우 아이콘(.ico)은 여러 크기를 한 파일에 담습니다. 비스타부터는 칸마다
// PNG 를 그대로 넣을 수 있어, 따로 변환 도구 없이 붙이기만 하면 됩니다.
//
//   node scripts/make-ico.cjs public/favicon.ico public/favicon-16.png ...
const fs = require('fs');

const [out, ...pngs] = process.argv.slice(2);
if (!out || pngs.length === 0) {
  console.error('쓰는 법: node scripts/make-ico.cjs <만들 .ico> <png...>');
  process.exit(1);
}

const imgs = pngs.map(p => {
  const buf = fs.readFileSync(p);
  return { buf, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);            // 예약
header.writeUInt16LE(1, 2);            // 1 = 아이콘
header.writeUInt16LE(imgs.length, 4);  // 담은 장 수

const dir = Buffer.alloc(16 * imgs.length);
let offset = header.length + dir.length;

imgs.forEach((im, i) => {
  const o = i * 16;
  dir.writeUInt8(im.w >= 256 ? 0 : im.w, o);      // 256은 0으로 적습니다
  dir.writeUInt8(im.h >= 256 ? 0 : im.h, o + 1);
  dir.writeUInt8(0, o + 2);                        // 색 수(팔레트 없음)
  dir.writeUInt8(0, o + 3);                        // 예약
  dir.writeUInt16LE(1, o + 4);                     // 색 평면
  dir.writeUInt16LE(32, o + 6);                    // 픽셀당 비트
  dir.writeUInt32LE(im.buf.length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += im.buf.length;
});

fs.writeFileSync(out, Buffer.concat([header, dir, ...imgs.map(i => i.buf)]));
console.log(out, imgs.map(i => `${i.w}×${i.h}`).join(', '), (fs.statSync(out).size / 1024).toFixed(1) + 'KB');
