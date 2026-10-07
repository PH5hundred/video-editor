const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
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
