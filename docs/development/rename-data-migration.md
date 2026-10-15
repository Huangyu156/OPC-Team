# Rename data migration

The product rename changed the **data identity**, not only the display name:
user-level state moved from the `openbitfun` namespace and the `.openbitfun`
home directory to `opcteam` and `.opcteam`.

[`scripts/migrate-opc-to-opcteam.mjs`](../../scripts/migrate-opc-to-opcteam.mjs)
copies pre-rename data into the new locations. It is a **manual, operator-run
step**. The application never performs this migration itself.

## Why this is needed

Product identity is compiled into first-party artifacts as compile-time facts
([`product_identity.rs`](../../src/crates/contracts/core-types/src/product_identity.rs)),
and every storage path is derived from them by `PathManager`
([`path_manager.rs`](../../src/crates/assembly/core/src/infrastructure/app_paths/path_manager.rs)).

Because those values are not runtime configuration, an upgraded application
reads only the new locations. A user who upgrades in place therefore starts
against an empty profile: the old configuration, memories, agents, skills and
project data remain on disk but are invisible to the app until someone copies
them across.

The standalone Data Migrator is **not** a substitute. It migrates 0.2.x product
data into the current layout; the two jobs do not overlap.

## What is migrated

The script resolves the same directories the product resolves, per platform.

| Item | Source | Target |
| --- | --- | --- |
| User config namespace | Windows `%APPDATA%\openbitfun` | `%APPDATA%\opcteam` |
| User config namespace | macOS `~/Library/Application Support/openbitfun` | `~/Library/Application Support/opcteam` |
| User config namespace | Linux/other `${XDG_CONFIG_HOME:-~/.config}/openbitfun` | `${XDG_CONFIG_HOME:-~/.config}/opcteam` |
| Hidden data directory | `~/.openbitfun` | `~/.opcteam` |
| Project directory | `<workspace>/.openbitfun` | `<workspace>/.opcteam` |

The project directory is migrated only for paths passed with `--workspace`.
The script never scans the disk for project directories, because guessing them
would risk copying data that belongs to someone else.

## What is not migrated

| Item | Why |
| --- | --- |
| `%LOCALAPPDATA%\OpenBitFun` | The SSH data directory intentionally keeps its published name; the product still reads it in place, so renaming it would hide the data. |
| Pre-rename 0.2.x product data | Owned by the standalone Data Migrator (`src/apps/data-migrator/`). |
| Project directories that were not passed with `--workspace` | No implicit disk scan is performed. |

## Usage

Always start with the default dry run. It prints the source, target, file count
and byte count for every root and writes nothing:

```bash
node scripts/migrate-opc-to-opcteam.mjs
```

Include project directories explicitly, repeating `--workspace` as needed:

```bash
node scripts/migrate-opc-to-opcteam.mjs --workspace /path/to/project
```

Then perform the copy. **`--apply` is the only flag that writes anything:**

```bash
node scripts/migrate-opc-to-opcteam.mjs --apply
node scripts/migrate-opc-to-opcteam.mjs --apply --workspace /path/to/project
```

Close the application before `--apply`. The app holds the destination files open
(a SQLite database among them) and a running instance may rewrite them while the
copy is in progress.

### Options

| Option | Effect |
| --- | --- |
| `--apply` | Copy the data. Without this flag the script only prints a plan. |
| `--force` | Overwrite files that already exist in the destination. |
| `--workspace <path>` | Also migrate `<path>/.openbitfun` to `<path>/.opcteam`. Repeatable. |
| `--json` | Print a machine-readable JSON report instead of text. |
| `--help` | Show usage. |

### Behavior and safety

- **Dry run by default.** No destination directory is created, and no backup is
  taken, until `--apply` is passed.
- **Copy, never move.** Sources are left untouched; nothing is deleted. Remove
  the old directories manually only after the new ones have been verified.
- **Existing files are skipped** by default and counted in the report, so a
  partially migrated profile is not overwritten silently. `--force` overwrites
  them.
- **A non-empty destination is backed up first** to
  `<target>.backup-<yyyymmddHHmmss>` (with a numeric suffix if that path is
  already taken). A failed backup aborts the run before a single file is copied,
  and an existing backup is never overwritten.
- **Unsafe combinations are refused** before anything is written: a target that
  equals its source, a target nested inside its source, or a target inside the
  repository checkout.
- **A missing source is a no-op**, not an error, so the command can be run on a
  machine that only ever had one of the directories.
- Exit codes: `0` success, `1` usage error, `2` refused by a safety guard.

`--json` emits the same numbers as one object (`mode`, `roots`, `totals`,
`notMigrated`), which is useful for unattended runs and for recording what was
copied.

## Verification

```bash
node --test scripts/migrate-opc-to-opcteam.test.mjs
```

The suite covers the dry run, byte-for-byte copying, skip versus `--force`,
backup contents, a missing source, the `--workspace` mapping, refused unsafe
combinations, and JSON output. It runs entirely inside temporary directories and
never touches a real user profile.

Do not validate `--apply` against a real profile while developing the script;
build a fixture with `--workspace` and a temporary `APPDATA`/`HOME` instead.

## This is a manual step, not an in-app migration

There is no automatic, in-application upgrade path for this data, and the
application will not offer one: identity is compile-time, so a running process
cannot rewrite its own storage namespace safely while it is using it. Upgrading
users must run the command above themselves (or be told to in the release
notes). Treat the script as the supported answer to "where did my settings go
after the rename?".
