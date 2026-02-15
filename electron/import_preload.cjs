const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('GGMImport', {
  send: (text) => ipcRenderer.send('ggm_import_text', String(text || ''))
});
