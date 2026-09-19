/** Electron IPC bridge */
const api = (window as any).electronAPI;

export const isElectron = !!api;
export const isLocal = isElectron || window.location.protocol === 'file:';

export const electronBridge = {
  isElectron,
  isLocal,

  async saveFile(filename: string, data: string): Promise<boolean> {
    if (!api) return false;
    const r = await api.saveFile(filename, data);
    return r?.success ?? false;
  },

  async loadFile(filename: string): Promise<string | null> {
    if (!api) return null;
    const r = await api.loadFile(filename);
    return r?.success ? r.data : null;
  },

  async listFiles(): Promise<string[]> {
    if (!api) return [];
    return await api.listFiles();
  },

  async deleteFile(filename: string): Promise<boolean> {
    if (!api) return false;
    const r = await api.deleteFile(filename);
    return r?.success ?? false;
  },

  async saveAsDialog(defaultName: string, data: string): Promise<{ success: boolean; filename?: string }> {
    if (!api) return { success: false };
    return await api.saveAsDialog(defaultName, data);
  },

  async openFileDialog(): Promise<{ success: boolean; data?: string; filename?: string }> {
    if (!api) return { success: false };
    return await api.openFileDialog();
  },
};
