const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const localProgramDir = 'C:\\Users\\pc\\Desktop\\시험시간표_로컬프로그램';
const appDir = path.join(localProgramDir, 'resources', 'app');

console.log('Deploying to local PC program directory:', localProgramDir);

if (!fs.existsSync(localProgramDir)) {
  fs.mkdirSync(localProgramDir, { recursive: true });
}
if (!fs.existsSync(appDir)) {
  fs.mkdirSync(appDir, { recursive: true });
}

// 1. Copy electron.cjs and preload.cjs
fs.copyFileSync(path.join(projectRoot, 'public', 'electron.cjs'), path.join(appDir, 'electron.cjs'));
fs.copyFileSync(path.join(projectRoot, 'public', 'preload.cjs'), path.join(appDir, 'preload.cjs'));

// 2. Ensure package.json in resources/app
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
  name: "exam-timetable",
  version: "1.0.0",
  main: "electron.cjs"
}, null, 2));

// 3. Mirror dist
const destDist = path.join(appDir, 'dist');
try {
  execSync(`robocopy "${distDir}" "${destDist}" /MIR /NP /NFL /NDL /NJH /NJS`, { stdio: 'ignore' });
} catch (e) {}

// 4. Ensure save directory exists and is visible
const saveDir = path.join(localProgramDir, 'save');
if (!fs.existsSync(saveDir)) {
  fs.mkdirSync(saveDir, { recursive: true });
}

// 5. Hide background engine files so only 시험시간표.exe and save are visible in explorer
try {
  execSync(`attrib -h "${localProgramDir}\\시험시간표.exe"`);
  execSync(`attrib -h "${saveDir}"`);
  execSync(`attrib +h "${localProgramDir}\\locales"`);
  execSync(`attrib +h "${localProgramDir}\\resources"`);
  execSync(`attrib +h "${localProgramDir}\\*.dll"`);
  execSync(`attrib +h "${localProgramDir}\\*.pak"`);
  execSync(`attrib +h "${localProgramDir}\\*.bin"`);
  execSync(`attrib +h "${localProgramDir}\\*.dat"`);
  execSync(`attrib +h "${localProgramDir}\\LICENSE*"`);
  execSync(`attrib +h "${localProgramDir}\\LICENSES*"`);
  execSync(`attrib +h "${localProgramDir}\\*.json"`);
  execSync(`attrib +h "${localProgramDir}\\*.log"`);
} catch (e) {}

console.log('✅ Local PC program (시험시간표.exe) deployed and optimized cleanly to:', localProgramDir);


