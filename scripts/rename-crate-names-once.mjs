// One-shot deterministic rename: openbitfun_* -> opc_* and openbitfun-X -> opc-X
// with an explicit keep-list for upgrade/deployment compat boundaries.
// Run: node scripts/rename-crate-names-once.cjs
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();

// Files whose ENTIRE content is protected (external identity artifacts).
const protectedFiles = new Set([
  'extensions/dsh-openbitfun/lib/index.js',
  'extensions/dsh-openbitfun/package.json',
]);

// Global keep-list: literal substrings that must never be rewritten anywhere.
const keepLiterals = [
  'opcteam.eu.cc',            // domain
  'openbitfun-appearance',     // skin package format
  'openbitfun-home',           // test fixture dir names
  'openbitfun-dark', 'openbitfun-light', 'openbitfun-midnight', 'openbitfun-ink-night',
  'openbitfun-cyber', 'openbitfun-tokyo-night', 'openbitfun-china-style', 'openbitfun-china-night',
  'openbitfun-slate',          // theme ids
  'openbitfun-cli-server-host',
  'openbitfun-cli-daemon.service',
  'openbitfun_run', // external tool name (hyphen form only occurs inside openbitfun-runtime-*)
  'dsh-openbitfun',            // published plugin package
  'theme-openbitfun',          // npm theme package (separate layer)
  'create-openbitfun-skin',    // builtin skill identity
  'OPENBITFUN_',               // env vars (separate pass)
  'openbitfun-app-icon', 'openbitfun-mark', 'openbitfun-app-mark', // brand asset filenames (brand layer later)
];

// Cargo.toml [[bin]]/default-run name values that stay (binary/product identities).
const keepBinNames = new Set([
  'openbitfun', 'openbitfun-desktop', 'openbitfun-server', 'openbitfun-relay-server',
  'openbitfun-sdk-host', 'openbitfun-data-migrator', 'openbitfun-miniapp-market-server',
  'openbitfun-skin-market-server', 'openbitfun-installer', 'relay-admin',
]);

// Per-line protections: a line containing any of these keeps its openbitfun spellings.
const lineKeepers = [
  /IMAGE=/, // docker image assignment in CI
  /ghcr\.io/,
  /--pattern '/,
  /openbitfun-relay-server-.*\.tar\.gz/,
];

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !protectedFiles.has(f))
  .filter((f) => /\.(rs|toml|mjs|js|ts|tsx|json|py|yml|yaml|md|lock)$/.test(f))
  .filter((f) => !f.startsWith('third_party/'));

// Hypen package names we rename (only these; hyphen keep-list handled by keepLiterals).
const renameableHyphenPkgs = new Set([
  'openbitfun-cli', 'openbitfun-acp', 'openbitfun-agent-runtime', 'openbitfun-agent-stream',
  'openbitfun-agent-workflows', 'openbitfun-agent-tools', 'openbitfun-ai-adapters',
  'openbitfun-app-server', 'openbitfun-app-server-client', 'openbitfun-app-server-protocol',
  'openbitfun-core', 'openbitfun-core-types', 'openbitfun-events', 'openbitfun-runtime-ports',
  'openbitfun-product-domains', 'openbitfun-agent-runtime-ipc', 'openbitfun-codex-adapter',
  'openbitfun-claude-code-adapter', 'openbitfun-opencode-adapter', 'openbitfun-opencode-plugin-host',
  'openbitfun-static-hook-support', 'openbitfun-transport', 'openbitfun-services-core',
  'openbitfun-services-integrations', 'openbitfun-miniapp-market-service', 'openbitfun-relay-service',
  'openbitfun-page-function-runtime', 'openbitfun-legacy-migration', 'openbitfun-plugin-runtime-client',
  'openbitfun-runtime-services', 'openbitfun-tool-packs', 'openbitfun-tool-execution',
  'openbitfun-external-sources', 'openbitfun-product-capabilities', 'openbitfun-product-full',
  'openbitfun-sdk-host-lib', 'openbitfun-desktop-lib', 'openbitfun-data-migrator-lib',
  'openbitfun-installer-lib', 'openbitfun-dsh-adapter',
]);
// relay-server pkg -> opc-relay-server BUT its bin + docker image keep old name.
// data-migrator/bin "openbitfun-data-migrator": pkg renames, bin name line kept by bin-name rule.

let changed = 0;
const report = [];
for (const file of files) {
  const raw = readFileSync(join(root, file), 'utf8');
  let out = raw;
  const isCargo = file.endsWith('Cargo.toml') || file.endsWith('.lock');
  let cargoSection = '';
  const lines = out.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (isCargo && /^\s*\[/.test(line)) {
      cargoSection = line;
      continue;
    }
    if (!line.includes('openbitfun')) continue;
    if (keepLiterals.some((k) => line.includes(k)) && !/openbitfun_(?!.*(?:tools?|control|search))|openbitfun-(?!com|appearance|home|dark|light|midnight|ink-night|cyber|tokyo-night|china|slate|cli-server|cli-daemon|run)/.test(line)) {
      // line is entirely about protected spellings? Still may contain renameable crate refs — handle per-token below.
    }
    if (isCargo) {
      const nameLine = line.match(/^\s*(?:name|default-run)\s*=\s*"([^"]+)"/);
      if (nameLine) {
        const isDefaultRun = /^\s*default-run/.test(line);
        // [[bin]]/[[test]]/[[bench]]/[[example]] sections own their target names; keep.
        const inBinSection = /bin|test|bench|example/.test(cargoSection);
        if (inBinSection || isDefaultRun) continue;
        // [package] name falls through to the rename below.
      }
    }
    if (lineKeepers.some((re) => re.test(line))) {
      // docker image / tar names keep hyphen spellings wholesale
      continue;
    }
    // Token-level rewrite: openbitfun_xxx -> opc_xxx ; openbitfun-xxx -> opc-xxx
    // but never touch protected literals: temporarily shield them.
    let work = line;
    const shields = [];
    for (const k of keepLiterals) {
      const boundary = new RegExp(`${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-zA-Z0-9_-])`);
      let m;
      while ((m = work.match(boundary))) {
        const token = `\u0000${shields.length}\u0000`;
        shields.push(m[0]);
        work = work.slice(0, m.index) + token + work.slice(m.index + m[0].length);
      }
    }
    work = work.replace(/openbitfun_/g, 'opc_').replace(/openbitfun-/g, 'opc-');
    // restore shields
    work = work.replace(/\u0000(\d+)\u0000/g, (_, n) => shields[Number(n)]);
    lines[i] = work;
  }
  out = lines.join('\n');
  if (out !== raw && !process.env.DRY_RUN) {
    writeFileSync(join(root, file), out);
    changed++;
    report.push(file);
  }
}
console.log(`changed ${changed} files`);
writeFileSync(join(root, 'scripts/rename-crate-names-report.txt'), report.join('\n'));
