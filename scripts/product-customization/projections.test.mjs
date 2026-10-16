import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { ensureProductOutputDirectory, productBuildEnvironment } from './projections.mjs';
import { resolveProductDefinition } from './resolver.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ACME = join(ROOT, 'products', 'fixtures', 'acme', 'product.jsonc');

test('CLI package output uses one deterministic bounded product directory', () => {
  const resolution = resolveProductDefinition({ rootDir: ROOT, productConfig: ACME, member: 'cli' });
  const first = ensureProductOutputDirectory(resolution);
  const second = ensureProductOutputDirectory(resolution);

  assert.equal(first, second);
  assert.ok(existsSync(first));
  assert.match(first, /target[\\/]product-assembly[\\/]/);
});

test('build environment isolates custom Cargo output without overriding the default', () => {
  const defaultResolution = resolveProductDefinition({ rootDir: ROOT, member: 'cli' });
  const customResolution = resolveProductDefinition({ rootDir: ROOT, productConfig: ACME, member: 'cli' });
  const defaultEnvironment = productBuildEnvironment(defaultResolution);
  const customEnvironment = productBuildEnvironment(customResolution);

  assert.equal(defaultEnvironment.CARGO_TARGET_DIR, undefined);
  // The default product defines the data identity while install names stay put.
  assert.equal(defaultEnvironment.OPC_PRODUCT_ID, 'opcteam');
  assert.equal(defaultEnvironment.OPC_DATA_NAMESPACE, 'opcteam');
  assert.equal(defaultEnvironment.OPC_HIDDEN_DATA_DIRECTORY, '.opcteam');
  assert.equal(defaultEnvironment.OPC_PRODUCT_BINARY_NAME, 'opc');
  assert.match(customEnvironment.CARGO_TARGET_DIR, /target[\\/]\.product-cache[\\/]/);
  assert.equal(customEnvironment.OPC_PRODUCT_ID, 'acme');
  assert.equal(customEnvironment.OPC_DATA_NAMESPACE, 'acme');
  assert.equal(customEnvironment.OPC_HIDDEN_DATA_DIRECTORY, '.acme');
  assert.equal(customEnvironment.OPC_PRODUCT_BINARY_NAME, 'acme');
  assert.equal(customEnvironment.OPC_PRODUCT_DISPLAY_NAME, 'Acme CLI');
});
