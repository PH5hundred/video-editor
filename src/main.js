const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('pick-video', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'm4v'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('export-trim', async (event, { inputPath, startSec, endSec }) => {
  const outputPath = await dialog.showSaveDialog({
    defaultPath: 'trimmed-export.mp4',
    filters: [{ name: 'MP4', extensions: ['mp4'] }],
  });
  if (outputPath.canceled || !outputPath.filePath) return { ok: false, reason: 'canceled' };

  const duration = endSec - startSec;
  const args = [
    '-y',
    '-ss', String(startSec),
    '-i', inputPath,
    '-t', String(duration),
    '-c', 'copy',
    outputPath.filePath,
  ];

  return new Promise((resolve) => {
    execFile(ffmpegPath, args, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, reason: stderr || error.message });
      } else {
        resolve({ ok: true, outputPath: outputPath.filePath });
      }
    });
  });
});

// --- Project save/open + recent-projects list ---

const PROJECT_EXTENSION = 'veproj';
const recentsPath = () => path.join(app.getPath('userData'), 'recent-projects.json');

function readRecents() {
  try {
    return JSON.parse(fs.readFileSync(recentsPath(), 'utf-8'));
  } catch (error) {
    return [];
  }
}

function writeRecents(list) {
  fs.writeFileSync(recentsPath(), JSON.stringify(list, null, 2));
}

function addOrBumpRecent(filePath, name) {
  const list = readRecents().filter((entry) => entry.path !== filePath);
  list.unshift({ path: filePath, name: name || path.basename(filePath), lastOpened: Date.now() });
  writeRecents(list.slice(0, 20));
}

function removeRecent(filePath) {
  writeRecents(readRecents().filter((entry) => entry.path !== filePath));
}

function readProjectFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    addOrBumpRecent(filePath, data.name);
    return { ok: true, filePath, data };
  } catch (error) {
    removeRecent(filePath); // most likely cause: file moved/deleted since it was listed
    return { ok: false, reason: error.message };
  }
}

ipcMain.handle('save-project', async (event, { data, filePath }) => {
  let targetPath = filePath;
  if (!targetPath) {
    const result = await dialog.showSaveDialog({
      defaultPath: `${data.name || 'Untitled Project'}.${PROJECT_EXTENSION}`,
      filters: [{ name: 'Video Editor Project', extensions: [PROJECT_EXTENSION] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, reason: 'canceled' };
    targetPath = result.filePath;
  }
  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
  addOrBumpRecent(targetPath, data.name);
  return { ok: true, filePath: targetPath };
});

ipcMain.handle('open-project-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Video Editor Project', extensions: [PROJECT_EXTENSION] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, reason: 'canceled' };
  return readProjectFile(result.filePaths[0]);
});

ipcMain.handle('open-project-path', async (event, filePath) => readProjectFile(filePath));

ipcMain.handle('get-recent-projects', async () => {
  const list = readRecents();
  const existing = list.filter((entry) => fs.existsSync(entry.path));
  if (existing.length !== list.length) writeRecents(existing);
  return existing;
});

ipcMain.handle('remove-recent-project', async (event, filePath) => {
  removeRecent(filePath);
  return { ok: true };
});
