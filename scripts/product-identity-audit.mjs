#!/usr/bin/env node

/**
 * Prevent the retired product identity from returning to production sources.
 *
 * The normal product is OpenBitFun-only. Legacy exceptions are restricted to
 * the exact data-directory ignore entry and the one-time migration documents,
 * migrator app/service boundary, and fixtures used for in-place upgrades.
 *
 * The retired token also survives inside two external GitHub identifiers that
 * must keep their published spelling: the committed-by attribution email and
 * the organization profile URL. Those are allowed only as whole-line matches
 * where every retired token on the line belongs to one of those identifiers; a
 * line that pairs an identifier with any other retired token still fails.
 *
 * The default product definition is the OPC-Team identity; the OpenBitFun
 * identity is retired. `activeProductIdentityIds` names the identities that may
 * still appear in sources — moving an id out of it turns every spelling of that
 * identity into a `retired-<id>-name` violation. The retired OpenBitFun spelling
 * is still present across the tree; those occurrences are recorded in
 * `scripts/product-identity-residual-baseline.json` and the audit only fails when
 * the count for a file grows past its recorded allowance. Lowering an entry is
 * how the migration ratchets forward.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');

const retiredProductToken = `${'bit'}${'fun'}`;
const shortPrefix = `${'b'}${'f'}`;
const productIdentityOwner = 'src/crates/contracts/core-types/src/product_identity.rs';
const retiredIdentityDataBoundaryFiles = new Set([
  'OPC_LEGACY_DATA_MIGRATION_IMPLEMENTATION_PLAN.md',
  'OPC_LEGACY_DATA_MIGRATION_INVENTORY.md',
  'deploy/opc-host/README.md',
  'deploy/opc-host/migrate-market-data-v1.py',
  'src/apps/relay-server/README.md',
  // The canonical identity owner reads the legacy build-time environment names
  // on purpose; they stay fixed because the build adapters and packaging scripts
  // already read them, so this file is a boundary rather than residual debt.
  productIdentityOwner,
  // HarmonyOS must keep its published bundle id and encrypted-storage names
  // for in-place upgrades. Runtime identifiers are centralized in one source;
  // the manifest and backup policy are the only declarative exceptions.
  'src/apps/mobile/harmonyos/AppScope/app.json5',
  'src/apps/mobile/harmonyos/entry/src/main/ets/services/HarmonyUpgradeIdentityContract.ets',
  'src/apps/mobile/harmonyos/entry/src/main/resources/base/profile/backup_config.json',
]);
const retiredIdentityDataBoundaryPrefixes = Object.freeze([
  'src/apps/data-migrator/',
  'src/crates/assembly/core/src/legacy_migration/',
  'src/crates/services/legacy-migration/',
  'src/crates/services/legacy-migration-adapters/',
  // Pinned legacy updater feeds reproduce the historical 0.2.x manifests
  // (download URLs and file names included) so old clients keep resolving
  // their last real release; they must not be rewritten to the new identity.
  'scripts/fixtures/legacy-update-feeds/',
]);
const noncanonicalIdentityDataBoundaryFiles = new Set([
  'OPC_LEGACY_DATA_MIGRATION_INVENTORY.md',
  'deploy/opc-host/migrate-market-data-v1.py',
]);

// Published external GitHub identifiers that embed the retired token. These are
// names GitHub owns, not product identity, so renaming them would break commit
// attribution and the repository link instead of removing a legacy product name.
const attributedExternalIdentities = Object.freeze([
  `318544290+${retiredProductToken}-ai@users.noreply.github.com`,
  `https://github.com/${retiredProductToken}-ai`,
]);

const retiredProductPatternSource = `(?<!open)${retiredProductToken}`;

/**
 * Product identities the repository knows about, keyed by stable product id.
 *
 * `pattern` must match every separator spelling of the identity so a competing
 * spelling cannot be introduced silently; `canonicalCasings` is the complete set
 * of shapes that may appear in sources. A spaced display form is deliberately
 * not matched, which keeps ordinary prose out of the rule.
 *
 * The OPC-Team identifier stem is `opcteam` without a separator: Kotlin and Java
 * package segments and Android application ids cannot contain hyphens, so a
 * hyphenated stem would force a second spelling across the mobile sources. The
 * hyphenated spelling stays available as the capitalized display and brand form.
 */
const auditedProductIdentities = Object.freeze({
  openbitfun: Object.freeze({
    label: 'OpenBitFun',
    pattern: /openbitfun/giu,
    canonicalCasings: Object.freeze(['OpenBitFun', 'openBitFun', 'openbitfun', 'OPENBITFUN']),
    allowedFiles: noncanonicalIdentityDataBoundaryFiles,
  }),
  opcteam: Object.freeze({
    label: 'OPC-Team',
    pattern: /opc[-_]?team/giu,
    canonicalCasings: Object.freeze(['OPC-Team', 'opcteam', 'OPCTeam', 'OPCTEAM', 'opcTeam', 'OpcTeam']),
  }),
});

// Identities that may still appear in sources. Move an id out of this list once
// the OPC-Team rename is complete: every spelling of a non-active identity is
// then reported as `retired-<id>-name` and must be covered by the residual
// baseline. OpenBitFun has been retired; OPC-Team is the live identity.
const activeProductIdentityIds = Object.freeze(['opcteam']);

function casingRuleFor(identityId) {
  const identity = auditedProductIdentities[identityId];
  return Object.freeze({
    id: `noncanonical-${identityId}-casing`,
    description: `non-canonical ${identity.label} casing`,
    pattern: identity.pattern,
    isViolation: (value) => !identity.canonicalCasings.includes(value),
    allowedFiles: identity.allowedFiles,
  });
}

function retiredIdentityRuleFor(identityId) {
  const identity = auditedProductIdentities[identityId];
  return Object.freeze({
    id: `retired-${identityId}-name`,
    description: `retired ${identity.label} product identity`,
    pattern: identity.pattern,
    // A line that is nothing but a published external attribution identifier may
    // keep the retired display name: the identifier is owned by GitHub, and
    // rewriting it would break commit attribution rather than remove debt.
    allowedMatch: ({ location }) => location.location === 'content'
      && isExternalAttributionOnlyLine(location.lineText),
    // A retired identity must keep the same data boundaries the live rule
    // honours: the migration documents, the migrator app/service crates, the
    // HarmonyOS upgrade contract, and the pinned legacy updater feeds all have
    // to reproduce the historical spelling verbatim.
    allowedFiles: retiredIdentityDataBoundaryFiles,
    allowedFilePrefixes: retiredIdentityDataBoundaryPrefixes,
  });
}

export function productIdentityRules(activeIdentityIds = activeProductIdentityIds) {
  return [
    ...activeIdentityIds.map(casingRuleFor),
    ...Object.keys(auditedProductIdentities)
      .filter((identityId) => !activeIdentityIds.includes(identityId))
      .map(retiredIdentityRuleFor),
  ];
}

function isExternalAttributionOnlyLine(lineText) {
  if (typeof lineText !== 'string') {
    return false;
  }

  let remaining = lineText;
  let foundIdentity = false;
  for (const identity of attributedExternalIdentities) {
    if (remaining.includes(identity)) {
      foundIdentity = true;
      remaining = remaining.split(identity).join('');
    }
  }

  if (!foundIdentity) {
    return false;
  }

  // Only the retired tokens that live inside an allowed identifier may remain.
  return !new RegExp(retiredProductPatternSource, 'iu').test(remaining);
}

const identityRules = Object.freeze([
  ...productIdentityRules(),
  Object.freeze({
    id: 'abbreviated-openbitfun-name',
    description: 'abbreviated OpenBitFun product name',
    pattern: /\bopen[\s_-]*bf\b/giu,
  }),
  Object.freeze({
    id: 'retired-product-name',
    description: 'retired product name',
    pattern: new RegExp(retiredProductPatternSource, 'giu'),
    allowedMatch: ({ location }) => {
      if (location.file === '.gitignore'
        && location.location === 'content'
        && location.lineText?.trim() === `.${retiredProductToken}/`) {
        return true;
      }
      return location.location === 'content'
        && isExternalAttributionOnlyLine(location.lineText);
    },
    allowedFiles: retiredIdentityDataBoundaryFiles,
    allowedFilePrefixes: retiredIdentityDataBoundaryPrefixes,
  }),
  Object.freeze({
    id: 'retired-css-token-prefix',
    description: 'retired CSS custom-property prefix',
    pattern: new RegExp(`--${shortPrefix}-`, 'giu'),
  }),
  Object.freeze({
    id: 'retired-dom-attribute-prefix',
    description: 'retired DOM data-attribute prefix',
    pattern: new RegExp(`data-${shortPrefix}-`, 'giu'),
  }),
  Object.freeze({
    id: 'retired-dataset-property-prefix',
    description: 'retired dataset property prefix',
    pattern: new RegExp(
      `\\bdataset\\s*(?:\\.\\s*${shortPrefix}(?=[A-Z0-9_]|\\b)|\\[\\s*['\"]${shortPrefix}(?=[A-Z0-9_-]|['\"]))`,
      'giu',
    ),
  }),
  Object.freeze({
    id: 'retired-css-layer-prefix',
    description: 'retired CSS layer prefix',
    pattern: new RegExp(`@layer\\s+${shortPrefix}(?=[.\\s,{;]|$)`, 'giu'),
  }),
  Object.freeze({
    id: 'retired-environment-prefix',
    description: 'retired environment-variable prefix',
    pattern: new RegExp(`\\b${shortPrefix.toUpperCase()}_[A-Z0-9_]+\\b`, 'gu'),
  }),
  Object.freeze({
    id: 'parallel-identity-version',
    description: 'parallel product-identity version label',
    pattern: new RegExp(
      `${'product'}[\\s_-]*${'identity'}[\\s_-]*${'v2'}|${'identity'}-${'v2'}`,
      'giu',
    ),
  }),
  Object.freeze({
    id: 'duplicate-product-identity-owner',
    description: 'product identity compile-time environment read outside the canonical owner',
    pattern: /\b(?:option_)?env!\s*\(\s*["']OPC_(?:PRODUCT_ID|DATA_NAMESPACE|HIDDEN_DATA_DIRECTORY)["']\s*\)/gu,
    allowedFiles: new Set([productIdentityOwner]),
  }),
  Object.freeze({
    id: 'pre-1.0-openbitfun-minimum-version',
    description: 'minimum OpenBitFun version earlier than 1.0.0',
    pattern: /\b(?:minOpenBitFunVersion|min_openbitfun_version)\b\s*(?::|=)\s*['"]0\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?['"]/giu,
  }),
  Object.freeze({
    id: 'pre-1.0-openbitfun-release-asset',
    description: 'OpenBitFun release asset earlier than 1.0.0',
    pattern: /\b(?:openbitfun-cli-|openbitfun[_-])0\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/giu,
  }),
]);

const textExtensions = new Set([
  '.c',
  '.bat',
  '.cjs',
  '.cmd',
  '.conf',
  '.cpp',
  '.csproj',
  '.css',
  '.desktop',
  '.diff',
  '.env',
  '.ets',
  '.fish',
  '.ftl',
  '.gradle',
  '.graphql',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsonc',
  '.json5',
  '.jsx',
  '.kt',
  '.kts',
  '.lock',
  '.md',
  '.mjs',
  '.mm',
  '.nsi',
  '.pbxproj',
  '.patch',
  '.plist',
  '.properties',
  '.proto',
  '.ps1',
  '.py',
  '.rs',
  '.scss',
  '.service',
  '.sh',
  '.sln',
  '.sql',
  '.svelte',
  '.swift',
  '.svg',
  '.timer',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.wxs',
  '.xcconfig',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
]);

const textBasenames = new Set([
  '.dockerignore',
  '.gitattributes',
  '.gitignore',
  '.gitmodules',
  'codeowners',
  'dockerfile',
  'makefile',
  'procfile',
]);

const ignoredPaths = Object.freeze([
  /(^|\/)node_modules\//,
  /(^|\/)target\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /^docs\/superpowers\//,
  /^src\/web-ui\/public\/monaco-editor\//,
  // Generated bundles and vendored assets carry their own copies of the retired
  // token but have no source of truth here to edit; they are regenerated from
  // the sources the audit already covers.
  /^src\/apps\/relay-server\/static\/assets\//,
  /^src\/mobile-web\/dist\//,
  /(^|\/)src\/web-ui\/public\/vditor\//,
  // The residual ledger enumerates retired paths by definition; auditing it
  // would make every recorded occurrence a fresh violation.
  /^scripts\/product-identity-residual-baseline\.json$/,
]);

export function normalizeRepositoryPath(file) {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function shouldAuditPath(file) {
  const normalized = normalizeRepositoryPath(file);
  return !ignoredPaths.some((pattern) => pattern.test(normalized));
}

export function shouldAuditContent(file) {
  const normalized = normalizeRepositoryPath(file);
  if (!shouldAuditPath(normalized)) {
    return false;
  }

  const basename = path.posix.basename(normalized).toLowerCase();
  return textExtensions.has(path.posix.extname(basename).toLowerCase())
    || textBasenames.has(basename)
    || basename.startsWith('dockerfile.');
}

function collectMatches(value, location) {
  const violations = [];

  for (const rule of identityRules) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of value.matchAll(pattern)) {
      if (rule.allowedMatch?.({ match: match[0], location })) {
        continue;
      }
      if (rule.allowedFiles?.has(location.file)) {
        continue;
      }
      if (rule.allowedFilePrefixes?.some((prefix) => location.file.startsWith(prefix))) {
        continue;
      }
      if (rule.isViolation && !rule.isViolation(match[0])) {
        continue;
      }
      violations.push({
        ...location,
        column: (match.index ?? 0) + 1,
        rule: rule.id,
        description: rule.description,
        match: match[0],
      });
    }
  }

  return violations;
}

export function auditFile({ file, content }) {
  const normalized = normalizeRepositoryPath(file);
  if (!shouldAuditPath(normalized)) {
    return [];
  }

  const violations = collectMatches(normalized, {
    file: normalized,
    location: 'path',
    line: null,
  });

  if (!shouldAuditContent(normalized) || content === undefined) {
    return violations;
  }

  const lines = String(content).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    violations.push(...collectMatches(line, {
      file: normalized,
      location: 'content',
      line: index + 1,
      lineText: line,
    }));
  }

  return violations;
}

export function listRepositoryFiles(root = repositoryRoot) {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  return [...new Set(output.split('\0').filter(Boolean).map(normalizeRepositoryPath))]
    .filter((file) => {
      const absolutePath = path.join(root, file);
      return existsSync(absolutePath) && statSync(absolutePath).isFile();
    })
    .sort((left, right) => left.localeCompare(right, 'en'));
}

export function auditRepository(root = repositoryRoot) {
  const files = listRepositoryFiles(root);
  const violations = [];
  let contentFilesScanned = 0;

  for (const file of files) {
    if (!shouldAuditPath(file)) {
      continue;
    }

    let content;
    if (shouldAuditContent(file)) {
      content = readFileSync(path.join(root, file), 'utf8');
      contentFilesScanned += 1;
    }
    violations.push(...auditFile({ file, content }));
  }

  return {
    filesChecked: files.length,
    contentFilesScanned,
    violations,
  };
}

function formatViolation(violation) {
  const position = violation.location === 'content'
    ? `${violation.file}:${violation.line}:${violation.column}`
    : violation.file;
  return `${position} ${violation.description} (${violation.rule})`;
}

/**
 * Residual baseline for the retired identities.
 *
 * Retiring an identity turns every one of its remaining spellings into a
 * `retired-<id>-name` violation — tens of thousands of them in a tree that is
 * mid-migration. Hard-failing on all of them would block every change, and
 * reporting nothing would hide the debt. The baseline records the exact
 * rule-by-file counts that exist today, so the audit fails when any count grows
 * (a regression) or shrinks (the baseline must be lowered with
 * `--update-baseline`, which is how the migration ratchets forward).
 *
 * Only `retired-*` rules are baselined. Every other rule — competing casings,
 * abbreviated names, pre-1.0 assets, the short prefixes — stays a hard failure,
 * so a genuine new violation can never be absorbed into the baseline.
 */
const residualBaselinePath = path.join(
  repositoryRoot,
  'scripts',
  'product-identity-residual-baseline.json',
);

// Only the whole-identity retirement rules are baselined. The short-prefix and
// `retired-product-name` rules have their own narrow data boundaries and must
// keep failing outright, so they are deliberately excluded by name.
const baselineableRuleIds = new Set(
  Object.keys(auditedProductIdentities).map((identityId) => `retired-${identityId}-name`),
);

function isBaselinedRule(ruleId) {
  return baselineableRuleIds.has(ruleId);
}

export function buildResidualBaseline(report) {
  const allowances = {};
  for (const violation of report.violations) {
    if (!isBaselinedRule(violation.rule)) {
      continue;
    }
    allowances[violation.rule] ??= {};
    allowances[violation.rule][violation.file] =
      (allowances[violation.rule][violation.file] ?? 0) + 1;
  }

  const sortedAllowances = {};
  for (const rule of Object.keys(allowances).sort()) {
    sortedAllowances[rule] = {};
    for (const file of Object.keys(allowances[rule]).sort()) {
      sortedAllowances[rule][file] = allowances[rule][file];
    }
  }

  return {
    version: 1,
    description: 'Residual retired product-identity occurrences. Lower an entry with '
      + '`node scripts/product-identity-audit.mjs --update-baseline` as occurrences are '
      + 'removed; the audit fails if any count grows or shrinks.',
    allowances: sortedAllowances,
  };
}

export function checkResidualBaseline(report, baseline) {
  const failures = [];
  if (baseline.version !== 1) {
    failures.push('scripts/product-identity-residual-baseline.json must use version 1');
  }
  const allowances = baseline.allowances;
  if (!allowances || typeof allowances !== 'object' || Array.isArray(allowances)) {
    failures.push('scripts/product-identity-residual-baseline.json must define an allowances object');
    return failures;
  }

  const actual = new Map();
  for (const violation of report.violations) {
    if (!isBaselinedRule(violation.rule)) {
      continue;
    }
    if (!actual.has(violation.rule)) {
      actual.set(violation.rule, new Map());
    }
    const perFile = actual.get(violation.rule);
    perFile.set(violation.file, (perFile.get(violation.file) ?? 0) + 1);
  }

  for (const [rule, perFile] of actual) {
    const ruleAllowance = allowances[rule];
    if (!ruleAllowance) {
      const total = [...perFile.values()].reduce((sum, count) => sum + count, 0);
      failures.push(`${rule} has ${total} occurrence(s) but is not in the residual baseline`);
      continue;
    }
    for (const [file, count] of perFile) {
      const max = ruleAllowance[file];
      if (max === undefined) {
        failures.push(`${file} has ${count} ${rule} occurrence(s), which the residual baseline does not record`);
      } else if (count > max) {
        failures.push(`${file} has ${count} ${rule} occurrence(s), the residual baseline allows ${max}`);
      }
    }
  }

  for (const [rule, perFile] of Object.entries(allowances)) {
    const actualPerFile = actual.get(rule) ?? new Map();
    for (const [file, max] of Object.entries(perFile)) {
      const count = actualPerFile.get(file) ?? 0;
      if (count < max) {
        failures.push(`${file} has ${count} ${rule} occurrence(s), below the residual baseline of ${max}; run --update-baseline to lower it`);
      }
    }
  }

  return failures;
}

function main() {
  const updateBaseline = process.argv.includes('--update-baseline');
  const report = auditRepository(repositoryRoot);

  if (updateBaseline) {
    const baseline = buildResidualBaseline(report);
    writeFileSync(residualBaselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    const residual = report.violations.filter((violation) => isBaselinedRule(violation.rule)).length;
    console.log(
      `Wrote scripts/product-identity-residual-baseline.json (${residual} residual occurrence(s) recorded).`,
    );
    return;
  }

  const failures = report.violations
    .filter((violation) => !isBaselinedRule(violation.rule))
    .map(formatViolation);

  if (!existsSync(residualBaselinePath)) {
    const residual = report.violations.filter((violation) => isBaselinedRule(violation.rule));
    if (residual.length > 0) {
      failures.push(
        `scripts/product-identity-residual-baseline.json is missing; run `
        + '`node scripts/product-identity-audit.mjs --update-baseline` to record the current residual set',
      );
    }
  } else {
    let baseline;
    try {
      baseline = JSON.parse(readFileSync(residualBaselinePath, 'utf8'));
    } catch (error) {
      failures.push(`failed to parse scripts/product-identity-residual-baseline.json: ${error.message}`);
    }
    if (baseline) {
      failures.push(...checkResidualBaseline(report, baseline));
    }
  }

  if (failures.length > 0) {
    console.error('OpenBitFun product identity audit failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  const residual = report.violations.length;
  console.log(
    `OpenBitFun product identity audit passed (${report.contentFilesScanned} text files scanned, `
    + `${report.filesChecked} repository files checked; ${residual} residual occurrence(s) within the baseline).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
