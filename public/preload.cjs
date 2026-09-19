const { contextBridge, ipcRenderer } = require('electron');

let initialSyncData = null;
try {
  initialSyncData = ipcRenderer.sendSync('get-initial-sync-data');
} catch (e) {}

contextBridge.exposeInMainWorld('electronAPI', {
  initialSyncData: initialSyncData,
  saveFile: (filename, data) => ipcRenderer.invoke('save-file', { filename, data }),
  loadFile: (filename) => ipcRenderer.invoke('load-file', { filename }),
  listFiles: () => ipcRenderer.invoke('list-files'),
  deleteFile: (filename) => ipcRenderer.invoke('delete-file', { filename }),
  saveAsDialog: (defaultName, data) => ipcRenderer.invoke('save-as-dialog', { defaultName, data }),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  isElectron: true,
});
