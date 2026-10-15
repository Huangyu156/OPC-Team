package com.openbitfun.mobile.core.transport

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Pins the mobile client build identity to the Rust source of truth and to
 * every place that must send it, mirroring
 * `src/web-ui/src/infrastructure/account/clientBuild.contract.test.ts`.
 *
 * Only the shared Kotlin transport and the two web clients are covered here.
 * HarmonyOS keeps its own ArkTS transport, so its half of the contract lives
 * with it, in `tools/tests/client-build-contract.test.cjs` — `shared/` is
 * platform-agnostic and `scripts/check-mobile-architecture.mjs` rule 6 keeps it
 * invisible to the platform trees, so a test here must not reach into one.
 */
class ClientBuildContractTest {
    private val repoRoot: Path = generateSequence(Path.of("").toAbsolutePath()) { it.parent }
        .first { Files.exists(it.resolve("Cargo.toml")) && Files.exists(it.resolve("package.json")) }

    private fun source(relative: String): String = Files.readString(repoRoot.resolve(relative))

    @Test
    fun protocolVersionMatchesTheRustContract() {
        val accountContract = source("src/crates/contracts/product-domains/src/account.rs")
        assertTrue(
            accountContract.contains("pub const CLIENT_PROTOCOL_VERSION: u32 = $CLIENT_PROTOCOL_VERSION;"),
            "CLIENT_PROTOCOL_VERSION must equal openbitfun_product_domains::account::CLIENT_PROTOCOL_VERSION",
        )
        val webContract = source("src/shared/relay-transport/ClientBuild.ts")
        assertTrue(
            webContract.contains("export const CLIENT_PROTOCOL_VERSION = $CLIENT_PROTOCOL_VERSION;"),
            "CLIENT_PROTOCOL_VERSION must equal the web clients' CLIENT_PROTOCOL_VERSION",
        )
    }

    @Test
    fun clientVersionIsTheWorkspaceReleaseVersion() {
        val packageVersion = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(source("package.json"))!!.groupValues[1]
        assertEquals(packageVersion, CLIENT_VERSION)
        assertTrue(Regex("^\\d+\\.\\d+\\.\\d+").containsMatchIn(CLIENT_VERSION))
        assertTrue(CLIENT_VERSION.length <= 64)
    }

    @Test
    fun kotlinTransportReportsTheBuildOnLoginAndOnEveryHandshake() {
        val transport = "src/apps/mobile/shared/core-transport/src/commonMain/kotlin/com/openbitfun/mobile/core/transport"
        val realtime = source("$transport/AccountRealtime.kt")
        assertTrue(realtime.contains("put(\"clientVersion\", CLIENT_VERSION)"))
        assertTrue(realtime.contains("put(\"clientProtocol\", CLIENT_PROTOCOL_VERSION)"))
        val client = source("$transport/CloudAccountClient.kt")
        assertTrue(client.contains("@SerialName(\"clientVersion\") val clientVersion: String"))
        assertTrue(client.contains("@SerialName(\"clientProtocol\") val clientProtocol: Int"))
        assertTrue(client.contains("CLIENT_VERSION, CLIENT_PROTOCOL_VERSION"))
    }
}
