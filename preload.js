const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vault', {
  list: () => ipcRenderer.invoke('games:list'),
  art: () => ipcRenderer.invoke('games:art'),
  launch: id => ipcRenderer.invoke('games:launch', id),
  add: g => ipcRenderer.invoke('games:add', g),
  remove: id => ipcRenderer.invoke('games:remove', id),
  fav: id => ipcRenderer.invoke('games:fav', id),
  pickExe: () => ipcRenderer.invoke('dialog:exe'),
  pcName: () => ipcRenderer.invoke('sys:name'),
  min: () => ipcRenderer.send('win:min'),
  max: () => ipcRenderer.send('win:max'),
  close: () => ipcRenderer.send('win:close')
});
