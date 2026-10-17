const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('projectTool', {
  getStatus: () => ipcRenderer.invoke('tool:status'),
  reconnect: () => ipcRenderer.invoke('tool:reconnect'),
  chooseSources: () => ipcRenderer.invoke('tool:choose-sources'),
  scanSources: (paths) => ipcRenderer.invoke('tool:scan-sources', paths),
  createProject: (options) => ipcRenderer.invoke('tool:create-project', options),
  openProxyGenerator: () => ipcRenderer.invoke('tool:open-proxy-generator'),
  finish: () => ipcRenderer.invoke('tool:finish'),
  close: () => ipcRenderer.invoke('tool:close'),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tool:progress', listener);
    return () => ipcRenderer.removeListener('tool:progress', listener);
  }
});
