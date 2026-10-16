#!/usr/bin/env node
// One-shot Layer A renamer: npm scope + @layer names.
// Replaces, in tracked text files only:
//   1. "@opc-team/theme" -> "@opc-team/theme"
//   2. "@opc-team/"                 -> "@opc-team/"
//   3. "@layer opcteam"            -> "@layer opcteam"
//   4. openbitfun.{reset,base,components,overrides} -> opcteam.*
// Excluded: lockfiles, baseline ledger, rename report, relay static build
// products (rebuilt in Layer E), node_modules, .git, dist outputs.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, sep } from 'node:path';

const ROOT = process.cwd();
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.jsonc', '.json5',
  '.md', '.mdx', '.css', '.scss', '.sass', '.less', '.html', '.htm', '.rs',
  '.toml', '.yml', '.yaml', '.svg', '.txt', '.sh', '.ps1', '.kt', '.kts',
  '.swift', '.ets', '.json5', '.xml', '.plist', '.entitlements', '.gradle',
  '.properties', '.env', '.gitignore', '.gitattributes', '.npmrc', '',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'target', 'dist', 'build', '.turbo', '.vite',
  'coverage', '.next', 'oh_modules', '.cxx', '.hvigor',
]);
const SKIP_PATHS = new Set([
  'pnpm-lock.yaml',
  join('scripts', 'product-identity-residual-baseline.json'),
  join('scripts', 'rename-crate-names-report.txt'),
  join('src', 'apps', 'relay-server', 'static'),
  join('packages', 'dsh-acp', 'package-lock.json'),
]);

const REPLACEMENTS = [
  ['@opc-team/theme', '@opc-team/theme'],
  ['@opc-team/', '@opc-team/'],
  ['@layer opcteam', '@layer opcteam'],
  ['opcteam.reset', 'opcteam.reset'],
  ['opcteam.base', 'opcteam.base'],
  ['opcteam.components', 'opcteam.components'],
  ['opcteam.overrides', 'opcteam.overrides'],
];

let changedFiles = 0;
let changedLines = 0;
const perFile = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = full.slice(ROOT.length + 1).split(sep).join('/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_PATHS.has(rel)) continue;
      walk(full);
    } else if (entry.isFile()) {
      if (SKIP_PATHS.has(rel)) continue;
      if (!TEXT_EXTS.has(extname(entry.name))) continue;
      let text;
      try {
        text = readFileSync(full, 'utf8');
      } catch {
        continue; // binary or unreadable
      }
      if (!text.includes('openbitfun')) continue;
      let next = text;
      let count = 0;
      for (const [from, to] of REPLACEMENTS) {
        let idx = 0;
        while ((idx = next.indexOf(from, idx)) !== -1) {
          count++;
          idx += to.length;
        }
        next = next.split(from).join(to);
      }
      if (count > 0 && next !== text) {
        writeFileSync(full, next);
        changedFiles++;
        changedLines += count;
        perFile.push(`${rel}: ${count}`);
      }
    }
  }
}

walk(ROOT);
console.log(`Layer A: ${changedFiles} files changed, ${changedLines} replacements.`);
console.log(perFile.slice(0, 40).join('\n'));
if (perFile.length > 40) console.log(`...and ${perFile.length - 40} more files.`);
