#!/usr/bin/env node
// One-shot Layer C rename: remaining openbitfun identifiers in source.
// Covers PascalCase types/components, camelCase globals, __openbitfun* window
// keys, __OPENBITFUN_* env-shaped globals, dataset keys, event names, CSS
// class/prefix tokens, and i18n key fragments. Reads mappings from
// scripts/layer-c-rename-map.json ({ "from": "to", ... }), longest key first.
// Usage: node scripts/layer-c-rename-once.mjs [--apply]
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const SELF = 'scripts/layer-c-rename-once.mjs';
const EXCLUDE = new Set([
  'scripts/rename-crate-names-report.txt',
  'scripts/product-identity-residual-baseline.json',
  'pnpm-lock.yaml',
  'scripts/rename-crate-names-once.mjs',
  'scripts/layer-a-rename-once.mjs',
  'scripts/layer-b-env-rename-once.mjs',
  SELF,
]);

const map = JSON.parse(fs.readFileSync('scripts/layer-c-rename-map.json', 'utf8'));
const keys = Object.keys(map).sort((a, b) => b.length - a.length);
const pattern = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

const files = execSync('git ls-files -z', { encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter((f) => f && !EXCLUDE.has(f));

let fileCount = 0;
let hitCount = 0;
for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!pattern.test(text)) continue;
  pattern.lastIndex = 0;
  const hits = (text.match(pattern) || []).length;
  if (!APPLY) {
    console.log(`${hits}\t${file}`);
    hitCount += hits;
    fileCount++;
    continue;
  }
  text = text.replace(pattern, (m) => map[m] ?? m);
  fs.writeFileSync(file, text);
  console.log(`wrote ${file} (${hits})`);
  hitCount += hits;
  fileCount++;
}
console.log(`files: ${fileCount}, hits: ${hitCount}`);
