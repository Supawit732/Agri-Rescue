#!/usr/bin/env node
/**
 * Assert th.ts and en.ts Message catalogs have identical key trees.
 * Run from repo root: node --import tsx scripts/check-i18n-keys.mjs
 * Or: cd server && npx tsx ../scripts/check-i18n-keys.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const thMod = await import(pathToFileURL(join(root, 'mobile/src/i18n/th.ts')).href);
const enMod = await import(pathToFileURL(join(root, 'mobile/src/i18n/en.ts')).href);
const th = thMod.default;
const en = enMod.default;

function keys(obj, prefix = '') {
  if (obj === null || typeof obj !== 'object') {
    return [prefix];
  }
  if (Array.isArray(obj)) {
    return [prefix];
  }
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

const tk = new Set(keys(th));
const ek = new Set(keys(en));
const onlyTh = [...tk].filter((k) => !ek.has(k)).sort();
const onlyEn = [...ek].filter((k) => !tk.has(k)).sort();

if (onlyTh.length > 0 || onlyEn.length > 0) {
  console.error(`i18n key mismatch: th=${tk.size} en=${ek.size}`);
  if (onlyTh.length) {
    console.error('Only in th:\n' + onlyTh.join('\n'));
  }
  if (onlyEn.length) {
    console.error('Only in en:\n' + onlyEn.join('\n'));
  }
  process.exit(1);
}

console.log(`i18n keys OK: ${tk.size} keys match in th and en`);
