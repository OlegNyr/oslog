'use strict';
// The only bridge between the page and the main process: a fixed set of
// methods, no generic IPC, HTTP or file access.
const { contextBridge, ipcRenderer } = require('electron');

function call(name, arg) {
  return ipcRenderer.invoke('osapi:' + name, arg).then((r) => {
    if (r && r.ok) return r.data;
    throw new Error((r && r.error) || 'ошибка');
  });
}

let searchSeq = 0;

contextBridge.exposeInMainWorld('osApi', {
  // onProgress({loaded, total}) is called after every page
  search: (req, onProgress) => {
    const id = ++searchSeq;
    const listener = (_e, p) => {
      if (p && p.id === id && typeof onProgress === 'function') onProgress({ loaded: p.loaded, total: p.total });
    };
    ipcRenderer.on('osapi:progress', listener);
    return call('search', Object.assign({}, req, { id }))
      .finally(() => ipcRenderer.removeListener('osapi:progress', listener));
  },
  stopSearch: () => call('stopSearch'),
  getSettings: () => call('getSettings'),
  saveSettings: (patch) => call('saveSettings', patch),
  testConnection: (patch) => call('testConnection', patch),
  cacheStats: () => call('cacheStats'),
  clearCache: () => call('clearCache'),
});
