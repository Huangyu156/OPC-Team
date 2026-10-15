#!/usr/bin/env node

/**
 * One-time, manually invoked migration of pre-rename user data.
 *
 * The product rename changed the data identity, not only the display name:
 * user-level state moved from the `openbitfun` namespace / `.openbitfun` home
 * directory to `opcteam` / `.opcteam` (see
 * `src/crates/contracts/core-types/src/product_identity.rs` and
 * `src/crates/assembly/core/src/infrastructure/app_paths/path_manager.rs`).
 * After upgrading, the application only reads the new locations, so pre-rename
 * data stays invisible until someone copies it across.
 *
 * This script is deliberately conservative:
 * - It is a dry run unless `--apply` is passed.
 * - It copies, never moves or deletes, the source tree.
 * - It refuses unsafe source/target combinations and never writes inside the
 *   repository checkout.
 * - It backs up a non-empty destination before touching it.
 *
 * It does not replace the standalone Data Migrator, which owns 0.2.x data.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');

// Keep these literals aligned with the compiled defaults in
// src/crates/contracts/core-types/src/product_identity.rs. They are the only
// directory names this script renames.
export const LEGACY_DATA_NAMESPACE = 'openbitfun';
export const DATA_NAMESPACE = 'opcteam';
export const LEGACY_HIDDEN_DATA_DIRECTORY = '.openbitfun';
export const HIDDEN_DATA_DIRECTORY = '.opcteam';

// The SSH data directory intentionally keeps its published product name, so it
// must never be renamed by a migration.
const SSH_DATA_DIRECTORY_NAME = 'OpenBitFun';

const SKIPPED_SAMPLE_LIMIT = 10;

const USAGE = `Usage: node scripts/migrate-opc-to-opcteam.mjs [options]

Copies pre-rename data directories to the OPC-Team identity. Nothing is written
without --apply.

Options:
  --apply             Copy the data; without it the script only prints a plan.
  --force             Overwrite files that already exist in the destination.
  --workspace <path>  Also migrate <path>/.openbitfun to <path>/.opcteam.
                      Repeatable; no directory is discovered automatically.
  --json              Print a machine-readable JSON report instead of text.
  --help              Show this help.

Behavior:
  - Sources are copied, never moved or deleted.
  - Existing destination files are skipped unless --force is given.
  - A non-empty destination is backed up to <target>.backup-<yyyymmddHHmmss>
    first; a failed backup aborts before any file is copied.
  - A missing source directory is a no-op, not an error.
  - Exit codes: 0 success, 1 usage error, 2 refused by a safety guard.

This script performs a manual, one-time file copy. It is not an in-app migration
and it does not touch 0.2.x data owned by the standalone Data Migrator.`;

function lstatSafe(target) {
  try {
    return lstatSync(target);
  } catch {
    return null;
  }
}

function pathExists(target) {
  return lstatSafe(target) !== null;
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Resolve the two platform bases that hold the renamed directories.
 *
 * The base directories mirror `dirs::config_dir()` plus the user home directory,
 * which is exactly what the product compiles into `PathManager`.
 */
export function resolvePlatformBaseDirectories({
  platform = process.platform,
  env = process.env,
  home = homedir(),
} = {}) {
  if (platform === 'win32') {
    const appData = env.APPDATA && env.APPDATA.trim() !== ''
      ? env.APPDATA
      : path.join(home, 'AppData', 'Roaming');
    return { configBase: appData, hiddenBase: home };
  }

  if (platform === 'darwin') {
    return {
      configBase: path.join(home, 'Library', 'Application Support'),
      hiddenBase: home,
    };
  }

  const xdgConfigHome = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== ''
    ? env.XDG_CONFIG_HOME
    : path.join(home, '.config');
  return { configBase: xdgConfigHome, hiddenBase: home };
}

/**
 * Build the ordered migration plan: user config namespace, hidden data
 * directory, then every explicitly requested workspace.
 *
 * Workspaces are never discovered by scanning the disk.
 */
export function planMigrationRoots({
  platform = process.platform,
  env = process.env,
  home = homedir(),
  workspaces = [],
} = {}) {
  const { configBase, hiddenBase } = resolvePlatformBaseDirectories({ platform, env, home });

  const roots = [
    {
      kind: 'config-namespace',
      label: 'User config namespace',
      source: path.resolve(configBase, LEGACY_DATA_NAMESPACE),
      target: path.resolve(configBase, DATA_NAMESPACE),
    },
    {
      kind: 'hidden-data',
      label: 'Hidden product home',
      source: path.resolve(hiddenBase, LEGACY_HIDDEN_DATA_DIRECTORY),
      target: path.resolve(hiddenBase, HIDDEN_DATA_DIRECTORY),
    },
  ];

  for (const workspace of workspaces) {
    const resolvedWorkspace = path.resolve(workspace);
    roots.push({
      kind: 'workspace',
      label: `Workspace ${resolvedWorkspace}`,
      source: path.join(resolvedWorkspace, LEGACY_HIDDEN_DATA_DIRECTORY),
      target: path.join(resolvedWorkspace, HIDDEN_DATA_DIRECTORY),
    });
  }

  return roots;
}

/**
 * Return an error string when a source/target pair is unsafe, otherwise null.
 */
export function validateRootGuardrails(root, { repositoryRoot: repoRoot = null } = {}) {
  const source = path.resolve(root.source);
  const target = path.resolve(root.target);

  if (source === target) {
    return `source and target are the same directory: ${source}`;
  }

  if (isInside(target, source)) {
    return `target is inside the source directory: ${target} is nested in ${source}`;
  }

  if (repoRoot && isInside(target, path.resolve(repoRoot))) {
    return `refusing to write inside the repository checkout: ${target}`;
  }

  return null;
}

/** Snapshot a directory tree into `{ directories, files }` relative paths. */
export function readTree(root) {
  const directories = [];
  const files = [];

  const walk = (absoluteDir, relativeDir) => {
    const entries = readdirSync(absoluteDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));

    for (const entry of entries) {
      const absolute = path.join(absoluteDir, entry.name);
      const relative = relativeDir === '' ? entry.name : path.join(relativeDir, entry.name);

      if (entry.isSymbolicLink()) {
        files.push({ relative, absolute, bytes: 0, kind: 'symlink' });
        continue;
      }

      if (entry.isDirectory()) {
        directories.push(relative);
        walk(absolute, relative);
        continue;
      }

      if (entry.isFile()) {
        files.push({ relative, absolute, bytes: statSync(absolute).size, kind: 'file' });
        continue;
      }

      // Sockets, FIFOs and devices have no meaningful copy; report and skip them.
      files.push({ relative, absolute, bytes: 0, kind: 'unsupported' });
    }
  };

  walk(root, '');
  return { directories, files };
}

export function formatBackupTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function resolveBackupPath(target, now) {
  const base = `${target}.backup-${formatBackupTimestamp(now)}`;
  let candidate = base;
  let suffix = 1;
  // Never overwrite an existing backup, even when two runs land in the same
  // second.
  while (existsSync(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createBackup(target, now) {
  const backupPath = resolveBackupPath(target, now);
  // Copy rather than rename so the destination keeps its current contents and
  // the skip/force decision below stays meaningful.
  cpSync(target, backupPath, { recursive: true, force: false, errorOnExist: true });
  return backupPath;
}

function copySymlink(source, destination) {
  if (pathExists(destination)) {
    rmSync(destination, { force: true, recursive: false });
  }
  const linkTarget = readlinkSync(source);
  const followed = statSync(source, { throwIfNoEntry: false });
  const type = process.platform === 'win32' && followed?.isDirectory() ? 'junction' : 'file';
  symlinkSync(linkTarget, destination, type);
}

function replaceFileDestination(destination) {
  const existing = lstatSafe(destination);
  if (existing && existing.isSymbolicLink()) {
    rmSync(destination, { force: true, recursive: false });
  }
}

/**
 * Migrate a single root. In dry-run mode nothing is written and the copy/skip
 * counters describe the plan.
 *
 * `backupFactory` is a seam for tests; the default creates the timestamped
 * snapshot directory.
 */
export function migrateRoot(
  root,
  { apply = false, force = false, now = new Date(), backupFactory = createBackup } = {},
) {
  const report = {
    kind: root.kind,
    label: root.label,
    source: path.resolve(root.source),
    target: path.resolve(root.target),
    status: 'dry-run',
    totalFiles: 0,
    totalBytes: 0,
    copied: 0,
    skipped: 0,
    copiedBytes: 0,
    skippedBytes: 0,
    unsupported: 0,
    backup: null,
    skippedSamples: [],
  };

  const sourceStat = lstatSafe(report.source);
  if (!sourceStat) {
    report.status = 'source-missing';
    return report;
  }

  if (!sourceStat.isDirectory()) {
    report.status = 'source-not-a-directory';
    return report;
  }

  const { directories, files } = readTree(report.source);
  report.totalFiles = files.length;
  report.totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);

  const decisions = files.map((file) => {
    const destination = path.join(report.target, file.relative);
    const exists = pathExists(destination);
    return { file, destination, exists, skip: exists && !force };
  });

  const plannedCopies = decisions.filter((decision) => !decision.skip && decision.file.kind !== 'unsupported');
  const plannedSkips = decisions.filter((decision) => decision.skip);
  const plannedUnsupported = decisions.filter(
    (decision) => !decision.skip && decision.file.kind === 'unsupported',
  );

  report.copied = plannedCopies.length;
  report.copiedBytes = plannedCopies.reduce((sum, decision) => sum + decision.file.bytes, 0);
  report.skipped = plannedSkips.length;
  report.skippedBytes = plannedSkips.reduce((sum, decision) => sum + decision.file.bytes, 0);
  report.unsupported = plannedUnsupported.length;
  report.skippedSamples = plannedSkips
    .slice(0, SKIPPED_SAMPLE_LIMIT)
    .map((decision) => decision.file.relative);

  if (!apply) {
    return report;
  }

  if (pathExists(report.target)) {
    const targetStat = lstatSync(report.target);
    if (!targetStat.isDirectory()) {
      throw new Error(`target exists but is not a directory: ${report.target}`);
    }
    if (readdirSync(report.target).length > 0) {
      report.backup = backupFactory(report.target, now);
    }
  }

  mkdirSync(report.target, { recursive: true });
  for (const relative of directories) {
    mkdirSync(path.join(report.target, relative), { recursive: true });
  }

  for (const decision of decisions) {
    if (decision.skip) {
      continue;
    }
    if (decision.file.kind === 'unsupported') {
      continue;
    }

    mkdirSync(path.dirname(decision.destination), { recursive: true });
    if (decision.file.kind === 'symlink') {
      copySymlink(decision.file.absolute, decision.destination);
    } else {
      replaceFileDestination(decision.destination);
      copyFileSync(decision.file.absolute, decision.destination);
    }
  }

  report.status = 'applied';
  return report;
}

export function describeNotMigrated({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  const localAppData = platform === 'win32' && env.LOCALAPPDATA && env.LOCALAPPDATA.trim() !== ''
    ? env.LOCALAPPDATA
    : null;

  return [
    {
      path: localAppData
        ? path.join(localAppData, SSH_DATA_DIRECTORY_NAME)
        : `%LOCALAPPDATA%\\${SSH_DATA_DIRECTORY_NAME}`,
      reason:
        'SSH data directory keeps its published product name on purpose; the application still reads it in place, so renaming it would hide the data.',
    },
    {
      path: 'pre-rename 0.2.x product data',
      reason:
        'Owned by the standalone Data Migrator app (src/apps/data-migrator); this script only moves rename-related directories and never touches 0.2.x data.',
    },
    {
      path: 'project-local product directories outside --workspace',
      reason:
        'Workspace data is migrated only for paths passed with --workspace; the script never scans the disk for project directories.',
    },
  ];
}

/**
 * Run the migration across every root.
 *
 * The safety guards are evaluated for all roots before a single byte is written;
 * one unsafe pair aborts the whole run.
 */
export function migrate({
  roots,
  apply = false,
  force = false,
  repositoryRoot: repoRoot = null,
  platform = process.platform,
  env = process.env,
  home = homedir(),
  now = new Date(),
  backupFactory = createBackup,
}) {
  const report = {
    tool: 'migrate-opc-to-opcteam',
    mode: apply ? 'apply' : 'dry-run',
    force: Boolean(force),
    roots: [],
    totals: { copied: 0, skipped: 0, copiedBytes: 0, skippedBytes: 0 },
    notMigrated: describeNotMigrated({ platform, env, home }),
  };

  const guardErrors = [];
  for (const root of roots) {
    const guardError = validateRootGuardrails(root, { repositoryRoot: repoRoot });
    if (guardError) {
      guardErrors.push(guardError);
    }
  }

  if (guardErrors.length > 0) {
    const error = new Error('refusing to migrate: unsafe source/target combination');
    error.guardrail = true;
    error.details = guardErrors;
    throw error;
  }

  const seenTargets = new Set();
  for (const root of roots) {
    const resolvedTarget = path.resolve(root.target);
    if (seenTargets.has(resolvedTarget)) {
      continue;
    }
    seenTargets.add(resolvedTarget);

    const rootReport = migrateRoot(root, { apply, force, now, backupFactory });
    report.roots.push(rootReport);
    report.totals.copied += rootReport.copied;
    report.totals.skipped += rootReport.skipped;
    report.totals.copiedBytes += rootReport.copiedBytes;
    report.totals.skippedBytes += rootReport.skippedBytes;
  }

  return report;
}

export function formatReport(report) {
  const applied = report.mode === 'apply';
  const lines = [
    `OPC-Team rename data migration — ${applied ? 'apply' : 'dry run (no files written)'}`,
  ];

  for (const root of report.roots) {
    lines.push('');
    lines.push(`[${root.kind}] ${root.label}`);
    lines.push(`  source: ${root.source}`);
    lines.push(`  target: ${root.target}`);

    if (root.status === 'source-missing') {
      lines.push('  status: source directory does not exist — nothing to do');
      continue;
    }
    if (root.status === 'source-not-a-directory') {
      lines.push('  status: source exists but is not a directory — skipped');
      continue;
    }

    lines.push(`  files : ${root.totalFiles} (${root.totalBytes} bytes)`);
    lines.push(`  ${applied ? 'copied' : 'to copy'}: ${root.copied} (${root.copiedBytes} bytes)`);
    lines.push(`  skipped: ${root.skipped} (${root.skippedBytes} bytes)`);
    if (root.unsupported > 0) {
      lines.push(`  skipped (unsupported entry type): ${root.unsupported}`);
    }
    if (root.skippedSamples.length > 0) {
      lines.push(`  skipped examples: ${root.skippedSamples.join(', ')}`);
    }
    if (root.backup) {
      lines.push(`  backup: ${root.backup}`);
    }
  }

  lines.push('');
  lines.push(
    `Totals: ${applied ? 'copied' : 'to copy'} ${report.totals.copied}, skipped ${report.totals.skipped}, bytes ${report.totals.copiedBytes}`,
  );

  lines.push('');
  lines.push('Not migrated:');
  for (const entry of report.notMigrated) {
    lines.push(`  - ${entry.path}: ${entry.reason}`);
  }

  if (!applied) {
    lines.push('');
    lines.push('Nothing was written. Re-run with --apply to perform the copy.');
  }

  return lines.join('\n');
}

export function parseArguments(argv) {
  const options = { apply: false, force: false, json: false, help: false, workspaces: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--apply':
        options.apply = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--workspace': {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new Error('--workspace requires a path argument');
        }
        options.workspaces.push(value);
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown argument: ${argument}`);
    }
  }

  return options;
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  const roots = planMigrationRoots({ workspaces: options.workspaces });

  let report;
  try {
    report = migrate({
      roots,
      apply: options.apply,
      force: options.force,
      repositoryRoot,
    });
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        ok: false,
        mode: options.apply ? 'apply' : 'dry-run',
        error: error.message,
        details: error.details ?? [],
      }, null, 2));
    }
    console.error(`ERROR: ${error.message}`);
    for (const detail of error.details ?? []) {
      console.error(`- ${detail}`);
    }
    process.exitCode = error.guardrail ? 2 : 1;
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
    return;
  }

  console.log(formatReport(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
