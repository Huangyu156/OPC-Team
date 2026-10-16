const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The HarmonyOS half of the mobile client build contract.
//
// It used to run from the shared Kotlin JVM suite
// (`src/apps/mobile/shared/core-transport/src/jvmTest/.../ClientBuildContractTest.kt`),
// which then had to name this platform tree to read the ArkTS sources. `shared/`
// is platform-agnostic and `scripts/check-mobile-architecture.mjs` rule 6 keeps
// it that way, so the platform half of the contract lives with the platform:
// this host suite can read repository files, the ArkTS unit runner cannot.

function repositoryRoot() {
  let current = __dirname;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error('repository root not found');
    if (fs.existsSync(path.join(current, 'Cargo.toml')) && fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = parent;
  }
}

const repoRoot = repositoryRoot();
const services = path.join(repoRoot, 'src/apps/mobile/harmonyos/entry/src/main/ets/services');

function source(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

function protocolVersion(relative, pattern) {
  const match = pattern.exec(source(relative));
  assert.ok(match, `CLIENT_PROTOCOL_VERSION is declared in ${relative}`);
  return Number(match[1]);
}

const rustVersion = protocolVersion(
  'src/crates/contracts/product-domains/src/account.rs',
  /pub const CLIENT_PROTOCOL_VERSION: u32 = (\d+);/,
);
const kotlinVersion = protocolVersion(
  'src/apps/mobile/shared/core-transport/src/commonMain/kotlin/com/opcteam/mobile/core/transport/ClientBuild.kt',
  /public const val CLIENT_PROTOCOL_VERSION: Int = (\d+)/,
);

test('the harmonyos transport reports the build the relay gates on', () => {
  assert.equal(
    kotlinVersion,
    rustVersion,
    'the Kotlin CLIENT_PROTOCOL_VERSION must equal opc_product_domains::account::CLIENT_PROTOCOL_VERSION',
  );
  const clientBuild = fs.readFileSync(path.join(services, 'ClientBuild.ets'), 'utf8');
  assert.ok(
    clientBuild.includes(`export const CLIENT_PROTOCOL_VERSION: number = ${rustVersion};`),
    'the HarmonyOS CLIENT_PROTOCOL_VERSION must equal the Kotlin one',
  );
  // HarmonyOS reads its build string from the bundle manifest at runtime, so the
  // value is a call rather than a constant.
  const realtime = fs.readFileSync(path.join(services, 'AccountRealtime.ets'), 'utf8');
  assert.ok(realtime.includes('clientVersion: clientVersion()'));
  assert.ok(realtime.includes('clientProtocol: CLIENT_PROTOCOL_VERSION'));
  // The phone login body carries it; a watch is provisioned by the phone and
  // reports its own build on its own handshake instead.
  const client = fs.readFileSync(path.join(services, 'CloudAccountClient.ets'), 'utf8');
  assert.ok(client.includes('clientVersion: clientVersion(), clientProtocol: CLIENT_PROTOCOL_VERSION'));
});
