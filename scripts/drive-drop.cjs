#!/usr/bin/env node
// Copies every packaged build zip in dist/ into Parker's iCloud Drive AND
// Google Drive "Video Editor" folders, refreshing both on every run. Modeled
// on BeepBox — Reborn's scripts/drive-drop.cjs, extended to cover iCloud too
// (that project lives inside iCloud Drive already, so it only needed to
// handle the Google Drive side; this project's source does not live there,
// so neither copy is free — both are made explicitly here).
//
// Runs as a postpackage step. It is silent by design when a cloud root isn't
// reachable (iCloud Drive off, Google Drive for Desktop not running, etc.) —
// a packaged build should not look like it half-failed on a machine that
// simply doesn't have that cloud mounted.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const FOLDER_NAME = 'Video Editor';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DEADLINE_MS = 8000;

// Probing/copying in-process could hang the event loop with no way out if a
// cloud file provider is still indexing, so every filesystem touch here runs
// in a child process that can simply be killed on a deadline.
function run(expr, timeout) {
  try {
    execFileSync(process.execPath, ['-e', expr], { timeout, stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function reachable(target) {
  return run(`require("fs").readdirSync(${JSON.stringify(target)})`, DEADLINE_MS);
}

function ensureFolder(target) {
  if (reachable(target)) return true;
  return run(`require("fs").mkdirSync(${JSON.stringify(target)}, {recursive: true})`, DEADLINE_MS);
}

function findBuildArtifacts() {
  if (!fs.existsSync(DIST_DIR)) return [];
  return fs
    .readdirSync(DIST_DIR)
    .filter((name) => /^Video Editor-.*\.(dmg|zip)$/.test(name))
    .map((name) => path.join(DIST_DIR, name));
}

function findTargets() {
  const targets = [];

  const icloudRoot = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  if (reachable(icloudRoot)) {
    const icloudFolder = path.join(icloudRoot, FOLDER_NAME);
    if (ensureFolder(icloudFolder)) targets.push(icloudFolder);
  }

  const cloudStorage = path.join(os.homedir(), 'Library', 'CloudStorage');
  let entries = [];
  try {
    entries = fs.readdirSync(cloudStorage);
  } catch (error) {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.startsWith('GoogleDrive-')) continue;
    for (const root of ['My Drive', 'Shared drives']) {
      const driveRoot = path.join(cloudStorage, entry, root);
      if (!reachable(driveRoot)) continue;
      const driveFolder = path.join(driveRoot, FOLDER_NAME);
      if (ensureFolder(driveFolder)) targets.push(driveFolder);
    }
  }

  return targets;
}

function main() {
  const artifacts = findBuildArtifacts();
  if (artifacts.length === 0) {
    console.log('drive-drop: no build artifact in dist/ — nothing to copy');
    return;
  }

  const targets = findTargets();
  if (targets.length === 0) {
    // Silent by design — see header comment.
    return;
  }

  for (const target of targets) {
    for (const source of artifacts) {
      const destination = path.join(target, path.basename(source));
      const ok = run(
        `require("fs").copyFileSync(${JSON.stringify(source)}, ${JSON.stringify(destination)})`,
        DEADLINE_MS * 4
      );
      if (ok) {
        const size = fs.statSync(source).size;
        console.log(`drive-drop: copied ${path.basename(source)} (${Math.round(size / 1024 / 1024)} MB) to ${target}`);
      } else {
        console.log(`drive-drop: could not write to ${target} (cloud folder may still be syncing) - skipped`);
      }
    }
  }
}

main();
