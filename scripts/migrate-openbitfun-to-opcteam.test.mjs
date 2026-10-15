import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DATA_NAMESPACE,
  HIDDEN_DATA_DIRECTORY,
  LEGACY_DATA_NAMESPACE,
  LEGACY_HIDDEN_DATA_DIRECTORY,
  describeNotMigrated,
  formatBackupTimestamp,
  migrate,
  parseArguments,
  planMigrationRoots,
  resolvePlatformBaseDirectories,
  validateRootGuardrails,
} from './migrate-openbitfun-to-opcteam.mjs';

const script = fileURLToPath(new URL('./migrate-openbitfun-to-opcteam.mjs', import.meta.url));

function snapshotTree(root) {
  const entries = {};

  const walk = (directory) => {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of children) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        entries[relative] = 'dir';
        walk(absolute);
      } else {
        entries[relative] = readFileSync(absolute).toString('base64');
      }
    }
  };

  if (existsSync(root)) {
    walk(root);
  }
  return entries;
}

function backupDirectories(target) {
  const parent = path.dirname(target);
  if (!existsSync(parent)) {
    return [];
  }
  const prefix = `${path.basename(target)}.backup-`;
  return readdirSync(parent)
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(parent, name));
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'openbitfun-rename-migration-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const appData = path.join(root, 'appdata');
  const home = path.join(root, 'home');
  const localAppData = path.join(root, 'localappdata');
  const xdgConfigHome = path.join(root, 'xdg');
  for (const directory of [appData, home, localAppData]) {
    mkdirSync(directory, { recursive: true });
  }

  const env = {
    ...process.env,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    USERPROFILE: home,
    HOME: home,
    XDG_CONFIG_HOME: xdgConfigHome,
  };

  const run = (args) => spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env,
    cwd: root,
    windowsHide: true,
  });

  const write = (base, relative, content) => {
    const file = path.join(base, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };

  return {
    root,
    env,
    run,
    write,
    appData,
    home,
    configSource: path.join(appData, LEGACY_DATA_NAMESPACE),
    configTarget: path.join(appData, DATA_NAMESPACE),
    hiddenSource: path.join(home, LEGACY_HIDDEN_DATA_DIRECTORY),
    hiddenTarget: path.join(home, HIDDEN_DATA_DIRECTORY),
  };
}

test('dry run prints a plan and leaves the filesystem untouched', (t) => {
  const fx = fixture(t);
  fx.write(fx.configSource, 'config/app.json', '{"a":1}');
  fx.write(fx.configSource, path.join('data', 'nested', 'blob.bin'), Buffer.from([0, 1, 2, 255]));
  fx.write(fx.hiddenSource, path.join('memories', 'memories.sqlite'), 'sqlite-bytes');

  const before = snapshotTree(fx.root);
  const result = fx.run([]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry run \(no files written\)/);
  assert.match(result.stdout, /to copy: 2/);
  assert.match(result.stdout, /Nothing was written/);
  assert.equal(existsSync(fx.configTarget), false);
  assert.equal(existsSync(fx.hiddenTarget), false);
  assert.deepEqual(snapshotTree(fx.root), before);

  const json = fx.run(['--json']);
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.roots[0].copied, 2);
  assert.equal(report.roots[1].copied, 1);
  assert.equal(existsSync(fx.configTarget), false);
});

test('apply copies every file byte-for-byte and keeps the source intact', (t) => {
  const fx = fixture(t);
  const payload = Buffer.from([0, 1, 2, 3, 250, 251, 252]);
  fx.write(fx.configSource, 'config/app.json', '{"a":1}');
  fx.write(fx.configSource, path.join('nested', 'deeper', 'blob.bin'), payload);
  fx.write(fx.hiddenSource, 'memories/memories.sqlite', 'sqlite-bytes');

  const sourceBefore = snapshotTree(fx.configSource);
  const result = fx.run(['--apply']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /copied: 2/);
  assert.deepEqual(readFileSync(path.join(fx.configTarget, 'config', 'app.json')), Buffer.from('{"a":1}'));
  assert.deepEqual(readFileSync(path.join(fx.configTarget, 'nested', 'deeper', 'blob.bin')), payload);
  assert.equal(readFileSync(path.join(fx.hiddenTarget, 'memories', 'memories.sqlite'), 'utf8'), 'sqlite-bytes');
  assert.deepEqual(snapshotTree(fx.configSource), sourceBefore);
  assert.deepEqual(snapshotTree(fx.configTarget), sourceBefore);
  assert.equal(backupDirectories(fx.configTarget).length, 0);
});

test('existing destination files are skipped unless --force is given', (t) => {
  const fx = fixture(t);
  fx.write(fx.configSource, 'config/app.json', 'new');
  fx.write(fx.configSource, 'config/added.json', 'added');
  fx.write(fx.configTarget, 'config/app.json', 'old');

  const skipResult = fx.run(['--apply']);
  assert.equal(skipResult.status, 0, skipResult.stderr);
  assert.match(skipResult.stdout, /skipped: 1/);
  assert.equal(readFileSync(path.join(fx.configTarget, 'config', 'app.json'), 'utf8'), 'old');
  assert.equal(readFileSync(path.join(fx.configTarget, 'config', 'added.json'), 'utf8'), 'added');
  const backups = backupDirectories(fx.configTarget);
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(path.join(backups[0], 'config', 'app.json'), 'utf8'), 'old');

  const forceResult = fx.run(['--apply', '--force']);
  assert.equal(forceResult.status, 0, forceResult.stderr);
  assert.match(forceResult.stdout, /skipped: 0/);
  assert.equal(readFileSync(path.join(fx.configTarget, 'config', 'app.json'), 'utf8'), 'new');
  assert.equal(readFileSync(path.join(fx.configTarget, 'config', 'added.json'), 'utf8'), 'added');
});

test('a non-empty destination is backed up and the backup equals the pre-run state', (t) => {
  const fx = fixture(t);
  fx.write(fx.configSource, 'config/app.json', 'new');
  fx.write(fx.configSource, 'config/added.json', 'added');
  fx.write(fx.configTarget, 'config/app.json', 'old');
  fx.write(fx.configTarget, 'config/keep.json', 'keep');

  const before = snapshotTree(fx.configTarget);
  const result = fx.run(['--apply', '--force']);

  assert.equal(result.status, 0, result.stderr);
  const backups = backupDirectories(fx.configTarget);
  assert.equal(backups.length, 1);
  assert.match(path.basename(backups[0]), new RegExp(`^${DATA_NAMESPACE}\\.backup-\\d{14}$`));
  assert.deepEqual(snapshotTree(backups[0]), before);
  assert.match(result.stdout, /backup: /);
  // The copy never deletes destination-only files.
  assert.equal(readFileSync(path.join(fx.configTarget, 'config', 'app.json'), 'utf8'), 'new');
  assert.equal(readFileSync(path.join(fx.configTarget, 'config', 'added.json'), 'utf8'), 'added');
  assert.equal(readFileSync(path.join(fx.configTarget, 'config', 'keep.json'), 'utf8'), 'keep');
});

test('a failed backup aborts before any file is copied', (t) => {
  const fx = fixture(t);
  fx.write(fx.configSource, 'config/app.json', 'new');
  fx.write(fx.configTarget, 'config/app.json', 'old');

  const before = snapshotTree(fx.configTarget);
  let thrown;
  try {
    migrate({
      roots: [{
        kind: 'config-namespace',
        label: 'config',
        source: fx.configSource,
        target: fx.configTarget,
      }],
      apply: true,
      force: true,
      repositoryRoot: null,
      backupFactory: () => {
        throw new Error('simulated backup failure');
      },
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown, 'migrate must surface a backup failure');
  assert.match(thrown.message, /simulated backup failure/);
  assert.deepEqual(snapshotTree(fx.configTarget), before);
  assert.equal(backupDirectories(fx.configTarget).length, 0);
});

test('a missing source is a safe no-op', (t) => {
  const fx = fixture(t);

  const result = fx.run(['--apply']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /source directory does not exist/);
  assert.equal(existsSync(fx.configTarget), false);
  assert.equal(existsSync(fx.hiddenTarget), false);

  const json = fx.run(['--apply', '--json']);
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.mode, 'apply');
  assert.equal(report.roots[0].status, 'source-missing');
  assert.equal(report.roots[0].copied, 0);
  assert.equal(report.totals.copied, 0);
});

test('--workspace migrates the project-local product directory', (t) => {
  const fx = fixture(t);
  const workspace = path.join(fx.root, 'workspace');
  fx.write(
    path.join(workspace, LEGACY_HIDDEN_DATA_DIRECTORY),
    path.join('config', 'hooks.json'),
    '{"hooks":[]}',
  );

  const result = fx.run(['--apply', '--workspace', workspace]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(path.join(workspace, HIDDEN_DATA_DIRECTORY, 'config', 'hooks.json'), 'utf8'),
    '{"hooks":[]}',
  );
  assert.equal(
    existsSync(path.join(workspace, LEGACY_HIDDEN_DATA_DIRECTORY, 'config', 'hooks.json')),
    true,
  );

  const json = fx.run(['--workspace', workspace, '--json']);
  const report = JSON.parse(json.stdout);
  assert.equal(report.roots.length, 3);
  assert.equal(report.roots[2].kind, 'workspace');
  assert.equal(report.roots[2].source, path.resolve(path.join(workspace, LEGACY_HIDDEN_DATA_DIRECTORY)));
  assert.equal(report.roots[2].target, path.resolve(path.join(workspace, HIDDEN_DATA_DIRECTORY)));
});

test('unsafe source/target combinations are refused before anything is written', (t) => {
  const base = mkdtempSync(path.join(tmpdir(), 'openbitfun-rename-guard-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'source');
  mkdirSync(source, { recursive: true });
  writeFileSync(path.join(source, 'file.txt'), 'payload');

  assert.match(
    validateRootGuardrails({ source, target: source }, { repositoryRoot: null }),
    /same directory/,
  );
  assert.match(
    validateRootGuardrails({ source, target: path.join(source, 'nested') }, { repositoryRoot: null }),
    /inside the source/,
  );
  assert.equal(
    validateRootGuardrails({ source, target: path.join(base, 'sibling') }, { repositoryRoot: null }),
    null,
  );
  assert.match(
    validateRootGuardrails(
      { source: path.join(base, 'other'), target: path.join(base, 'inside-repo') },
      { repositoryRoot: base },
    ),
    /inside the repository/,
  );

  let refused;
  try {
    migrate({
      roots: [{
        kind: 'workspace',
        label: 'illegal workspace',
        source,
        target: path.join(source, 'nested'),
      }],
      apply: true,
      force: true,
      repositoryRoot: null,
    });
  } catch (error) {
    refused = error;
  }

  assert.ok(refused, 'migrate must refuse a target nested in its source');
  assert.equal(refused.guardrail, true);
  assert.match(refused.message, /unsafe source\/target combination/);
  assert.match(refused.details.join('\n'), /inside the source/);
  assert.equal(existsSync(path.join(source, 'nested')), false);
  assert.deepEqual(readdirSync(source), ['file.txt']);
});

test('--json apply output is parseable and reports totals plus skipped sources', (t) => {
  const fx = fixture(t);
  fx.write(fx.configSource, 'config/app.json', '{"a":1}');

  const result = fx.run(['--apply', '--json']);
  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.mode, 'apply');
  assert.equal(report.totals.copied, 1);
  assert.equal(report.totals.copiedBytes, 7);
  assert.equal(report.roots.length, 2);
  assert.equal(report.roots[0].status, 'applied');
  assert.deepEqual(
    report.notMigrated.map((entry) => entry.path),
    [
      path.join(fx.env.LOCALAPPDATA, 'OpenBitFun'),
      'pre-rename 0.2.x product data',
      'project-local product directories outside --workspace',
    ],
  );
});

test('usage errors and --help are handled without touching the filesystem', (t) => {
  const fx = fixture(t);
  fx.write(fx.configSource, 'config/app.json', '{"a":1}');

  const help = fx.run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--apply/);
  assert.equal(existsSync(fx.configTarget), false);

  const unknown = fx.run(['--nope']);
  assert.equal(unknown.status, 1);
  const missingValue = fx.run(['--workspace']);
  assert.equal(missingValue.status, 1);
  assert.equal(existsSync(fx.configTarget), false);
});

test('root plan and platform bases follow the documented directory layouts', () => {
  const home = path.join(tmpdir(), 'identity-plan-home');
  const workspace = path.join(tmpdir(), 'identity-plan-workspace');

  assert.deepEqual(
    resolvePlatformBaseDirectories({ platform: 'win32', env: { APPDATA: path.join(home, 'Roaming') }, home }),
    { configBase: path.join(home, 'Roaming'), hiddenBase: home },
  );
  assert.deepEqual(
    resolvePlatformBaseDirectories({ platform: 'win32', env: {}, home }),
    { configBase: path.join(home, 'AppData', 'Roaming'), hiddenBase: home },
  );
  assert.deepEqual(
    resolvePlatformBaseDirectories({ platform: 'darwin', env: {}, home }),
    { configBase: path.join(home, 'Library', 'Application Support'), hiddenBase: home },
  );
  assert.deepEqual(
    resolvePlatformBaseDirectories({ platform: 'linux', env: {}, home }),
    { configBase: path.join(home, '.config'), hiddenBase: home },
  );
  assert.deepEqual(
    resolvePlatformBaseDirectories({ platform: 'linux', env: { XDG_CONFIG_HOME: path.join(home, 'xdg') }, home }),
    { configBase: path.join(home, 'xdg'), hiddenBase: home },
  );

  const roots = planMigrationRoots({
    platform: 'linux',
    env: { XDG_CONFIG_HOME: path.join(home, 'xdg') },
    home,
    workspaces: [workspace],
  });
  assert.deepEqual(roots.map((root) => root.kind), ['config-namespace', 'hidden-data', 'workspace']);
  assert.equal(roots[0].source, path.resolve(path.join(home, 'xdg', LEGACY_DATA_NAMESPACE)));
  assert.equal(roots[0].target, path.resolve(path.join(home, 'xdg', DATA_NAMESPACE)));
  assert.equal(roots[1].source, path.resolve(path.join(home, LEGACY_HIDDEN_DATA_DIRECTORY)));
  assert.equal(roots[1].target, path.resolve(path.join(home, HIDDEN_DATA_DIRECTORY)));
  assert.equal(roots[2].source, path.resolve(path.join(workspace, LEGACY_HIDDEN_DATA_DIRECTORY)));
  assert.equal(roots[2].target, path.resolve(path.join(workspace, HIDDEN_DATA_DIRECTORY)));
});

test('argument parsing and timestamp formatting stay stable', () => {
  assert.deepEqual(parseArguments([]), {
    apply: false,
    force: false,
    json: false,
    help: false,
    workspaces: [],
  });
  assert.deepEqual(
    parseArguments(['--apply', '--force', '--json', '--workspace', 'a', '--workspace', 'b']),
    { apply: true, force: true, json: true, help: false, workspaces: ['a', 'b'] },
  );
  assert.throws(() => parseArguments(['--workspace']), /requires a path argument/);
  assert.throws(() => parseArguments(['--unknown']), /unknown argument/);
  assert.equal(formatBackupTimestamp(new Date(2026, 7, 11, 9, 5, 3)), '20260811090503');
  assert.equal(
    describeNotMigrated({ platform: 'linux', env: {}, home: tmpdir() })[0].path,
    '%LOCALAPPDATA%\\OpenBitFun',
  );
});
