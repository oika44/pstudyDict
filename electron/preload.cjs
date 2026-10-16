// 画面 (Angular) からファイル保存 (CSV・音声) を呼び出すための窓口
// sandbox 有効のプリロードは ESM が使えないため CommonJS で書く
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pstudyDesktop', {
  defaultSavePath: () => ipcRenderer.invoke('csv:default-path'),
  chooseSavePath: (current) => ipcRenderer.invoke('csv:choose-path', current),
  saveFile: (path, data, overwrite) => ipcRenderer.invoke('csv:save', path, data, overwrite),
  saveAudio: (csvPath, items) => ipcRenderer.invoke('audio:save', csvPath, items),
});
