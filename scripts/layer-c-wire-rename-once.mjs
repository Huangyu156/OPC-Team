#!/usr/bin/env node
// One-shot Layer C rename: window globals, event names, localStorage keys,
// wire protocol strings, tool names, appearance schema ids.
// Usage: node scripts/layer-c-wire-rename-once.mjs [--apply]
// Replaces the token `openbitfun` (case-insensitive variants) with `opc`
// equivalents everywhere EXCEPT: excluded paths, and listed keep-tokens
// that are NOT part of this layer (handled in D/E).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const EXCLUDE = new Set([
  'scripts/rename-crate-names-report.txt',
  'scripts/product-identity-residual-baseline.json',
  'pnpm-lock.yaml',
  'scripts/layer-c-wire-rename-once.mjs',
  'scripts/rename-crate-names-once.mjs',
]);

// Files whose whole content is a tracked generated artifact or protocol
// contract that must move together with the source that emits it.
// We rename in ALL tracked files; consistency is what matters.

// Mapping applied in order. Longest/most specific first.
// Each entry: [from, to] applied as split/join (plain text).
const REPLACEMENTS = [
  // window globals / bootstrap keys
  ['__OPENBITFUN_', '__OPC_'],
  ['window.__openbitfun', 'window.__opc'],
  ['window.openbitfun', 'window.opc'],
  ['window.OpenBitFun', 'window.Opc'],
  // dotted namespace strings (schema/storage/i18n/appearance ids)
  ['openbitfun.appearance', 'opc.appearance'],
  ['openbitfun.update', 'opc.update'],
  ['openbitfun.settings', 'opc.settings'],
  ['openbitfun.startup', 'opc.startup'],
  ['openbitfun.session', 'opc.session'],
  // event / command names with colon prefix
  ['openbitfun:', 'opc:'],
  // tool + UI type names
  ['OpenBitFunControl', 'OpcControl'],
  ['OpenBitFunCanvas', 'OpcCanvas'],
  ['OpenBitFunDesignSystemProvider', 'OpcDesignSystemProvider'],
  ['OpenBitFunTheme', 'OpcTheme'],
  ['OpenBitFunVersion', 'OpcVersion'],
  ['OpenBitFunArtwork', 'OpcArtwork'],
  ['OpenBitFunBrandMotion', 'OpcBrandMotion'],
  ['OpenBitFunMark', 'OpcMark'],
  ['OpenBitFunAppIcon', 'OpcAppIcon'],
  ['OpenBitFunSolidMark', 'OpcSolidMark'],
  ['OpenBitFunAppRuntime', 'OpcAppRuntime'],
  ['OpenBitFunAppServer', 'OpcAppServer'],
  // wire protocol / media types
  ['application/vnd.openbitfun.', 'application/vnd.opc.'],
  ['__openbitfun', '__opc'],
  // rust module paths + fn names already handled by crate rename; leftovers:
  ['openbitfun_wordmark', 'opc_wordmark'],
  ['openbitfun_image_docker', 'opc_image_docker'],
  ['openbitfun_mirror_priv', 'opc_mirror_priv'],
  // generic PascalCase product word in code identifiers (errors already opc_*,
  // but OpenBitFunError/Result were renamed in crate layer; catch strays)
  ['OpenBitFunError', 'OpcError'],
  ['OpenBitFunResult', 'OpcResult'],
  // remaining dotted/misc namespaces
  ['openbitfun.mobile', 'opc.mobile'],
  ['openbitfun.plugin.json', 'opc.plugin.json'],
  ['openbitfun.dev', 'opc.dev'],
  ['openbitfun.test', 'opc.test'],
  ['openbitfun-gpt', 'opc-gpt'],
  // bare lowercase token in strings/paths that Layer E will not cover
  // (kept conservative: only in files outside mobile/installer/deploy)
];

function listFiles() {
  const out = execSync('git ls-files -z', { encoding: 'buffer' }).toString('utf8');
  return out.split('\0').filter((f) => f && !EXCLUDE.has(f));
}

const perFile = new Map();
for (const file of listFiles()) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  let hits = 0;
  for (const [from, to] of REPLACEMENTS) {
    const parts = text.split(from);
    if (parts.length > 1) {
      hits += parts.length - 1;
      text = parts.join(to);
    }
  }
  if (hits > 0) perFile.set(file, { text, hits });
}

let total = 0;
for (const { hits } of perFile.values()) total += hits;
console.log(`files: ${perFile.size}, replacements: ${total}`);

if (APPLY) {
  for (const [file, { text }] of perFile) {
    fs.writeFileSync(file, text);
  }
  console.log('applied');
} else {
  // print per-area summary for dry run
  const areas = {};
  for (const [file, { hits }] of perFile) {
    const top = file.split('/').slice(0, 2).join('/');
    areas[top] = (areas[top] ?? 0) + hits;
  }
  for (const [k, v] of Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(String(v).padStart(6), k);
  }
}
