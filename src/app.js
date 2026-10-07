// Switches between the home screen and the editor. Loaded after home.js and
// editor.js so both `renderHome` and `window.Editor` already exist.

const homeView = document.getElementById('homeView');
const editorView = document.getElementById('editorView');

function showHome() {
  homeView.style.display = 'flex';
  editorView.style.display = 'none';
  renderHome();
}

function showEditor() {
  homeView.style.display = 'none';
  editorView.style.display = 'flex';
}

window.App = {
  openEditor(data, filePath) {
    window.Editor.initProject(data, filePath);
    showEditor();
  },
  goHome() {
    if (window.Editor.hasUnsavedChanges()) {
      const leave = confirm('You have unsaved changes. Leave without saving?');
      if (!leave) return;
    }
    showHome();
  },
};

showHome();
