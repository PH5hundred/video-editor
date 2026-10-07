// The editor view: multitrack timeline + toolbar (undo/redo, delete/duplicate,
// zoom, save). Vanilla JS, state in `project`, re-rendered into the DOM on
// every change — fine at this scale, revisit if it grows. Exposed as
// `window.Editor` so app.js/home.js can hand it a loaded project (or none,
// for a new one) without this file needing to know about the home screen.

const DEFAULT_PPS = 40; // pixels per second of timeline, at 1x zoom
const ZOOM_MIN = 10;
const ZOOM_MAX = 200;
const HISTORY_LIMIT = 50;

let PPS = DEFAULT_PPS;
const project = { tracks: [] };
let nextId = 1;
let selectedClipId = null;
let currentFilePath = null;
let projectName = 'Untitled Project';
let dirty = false;
let historyStack = [];
let redoStack = [];

const homeBtn = document.getElementById('homeBtn');
const projectNameInput = document.getElementById('projectNameInput');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const addTrackBtn = document.getElementById('addTrackBtn');
const deleteClipBtn = document.getElementById('deleteClipBtn');
const duplicateClipBtn = document.getElementById('duplicateClipBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const saveBtn = document.getElementById('saveBtn');
const saveStatusEl = document.getElementById('saveStatus');
const exportBtn = document.getElementById('exportBtn');
const exportStatusEl = document.getElementById('exportStatus');
const tracksEl = document.getElementById('tracks');
const videoEl = document.getElementById('video');

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function findClip(clipId) {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return clip;
  }
  return null;
}

function findTrackOf(clip) {
  return project.tracks.find((t) => t.clips.includes(clip));
}

function computeNextId() {
  let max = 0;
  for (const track of project.tracks) {
    max = Math.max(max, track.id);
    for (const clip of track.clips) max = Math.max(max, clip.id);
  }
  return max + 1;
}

function markDirty() {
  dirty = true;
  saveStatusEl.textContent = 'Unsaved changes';
}

function markClean() {
  dirty = false;
  saveStatusEl.textContent = 'All changes saved';
}

function cloneTracks() {
  return JSON.parse(JSON.stringify(project.tracks));
}

function pushHistory() {
  historyStack.push(cloneTracks());
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoBtn.disabled = historyStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function undo() {
  if (historyStack.length === 0) return;
  redoStack.push(cloneTracks());
  project.tracks = historyStack.pop();
  selectedClipId = null;
  exportBtn.disabled = true;
  markDirty();
  updateHistoryButtons();
  renderEditor();
}

function redo() {
  if (redoStack.length === 0) return;
  historyStack.push(cloneTracks());
  project.tracks = redoStack.pop();
  selectedClipId = null;
  exportBtn.disabled = true;
  markDirty();
  updateHistoryButtons();
  renderEditor();
}

function addTrack() {
  pushHistory();
  project.tracks.push({ id: nextId++, name: `Track ${project.tracks.length + 1}`, clips: [] });
  markDirty();
  renderEditor();
}

async function addClipToTrack(track) {
  const filePath = await window.editorAPI.pickVideo();
  if (!filePath) return;

  // Probe duration via a throwaway <video> element before adding to the model.
  const probe = document.createElement('video');
  probe.src = `file://${filePath}`;
  await new Promise((resolve) => {
    probe.addEventListener('loadedmetadata', resolve, { once: true });
  });
  const sourceDuration = probe.duration;

  pushHistory();
  const lastClip = track.clips[track.clips.length - 1];
  const start = lastClip ? lastClip.start + (lastClip.outSec - lastClip.inSec) : 0;
  const clip = { id: nextId++, path: filePath, sourceDuration, inSec: 0, outSec: sourceDuration, start };
  track.clips.push(clip);
  markDirty();
  selectClip(clip.id);
}

function selectClip(clipId) {
  selectedClipId = clipId;
  const clip = findClip(clipId);
  if (clip) {
    videoEl.src = `file://${clip.path}`;
    exportBtn.disabled = false;
    deleteClipBtn.disabled = false;
    duplicateClipBtn.disabled = false;
  } else {
    exportBtn.disabled = true;
    deleteClipBtn.disabled = true;
    duplicateClipBtn.disabled = true;
  }
  renderEditor();
}

function deleteSelectedClip() {
  const clip = findClip(selectedClipId);
  if (!clip) return;
  pushHistory();
  const track = findTrackOf(clip);
  track.clips.splice(track.clips.indexOf(clip), 1);
  markDirty();
  selectClip(null);
}

function duplicateSelectedClip() {
  const clip = findClip(selectedClipId);
  if (!clip) return;
  const track = findTrackOf(clip);
  pushHistory();
  const copy = { ...clip, id: nextId++, start: clip.start + (clip.outSec - clip.inSec) };
  track.clips.push(copy);
  markDirty();
  selectClip(copy.id);
}

function zoomIn() {
  PPS = Math.min(ZOOM_MAX, Math.round(PPS * 1.25));
  renderTrackLanes();
}

function zoomOut() {
  PPS = Math.max(ZOOM_MIN, Math.round(PPS / 1.25));
  renderTrackLanes();
}

function attachClipDrag(clipEl, clip) {
  clipEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('handle')) return; // handles manage their own drag
    e.preventDefault();
    selectClip(clip.id);
    pushHistory();
    markDirty();
    const startClientX = e.clientX;
    const startValue = clip.start;
    const onMove = (moveEvent) => {
      const deltaPx = moveEvent.clientX - startClientX;
      clip.start = Math.max(0, startValue + deltaPx / PPS);
      renderTrackLanes();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function attachHandleDrag(handleEl, clip, side) {
  handleEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectClip(clip.id);
    pushHistory();
    markDirty();
    const onMove = (moveEvent) => {
      const deltaSec = moveEvent.movementX / PPS;
      if (side === 'left') {
        const maxIn = clip.outSec - 0.1;
        const newIn = Math.min(maxIn, Math.max(0, clip.inSec + deltaSec));
        const delta = newIn - clip.inSec;
        clip.inSec = newIn;
        clip.start += delta;
      } else {
        const minOut = clip.inSec + 0.1;
        clip.outSec = Math.min(clip.sourceDuration, Math.max(minOut, clip.outSec + deltaSec));
      }
      renderTrackLanes();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function renderTrackLanes() {
  // Re-render just clip positions/sizes without rebuilding track headers, so
  // an in-progress drag or a zoom change doesn't fight with a full re-render.
  for (const track of project.tracks) {
    const laneEl = document.querySelector(`.track-lane[data-track-id="${track.id}"]`);
    if (!laneEl) continue;
    for (const clip of track.clips) {
      const clipEl = laneEl.querySelector(`.clip[data-clip-id="${clip.id}"]`);
      if (!clipEl) continue;
      clipEl.style.left = clip.start * PPS + 'px';
      clipEl.style.width = (clip.outSec - clip.inSec) * PPS + 'px';
    }
  }
}

function renderEditor() {
  tracksEl.innerHTML = '';
  for (const track of project.tracks) {
    const row = document.createElement('div');
    row.className = 'track-row';

    const header = document.createElement('div');
    header.className = 'track-header';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = track.name;
    const addClipBtn = document.createElement('button');
    addClipBtn.className = 'small';
    addClipBtn.textContent = '+ Clip';
    addClipBtn.addEventListener('click', () => addClipToTrack(track));
    header.appendChild(name);
    header.appendChild(addClipBtn);

    const lane = document.createElement('div');
    lane.className = 'track-lane';
    lane.dataset.trackId = track.id;

    for (const clip of track.clips) {
      const clipEl = document.createElement('div');
      clipEl.className = 'clip' + (clip.id === selectedClipId ? ' selected' : '');
      clipEl.dataset.clipId = clip.id;
      clipEl.style.left = clip.start * PPS + 'px';
      clipEl.style.width = (clip.outSec - clip.inSec) * PPS + 'px';

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = clip.path.split('/').pop();
      clipEl.appendChild(label);

      const leftHandle = document.createElement('div');
      leftHandle.className = 'handle left';
      const rightHandle = document.createElement('div');
      rightHandle.className = 'handle right';
      clipEl.appendChild(leftHandle);
      clipEl.appendChild(rightHandle);

      clipEl.addEventListener('click', () => selectClip(clip.id));
      attachClipDrag(clipEl, clip);
      attachHandleDrag(leftHandle, clip, 'left');
      attachHandleDrag(rightHandle, clip, 'right');

      lane.appendChild(clipEl);
    }

    row.appendChild(header);
    row.appendChild(lane);
    tracksEl.appendChild(row);
  }
}

async function saveProject() {
  const data = {
    version: 1,
    name: projectName,
    tracks: project.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      clips: t.clips.map((c) => ({
        id: c.id,
        path: c.path,
        sourceDuration: c.sourceDuration,
        inSec: c.inSec,
        outSec: c.outSec,
        start: c.start,
      })),
    })),
  };
  const result = await window.editorAPI.saveProject({ data, filePath: currentFilePath });
  if (result.ok) {
    currentFilePath = result.filePath;
    markClean();
  } else if (result.reason !== 'canceled') {
    saveStatusEl.textContent = 'Save failed — see console';
    console.error(result.reason);
  }
}

homeBtn.addEventListener('click', () => window.App.goHome());
projectNameInput.addEventListener('input', () => {
  projectName = projectNameInput.value;
  markDirty();
});
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
addTrackBtn.addEventListener('click', addTrack);
deleteClipBtn.addEventListener('click', deleteSelectedClip);
duplicateClipBtn.addEventListener('click', duplicateSelectedClip);
zoomOutBtn.addEventListener('click', zoomOut);
zoomInBtn.addEventListener('click', zoomIn);
saveBtn.addEventListener('click', saveProject);

exportBtn.addEventListener('click', async () => {
  const clip = findClip(selectedClipId);
  if (!clip) return;
  exportBtn.disabled = true;
  exportStatusEl.textContent = 'Exporting selected clip…';
  const result = await window.editorAPI.exportTrim({
    inputPath: clip.path,
    startSec: clip.inSec,
    endSec: clip.outSec,
  });
  exportBtn.disabled = false;
  if (result.ok) {
    exportStatusEl.textContent = `Exported to ${result.outputPath}`;
  } else if (result.reason === 'canceled') {
    exportStatusEl.textContent = 'Export canceled';
  } else {
    exportStatusEl.textContent = 'Export failed — see console';
    console.error(result.reason);
  }
});

function initProject(data, filePath) {
  if (data) {
    project.tracks = data.tracks || [];
    projectName = data.name || 'Untitled Project';
  } else {
    project.tracks = [{ id: 1, name: 'Track 1', clips: [] }];
    projectName = 'Untitled Project';
  }
  currentFilePath = filePath || null;
  selectedClipId = null;
  historyStack = [];
  redoStack = [];
  nextId = computeNextId();
  PPS = DEFAULT_PPS;
  videoEl.removeAttribute('src');
  projectNameInput.value = projectName;
  exportBtn.disabled = true;
  deleteClipBtn.disabled = true;
  duplicateClipBtn.disabled = true;
  exportStatusEl.textContent = project.tracks.some((t) => t.clips.length)
    ? ''
    : 'Add a clip to a track to get started';
  markClean();
  updateHistoryButtons();
  renderEditor();
}

function hasUnsavedChanges() {
  return dirty;
}

window.Editor = { initProject, hasUnsavedChanges };
