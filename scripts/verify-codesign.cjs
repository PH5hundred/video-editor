#!/usr/bin/env node
// Fails loudly if the given .app isn't validly, fully signed — run against
// both the pre-DMG packaged app and the DMG's own copy in CI, so a broken
// signature (which Gatekeeper reports to users as "is damaged and can't be
// opened", not a gentler warning) fails the build instead of shipping.

const { execFileSync } = require('child_process');

const target = process.argv[2];
if (!target) {
  console.error('usage: verify-codesign.cjs <path-to-.app>');
  process.exit(1);
}

try {
  execFileSync('codesign', ['--verify', '--deep', '--strict', target], { stdio: 'inherit' });
  execFileSync('codesign', ['-dvvv', target], { stdio: 'inherit' });
  console.log(`verify-codesign: OK — ${target}`);
} catch (error) {
  console.error(`verify-codesign: FAILED — ${target} is not validly signed`);
  process.exit(1);
}
