const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('evidence', {
  gesture: () => ipcRenderer.send('lock-gesture'),
  capture: (name, data) => ipcRenderer.invoke('capture', name, data),
  finish: report => ipcRenderer.invoke('finish', report)
});
