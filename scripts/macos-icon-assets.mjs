import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const MACOS_ICON_DIR = join(ROOT, 'assets/brand/macos');
export const COMPOSER_ICON = join(MACOS_ICON_DIR, 'opcteam.icon');
export const ICNS_OUTPUTS = [
  'assets/brand/exports/opc-app-icon.icns',
  'src/apps/desktop/icons/opc-app-icon.icns',
  'Opc-Installer/src-tauri/icons/opc-app-icon.icns',
];

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export const MACOS_ICON_SOURCE_FILES = [
  'opcteam.icon/icon.json',
  'opcteam.icon/Assets/Mark.png',
  'legacy-canvas.json',
];

// JSON sources are hashed with LF endings so the digest does not depend on the
// checkout's autocrlf setting; binary sources are hashed byte for byte.
function macosSourceBytes(file) {
  const bytes = readFileSync(join(MACOS_ICON_DIR, file));
  if (!file.endsWith('.json')) {
    return bytes;
  }
  return Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

export function macosSourceDigest() {
  const hash = createHash('sha256');
  for (const file of MACOS_ICON_SOURCE_FILES) {
    hash.update(file).update('\0').update(macosSourceBytes(file));
  }
  return hash.digest('hex');
}

// Normal installs and non-Apple builds only copy the committed native export.
// Changing either composition requires an explicit export on a Mac.
export function readMacosFallback() {
  const manifest = JSON.parse(readFileSync(join(MACOS_ICON_DIR, 'generated.json'), 'utf8'));
  const icns = readFileSync(join(ROOT, ICNS_OUTPUTS[0]));
  if (manifest.sourceSha256 !== macosSourceDigest() || manifest.icnsSha256 !== sha256(icns)) {
    throw new Error('macOS icon export is stale. Run pnpm run generate:macos-icons on macOS and commit the generated assets.');
  }
  return icns;
}
