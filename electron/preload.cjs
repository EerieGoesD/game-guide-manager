// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('GuideBridge', {
  platform: 'electron',

  fetchUrl: (url) => ipcRenderer.invoke('ggm_fetch', url),

  fetchUrlBrowser: (url) => ipcRenderer.invoke('ggm_fetch_browser', url),

  readGuides: () => ipcRenderer.invoke('ggm_readGuides'),

  writeGuides: (guides) => ipcRenderer.invoke('ggm_writeGuides', guides),

  // Free app: open Microsoft Store listing for Reader Vault Pro (separate app)
  openProStore: () => ipcRenderer.invoke('ggm_open_pro_store')
});
