const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  pickVideo: () => ipcRenderer.invoke('pick-video'),
  exportTrim: (args) => ipcRenderer.invoke('export-trim', args),
});
