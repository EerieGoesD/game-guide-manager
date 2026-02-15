const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('GuideBridge', {
  platform: 'electron',

  fetchUrl: async (url) => {
    return await ipcRenderer.invoke('ggm_fetch', url);
  },

  fetchUrlBrowser: async (url) => {
    return await ipcRenderer.invoke('ggm_fetch_browser', url);
  },

  readGuides: async () => {
    return await ipcRenderer.invoke('ggm_readGuides');
  },

  writeGuides: async (guides) => {
    return await ipcRenderer.invoke('ggm_writeGuides', guides);
  }
});
