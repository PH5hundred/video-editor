const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  pickVideo: () => ipcRenderer.invoke('pick-video'),
  exportTrim: (args) => ipcRenderer.invoke('export-trim', args),
  saveProject: (args) => ipcRenderer.invoke('save-project', args),
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
  openProjectPath: (filePath) => ipcRenderer.invoke('open-project-path', filePath),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  removeRecentProject: (filePath) => ipcRenderer.invoke('remove-recent-project', filePath),
});
