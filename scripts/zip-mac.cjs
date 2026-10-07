#!/usr/bin/env node
// Zips the packaged .app produced by `electron-packager` (npm run package:mac)
// into dist/Video Editor-mac-<arch>.zip, ready for drive-drop.cjs to pick up.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const distDir = path.join(__dirname, '..', 'dist');
const arch = process.arch;
const appDir = path.join(distDir, `Video Editor-darwin-${arch}`);
const appPath = path.join(appDir, 'Video Editor.app');
const zipPath = path.join(distDir, `Video Editor-mac-${arch}.zip`);

if (!fs.existsSync(appPath)) {
  console.error(`zip-mac: no packaged app at ${appPath} — run npm run package:mac first`);
  process.exit(1);
}

fs.rmSync(zipPath, { force: true });
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath]);
const size = fs.statSync(zipPath).size;
console.log(`zip-mac: wrote ${zipPath} (${Math.round(size / 1024 / 1024)} MB)`);
