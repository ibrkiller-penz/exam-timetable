/**
 * 오프라인 배포판 포장.
 *
 * 학교마다 USB로 복사해 인터넷 없이 쓰는 것이 목적입니다.
 * electron-builder 가 만든 win-unpacked 폴더(설치 없이 실행되는 형태)를 zip 으로 묶습니다.
 * 결과물은 public/ExamTimetable-Offline.zip 에 놓습니다. 앱의 "오프라인 로컬 버전
 * 다운로드" 버튼이 이 경로를 가리킵니다.
 *
 * dist/ 가 아니라 public/ 인 이유: vite build 가 dist 를 통째로 비우므로, dist 에 두면
 * 다음 빌드 때 사라져 링크가 끊깁니다. public/ 은 빌드마다 dist 로 다시 복사됩니다.
 * (저장소가 비공개라 GitHub 릴리스 링크는 학교에서 404 가 나므로 쓸 수 없습니다.)
 *
 * 왜 설치파일(NSIS)이 아니라 unpacked 폴더인가:
 *  - USB에 그대로 두고 더블클릭하면 됩니다. 관리자 권한도, 설치 단계도 없습니다.
 *  - 저장 폴더(save/)가 exe 옆에 생기므로 USB째로 들고 다녀도 자료가 따라갑니다.
 *    portable 단일 exe 는 실행 때마다 임시 폴더에 풀려 save/ 가 엉뚱한 곳에 생깁니다.
 *
 * 사용: node scripts/package-offline.cjs [release 폴더]
 *   release 폴더를 안 주면 ./release 를 씁니다.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.resolve(process.argv[2] || path.join(projectRoot, 'release'));
const unpacked = path.join(releaseDir, 'win-unpacked');
const publicDir = path.join(projectRoot, 'public');
const zipPath = path.join(publicDir, 'ExamTimetable-Offline.zip');

if (!fs.existsSync(path.join(unpacked, '시험시간표.exe'))) {
  console.error(`win-unpacked 에 exe 가 없습니다: ${unpacked}\n먼저 electron-builder --win 을 돌리세요.`);
  process.exit(1);
}

// 사용법을 zip 안에 같이 넣어 둡니다. 받는 선생님이 따로 물어볼 곳이 없습니다.
const readme = [
  '고사시간표 자동편성 시스템 — 오프라인(USB) 버전',
  '',
  '1. 이 폴더를 통째로 USB나 바탕화면에 복사합니다.',
  '2. 시험시간표.exe 를 더블클릭합니다. 설치 과정은 없습니다.',
  '3. 작업 내용은 exe 옆 save 폴더에 저장됩니다. 폴더째로 옮기면 자료도 함께 갑니다.',
  '4. 인터넷이 없어도 모든 기능이 동작합니다. 학생 정보는 이 컴퓨터 밖으로 나가지 않습니다.',
  '',
  '처음 실행할 때 Windows 가 "알 수 없는 게시자" 경고를 띄우면',
  '"추가 정보" → "실행" 을 누르면 됩니다. (코드 서명을 하지 않은 프로그램에 늘 뜨는 경고입니다.)',
  '',
].join('\r\n');
fs.writeFileSync(path.join(unpacked, '읽어주세요.txt'), '﻿' + readme, 'utf8');

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// PowerShell 의 Compress-Archive 는 Windows 에 늘 있어 따로 설치할 것이 없습니다.
// 폴더 이름을 그대로 담아, 풀었을 때 '시험시간표' 한 폴더로 나오게 합니다.
const staging = path.join(releaseDir, '시험시간표');
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.cpSync(unpacked, staging, { recursive: true });

execFileSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  `Compress-Archive -LiteralPath '${staging.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal`,
], { stdio: 'inherit' });

fs.rmSync(staging, { recursive: true, force: true });

const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`만들었습니다: ${zipPath} (${mb} MB)`);
