
const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-http-cache');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function getExeDir() {
  return path.dirname(app.getPath('exe'));
}

function getSaveDir() {
  const saveDir = path.join(getExeDir(), 'save');
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  return saveDir;
}

let mainWindow = null;

function createWindow() {
  // dist 위치는 포장 방식마다 다릅니다.
  //  - 로컬 배포(deploy-local): electron.cjs 와 dist 가 같은 폴더에 나란히
  //  - electron-builder: electron.cjs 가 public/ 아래라 dist 는 한 단계 위
  const htmlCandidates = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
  ];
  const htmlPath = htmlCandidates.find(p => fs.existsSync(p)) || htmlCandidates[0];

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: '고사시간표 자동편성 시스템 (로컬 PC버전)',
    backgroundColor: '#F8F7F4',
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.setMenuBarVisibility(false);
  
  const logFile = path.join(getExeDir(), 'renderer_debug.log');
  try { fs.writeFileSync(logFile, '--- App Started at ' + new Date().toISOString() + ' ---\n'); } catch(e) {}
  
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    try { fs.appendFileSync(logFile, '[Console L' + level + '] Line ' + line + ': ' + message + ' (' + sourceId + ')\n'); } catch(e) {}
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    try { fs.appendFileSync(logFile, '[Failed Load] ' + errorCode + ': ' + errorDescription + ' - ' + validatedURL + '\n'); } catch(e) {}
  });
  mainWindow.webContents.on('did-finish-load', () => {
    try { fs.appendFileSync(logFile, '[Load SUCCESS] DOM Content Loaded Successfully\n'); } catch(e) {}
  });

  mainWindow.loadFile(htmlPath).then(() => {
    try { fs.appendFileSync(logFile, '[loadFile resolved]\n'); } catch(e) {}
  }).catch(err => {
    try { fs.appendFileSync(logFile, '[loadFile rejected: ' + err.message + ']\n'); } catch(e) {}
  });

  // F12 to toggle DevTools if needed
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.on('get-initial-sync-data', (event) => {
  try {
    const saveDir = getSaveDir();
    const filePath = path.join(saveDir, '_auto_save_state.json');
    if (fs.existsSync(filePath)) {
      event.returnValue = fs.readFileSync(filePath, 'utf8');
      return;
    }
  } catch (e) {}
  event.returnValue = null;
});

ipcMain.handle('save-file', async (event, { filename, data }) => {
  try {
    const saveDir = getSaveDir();
    const filePath = path.join(saveDir, filename);
    fs.writeFileSync(filePath, data, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('save-file error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-file', async (event, { filename }) => {
  try {
    const saveDir = getSaveDir();
    const filePath = path.join(saveDir, filename);
    if (!fs.existsSync(filePath)) return { success: false, data: null };
    const data = fs.readFileSync(filePath, 'utf8');
    return { success: true, data };
  } catch (err) {
    console.error('load-file error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('list-files', async () => {
  try {
    const saveDir = getSaveDir();
    const files = fs.readdirSync(saveDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    return files;
  } catch (err) {
    console.error('list-files error:', err);
    return [];
  }
});

ipcMain.handle('delete-file', async (event, { filename }) => {
  try {
    const saveDir = getSaveDir();
    const filePath = path.join(saveDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (err) {
    console.error('delete-file error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-as-dialog', async (event, { defaultName, data }) => {
  try {
    const saveDir = getSaveDir();
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(saveDir, defaultName),
      filters: [
        { name: '시험시간표 파일 (*.json, *.exam.json)', extensions: ['json'] },
        { name: '모든 파일 (*.*)', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return { success: false };
    fs.writeFileSync(result.filePath, data, 'utf8');
    return { success: true, filePath: result.filePath, filename: path.basename(result.filePath) };
  } catch (err) {
    console.error('save-as error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: getSaveDir(),
      filters: [
        { name: '시험시간표 파일 (*.json, *.exam.json)', extensions: ['json'] },
        { name: '엑셀 파일 (*.xlsx, *.xls)', extensions: ['xlsx', 'xls'] },
        { name: '모든 파일 (*.*)', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return { success: false };
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath, 'utf8');
    return { success: true, data, filename: path.basename(filePath) };
  } catch (err) {
    console.error('open-dialog error:', err);
    return { success: false, error: err.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
