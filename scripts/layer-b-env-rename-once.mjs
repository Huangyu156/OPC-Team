#!/usr/bin/env node
// One-shot Layer B rename: OPENBITFUN_* environment variables -> OPC_*.
// Usage: node scripts/layer-b-env-rename-once.mjs [--apply]
// Without --apply prints the planned mapping and per-file hit counts only.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const EXCLUDE_PATHS = [
  'scripts/rename-crate-names-report.txt',
  'scripts/product-identity-residual-baseline.json',
  'pnpm-lock.yaml',
  'scripts/layer-b-env-rename-once.mjs',
];

const files = execSync('git ls-files -z', { encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter((f) => f && !EXCLUDE_PATHS.some((x) => f === x || f.endsWith('/' + x)));

const envRe = /OPENBITFUN_[A-Z0-9_]+/g;
const mapping = new Map();
const perFile = new Map();

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const matches = text.match(envRe);
  if (!matches) continue;
  for (const m of matches) {
    if (!mapping.has(m)) mapping.set(m, 'OPC' + m.slice('OPENBITFUN'.length));
  }
  perFile.set(file, matches.length);
}

let out = `mapping: ${mapping.size} names, files: ${perFile.size}\n`;
for (const [from, to] of [...mapping.entries()].sort()) out += `  ${from} -> ${to}\n`;

if (!APPLY) {
  console.log(out);
} else {
  for (const [file, count] of perFile) {
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(envRe, (m) => mapping.get(m));
    fs.writeFileSync(file, text);
    out += `wrote ${file} (${count})\n`;
  }
  console.log(out);
}
