// Multitrack timeline: vanilla JS, no framework — state in `project`, re-rendered
// into the DOM on every change. Good enough at this scale; revisit if it grows.

const PPS = 40; // pixels per second of timeline

const project = {
  tracks: [],
};
let nextId = 1;
let selectedClipId = null;

const addTrackBtn = document.getElementById('addTrackBtn');
const exportBtn = document.getElementById('exportBtn');
const statusEl = document.getElementById('status');
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

function addTrack() {
  project.tracks.push({ id: nextId++, name: `Track ${project.tracks.length + 1}`, clips: [] });
  render();
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

  const lastClip = track.clips[track.clips.length - 1];
  const start = lastClip ? lastClip.start + (lastClip.outSec - lastClip.inSec) : 0;

  const clip = {
    id: nextId++,
    path: filePath,
    sourceDuration,
    inSec: 0,
    outSec: sourceDuration,
    start,
  };
  track.clips.push(clip);
  selectClip(clip.id);
  render();
}

function selectClip(clipId) {
  selectedClipId = clipId;
  const clip = findClip(clipId);
  if (clip) {
    videoEl.src = `file://${clip.path}`;
    exportBtn.disabled = false;
  }
  render();
}

function attachClipDrag(clipEl, clip) {
  clipEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('handle')) return; // handles manage their own drag
    e.preventDefault();
    selectClip(clip.id);
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
  // Re-render just the clip positions/sizes without rebuilding track headers,
  // so an in-progress drag doesn't fight with a full re-render.
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

function render() {
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

addTrackBtn.addEventListener('click', addTrack);

exportBtn.addEventListener('click', async () => {
  const clip = findClip(selectedClipId);
  if (!clip) return;
  exportBtn.disabled = true;
  statusEl.textContent = 'Exporting selected clip…';
  const result = await window.editorAPI.exportTrim({
    inputPath: clip.path,
    startSec: clip.inSec,
    endSec: clip.outSec,
  });
  exportBtn.disabled = false;
  if (result.ok) {
    statusEl.textContent = `Exported to ${result.outputPath}`;
  } else if (result.reason === 'canceled') {
    statusEl.textContent = 'Export canceled';
  } else {
    statusEl.textContent = 'Export failed — see console';
    console.error(result.reason);
  }
});

// Start with one empty track so the timeline isn't blank on launch.
addTrack();
statusEl.textContent = 'Add a clip to a track to get started';
