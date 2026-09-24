#!/usr/bin/env node
/**
 * Fail if Thai Unicode appears in mobile UI source files (outside i18n catalogs).
 * Scans: mobile/app, mobile/src/screens, mobile/src/components
 * Allows: mobile/src/i18n/**, comments-only lines are still flagged if they contain Thai
 *   (keep comments English in scanned files).
 *
 * Run: node scripts/check-no-thai-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const TH = /[\u0E00-\u0E7F]/;
const roots = [
  path.join(root, 'mobile/app'),
  path.join(root, 'mobile/src/screens'),
  path.join(root, 'mobile/src/components'),
];
const exts = new Set(['.ts', '.tsx']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') {
        continue;
      }
      walk(full, out);
    } else if (exts.has(path.extname(name))) {
      out.push(full);
    }
  }
  return out;
}

const hits = [];
for (const dir of roots) {
  for (const file of walk(dir)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const stripped = line.trim();
      if (stripped.startsWith('//') || stripped.startsWith('*') || stripped.startsWith('/*')) {
        return;
      }
      if (TH.test(line)) {
        hits.push(`${path.relative(root, file)}:${i + 1}:${stripped.slice(0, 140)}`);
      }
    });
  }
}

if (hits.length > 0) {
  console.error(`Found ${hits.length} Thai literal(s) outside i18n catalogs:`);
  for (const h of hits) {
    console.error(h);
  }
  process.exit(1);
}

console.log('No Thai literals in scanned UI files.');
