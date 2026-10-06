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

contextBridge.exposeInMainWorld('osApi', {
  search: (req) => call('search', req),
  getSettings: () => call('getSettings'),
  saveSettings: (patch) => call('saveSettings', patch),
  testConnection: (patch) => call('testConnection', patch),
  cacheStats: () => call('cacheStats'),
  clearCache: () => call('clearCache'),
});
