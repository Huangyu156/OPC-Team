#!/usr/bin/env node
// Generate scripts/layer-c-rename-map.json from the live form inventory.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const out = execSync(
  'git grep -o -E "[A-Za-z_][A-Za-z0-9_-]*[Oo]pen[Bb]it[Ff]un[A-Za-z0-9_-]*|[Oo]pen[Bb]it[Ff]un[A-Za-z0-9_-]*|OPENBITFUN[A-Z0-9_]*" -- ":(exclude)scripts/rename-crate-names-report.txt" ":(exclude)scripts/product-identity-residual-baseline.json" ":(exclude)pnpm-lock.yaml" ":(exclude)scripts/layer-c-rename-once.mjs" ":(exclude)scripts/layer-c-map.mjs"',
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64, shell: 'bash' },
);
const forms = new Set(out.trim().split('\n').map((l) => l.slice(l.indexOf(':') + 1)).filter(Boolean));
const skip = new Set([
  'OpenBitFun', 'OPENBITFUN', 'openbitfun',
  'OpenBitFun-', 'openbitfun-', 'openbitfun_', 'OpenBitFun_', '_openbitfun',
  'OpenBitFun-1', 'OpenBitFun_1', 'openbitfun-cli-1', 'openbitfun-relay-1',
  'OpenBitFun-48e8b457', 'OpenBitFun-wt-1', 'OpenBitFun-Mobile-',
]);
const map = {};
for (const f of forms) {
  if (skip.has(f)) continue;
  let to;
  if (f.startsWith('__OPENBITFUN')) to = '__OPC' + f.slice('__OPENBITFUN'.length);
  else if (f.startsWith('__openbitfun')) to = '__opc' + f.slice('__openbitfun'.length);
  else if (f.startsWith('_openbitfun')) to = '_opc' + f.slice('_openbitfun'.length);
  else if (f.startsWith('OpenBitFun')) to = 'Opc' + f.slice('OpenBitFun'.length);
  else if (f.startsWith('openBitFun')) to = 'opc' + f.slice('openBitFun'.length);
  else if (f.startsWith('openbitfun-')) to = 'opc-' + f.slice('openbitfun-'.length);
  else if (f.startsWith('openbitfun_')) to = 'opc_' + f.slice('openbitfun_'.length);
  else if (f.startsWith('openbitfun')) to = 'opc' + f.slice('openbitfun'.length);
  else if (f.includes('OpenBitFun')) to = f.split('OpenBitFun').join('Opc');
  else if (f.includes('openbitfun')) to = f.split('openbitfun').join('opc');
  else continue;
  map[f] = to;
}
fs.writeFileSync('scripts/layer-c-rename-map.json', JSON.stringify(map, null, 2) + '\n');
console.log('mapped:', Object.keys(map).length);
