# dsh-openbitfun

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh)
plugin bundle that lets a dsh agent **use OPC-Team**: it bridges dsh tools to the
OPC-Team Agent SDK Host (`opc-sdk-host`), the standalone local JSON-RPC-over-stdio
entry point of the OPC-Team Agent Runtime
([protocol](../../src/crates/interfaces/sdk-host/), [app](../../src/apps/sdk-host/)).

The plugin registers one dsh tool:

| Tool | What it does |
|---|---|
| `openbitfun_run` | Runs one OPC-Team agent turn against a workspace and returns OPC-Team's final text answer. The result carries a `session_id`; passing it back continues the same OPC-Team conversation (multi-turn). |

## How it works

- The plugin spawns one `opc-sdk-host` process lazily per resolved binary and
  speaks the SDK Host protocol: `initialize`, `session/create`, `query/start`,
  `query/event` (streamed assistant text), `query/result` (terminal status),
  `query/cancel`, `session/close`, `shutdown`.
- Each dsh session is mapped to one transient OPC-Team session on first use; the
  oldest mappings are closed past `maxSessions`.
- Aborting the dsh tool call (user stop, timeout policy) cancels the OPC-Team turn.
- If the host process dies, pending calls fail with the captured stderr tail and
  the next call respawns the host.

The host binary is located per call in this order:

1. the `hostPath` patch-config option of the `openbitfun` row,
2. the `OPC_SDK_HOST` environment variable,
3. `target/debug` / `target/release` walking up from the dsh session cwd
   (a OPC-Team checkout-local build),
4. `opc-sdk-host` on `PATH`.

## Build the SDK Host

```bash
cargo build -p opc-sdk-host-app
# binary: target/debug/opc-sdk-host[.exe]
```

The SDK Host reuses the OPC-Team user config (provider/model) of the local
machine, so a configured OPC-Team installation makes `openbitfun_run` work out of the
box.

## Install into a dsh profile

```bash
dsh plugin --profile web add /absolute/path/to/extensions/dsh-openbitfun
dsh plugin --profile headless add /absolute/path/to/extensions/dsh-openbitfun
```

`dsh plugin` installs the package into the profile and, because this package
declares `dsh.bundle.patch`, appends `dsh-openbitfun` to the profile's bundle stack.
Restart the profile for the change to take effect.

Custom host binary or caps (in the profile's `cordis.patch.yml`):

```yaml
- id: openbitfun
  config:
    hostPath: '/absolute/path/to/opc-sdk-host'
    maxSessions: 8
    queryTimeoutMs: 1800000
    requestTimeoutMs: 30000
```

## Smoke test (no dsh required)

```bash
node test/smoke.mjs
```

The script boots the resolved host binary, initializes the protocol, creates a
session bound to the OPC-Team checkout root, runs one trivial query, and asserts a
completed turn with non-empty assistant text.

## Current limitations (v1)

- **Local scenario only.** The OPC-Team session workspace is the dsh session cwd
  on the same machine; remote-workspace and peer-device paths are not exercised.
- **Interactive permissions are auto-rejected** by the current SDK Host
  candidate (`AutoApproveAsk = false`), so a OPC-Team turn that needs an approval
  fails; use `openbitfun_run` for non-interactive subtasks.
- **Transient sessions.** OPC-Team sessions live only as long as the host
  connection; a dsh restart starts fresh OPC-Team conversations. Session cleanup
  removes runtime stores, snapshots, and terminal bindings only — it never
  deletes the workspace directory.
- The SDK Host protocol is OPC-Team's internal candidate (`stability:
  not_delivered`), so this bridge tracks the local OPC-Team build rather than a
  frozen external API.
