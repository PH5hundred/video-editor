#!/usr/bin/env node
// Wraps the packaged .app from `npm run package:mac` in a DMG with the
// classic drag-to-Applications install window, via electron-installer-dmg.

const fs = require('fs');
const path = require('path');
const { createDMG } = require('electron-installer-dmg');

const distDir = path.join(__dirname, '..', 'dist');
const arch = process.arch;
const appDir = path.join(distDir, `Video Editor-darwin-${arch}`);
const appPath = path.join(appDir, 'Video Editor.app');
const dmgPath = path.join(distDir, `Video Editor-mac-${arch}.dmg`);

async function main() {
  if (!fs.existsSync(appPath)) {
    console.error(`make-dmg: no packaged app at ${appPath} — run npm run package:mac first`);
    process.exit(1);
  }
  fs.rmSync(dmgPath, { force: true });

  await createDMG({
    appPath,
    name: 'Video Editor',
    title: 'Video Editor',
    out: distDir,
    overwrite: true,
    // electron-installer-dmg's default background.png is 658x498px. Without
    // an explicit window size it falls back to the background's own pixel
    // dimensions — which should match, but left a visible white gap to the
    // right of the artwork in practice. Pinning it explicitly removes any
    // ambiguity between the background image's size and the window Finder
    // actually opens.
    additionalDMGOptions: {
      window: {
        size: { width: 658, height: 498 },
      },
    },
  });

  // createDMG names its output "<name>.dmg" with no arch suffix — rename to
  // match this project's "Video Editor-mac-<arch>" convention (same as
  // zip-mac.cjs) so drive-drop.cjs's glob picks it up and future non-arm64
  // builds don't collide.
  fs.renameSync(path.join(distDir, 'Video Editor.dmg'), dmgPath);

  const size = fs.statSync(dmgPath).size;
  console.log(`make-dmg: wrote ${dmgPath} (${Math.round(size / 1024 / 1024)} MB)`);
}

main().catch((error) => {
  console.error('make-dmg:', error);
  process.exit(1);
});
