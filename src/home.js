// Home screen: new/open project + a recent-projects list. Exposes nothing —
// app.js calls renderHome() directly when switching to this view.

const newProjectBtn = document.getElementById('newProjectBtn');
const openProjectBtn = document.getElementById('openProjectBtn');
const recentsListEl = document.getElementById('recentsList');
const updateBanner = document.getElementById('updateBanner');
const updateBannerText = document.getElementById('updateBannerText');
const updateDownloadBtn = document.getElementById('updateDownloadBtn');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');

function fmtRelative(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function renderHome() {
  const recents = await window.editorAPI.getRecentProjects();
  recentsListEl.innerHTML = '';

  if (recents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recents-empty';
    empty.textContent = 'No recent projects yet.';
    recentsListEl.appendChild(empty);
    return;
  }

  for (const recent of recents) {
    const row = document.createElement('div');
    row.className = 'recent-item';

    const info = document.createElement('div');
    info.className = 'recent-info';
    const name = document.createElement('div');
    name.className = 'recent-name';
    name.textContent = recent.name || recent.path.split('/').pop();
    const meta = document.createElement('div');
    meta.className = 'recent-meta';
    meta.textContent = fmtRelative(recent.lastOpened);
    info.appendChild(name);
    info.appendChild(meta);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'small ghost';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.editorAPI.removeRecentProject(recent.path);
      renderHome();
    });

    row.appendChild(info);
    row.appendChild(removeBtn);
    row.addEventListener('click', async () => {
      const result = await window.editorAPI.openProjectPath(recent.path);
      if (result.ok) {
        window.App.openEditor(result.data, result.filePath);
      } else {
        renderHome(); // stale entry — main process already pruned it
      }
    });

    recentsListEl.appendChild(row);
  }
}

newProjectBtn.addEventListener('click', () => {
  window.App.openEditor(null, null);
});

openProjectBtn.addEventListener('click', async () => {
  const result = await window.editorAPI.openProjectDialog();
  if (result.ok) {
    window.App.openEditor(result.data, result.filePath);
  }
});

function showUpdateBanner(info) {
  updateBannerText.textContent = `Update available: ${info.latestVersion} (you have ${info.currentVersion})`;
  updateDownloadBtn.onclick = () => window.editorAPI.openExternal(info.url);
  updateBanner.classList.add('visible');
}

window.editorAPI.onUpdateAvailable(showUpdateBanner);

checkUpdateBtn.addEventListener('click', async () => {
  checkUpdateBtn.disabled = true;
  checkUpdateBtn.textContent = 'Checking…';
  const result = await window.editorAPI.checkForUpdate();
  checkUpdateBtn.disabled = false;
  if (result.ok && result.hasUpdate) {
    showUpdateBanner(result);
    checkUpdateBtn.textContent = 'Check for Updates';
  } else if (result.ok) {
    checkUpdateBtn.textContent = 'Up to date ✓';
    setTimeout(() => { checkUpdateBtn.textContent = 'Check for Updates'; }, 2500);
  } else {
    checkUpdateBtn.textContent = 'Check failed';
    setTimeout(() => { checkUpdateBtn.textContent = 'Check for Updates'; }, 2500);
  }
});
