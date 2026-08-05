# oxlint-guard

A Claude Code plugin that enforces the oxlint config in two places Claude Code can't police on its own:

1. **PostToolUse** — lint every edited JS/TS file with the project's oxlint config.
2. **PreToolUse** — block edits that would weaken the oxlint config itself.

The scripts are written entirely in Deno and have zero external imports. The plugin ships no `package.json`, no `node_modules`, and no npm/JSR dependency. A `command -v deno` guard makes the plugin a no-op on machines without Deno and a hard failure with an install instruction otherwise — it never silently skips.

## Install

Add the plugin directory to your Claude Code config and install Deno (>= 2.0):

```sh
# Deno
curl -fsSL https://deno.land/install.sh | sh

# Copy the plugin to your project, or symlink:
ln -s /absolute/path/to/claude-plugins/oxlint-guard "$CLAUDE_PROJECT_DIR/claude-plugins/oxlint-guard"
```

Then merge the two hook entries from `hooks/hooks.json` into `.claude/settings.json` (or register the marketplace, once published).

## Prerequisites

Both hook scripts require **Deno >= 2.0** on `PATH` _and_ an **`oxlint` dev dependency installed locally**:

```sh
pnpm add -D oxlint          # or: npm install --save-dev oxlint / yarn add -D oxlint / bun add -d oxlint
```

The plugin never falls back to a `PATH`-resolved `oxlint` or a network fetch. A missing local binary is a **hard failure** that instructs the agent to install oxlint as a dev dependency — the same posture a security-first guard takes to avoid a hijacked binary on a developer's machine.

## How the two hooks run

The hook binary is invoked with `--allow-read --allow-run --allow-env --no-lock` and **no `--allow-net`** — the process physically cannot reach the network while it lints.

### PostToolUse — lint guard

`hooks/scripts/oxlint-guard.ts`

For every edit on a file whose extension is JS/TS-family (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`), the guard:

1. Walks up from the file's directory to find the nearest `oxlint.config.{ts,js,mjs,cjs}` / `oxlint.json` / `.oxlintrc.json`.
2. Walks up to find `node_modules/.bin/oxlint` in the project.
3. Runs `oxlint --type-aware --type-check -f unix -c <config> <file>` from the config's directory.
4. Translates the exit code into a hook decision:
   - `0` → pass (silent)
   - `1` with `"No files found to lint"` or `"path is expected to be under the root"` → pass (silent)
   - `1` with `oxlint-tsgolint` missing → retry without `--type-aware --type-check`, then exit 2 on persistent failure
   - `1` with anything else → **exit 2** with the linter output on stderr
   - No oxlint config near the file → **exit 2** with an install-instruction stderr note
   - No `node_modules/.bin/oxlint` → **exit 2** with an install-instruction stderr note

A file whose first line is a `#!/usr/bin/env -S deno run` (or any deno shebang) is routed to `deno check` (short-circuits on fail) then `deno lint` — the same exit code contract.

The guard never short-circuits on missing `oxlint-tsgolint`; the fallback path runs.

### PreToolUse — config-weakening guard

`hooks/scripts/oxlint-config-off-guard.ts`

For every edit whose `file_path` is a standard oxlint config name:

- **Patch edits** (`old_string`/`new_string`): the new string is scanned for any of these directives and blocked if any one is new:
  - `': "off"` (a per-rule `"off"` directive, mid-line)
  - `oxlint-disable` / `oxlint-disable-next-line`
  - `rules: {}` / `categories: {}` / `plugins: {}` (silent-disable shapes)
  - `removeConfig(...)`
- **Write-creates** on a `.ts/.js/...` config: must declare `defineConfig(...)`. Without it the file is a no-op rule surface and the edit is blocked.
- **Write-creates** on `oxlint.json` / `.oxlintrc.json`: must be a JSON object containing at least one of `categories` or `rules`. An empty `{}` or any rule with `"off"` is blocked.

A patch that **removes** a weakening directive is allowed (that's the constitution cleaning up). An edit on an unrecognized config extension (e.g. `oxlint.config.yaml`) is silently allowed — the matcher only knows the standard names; treat YAML configs as out of scope.

## Exit contract

| Hook              | Exit 0                                                                                                                                         | Exit 2                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| PostToolUse lint  | Edit was clean (or the lint guard skipped: non-edit tool, non-lintable file, no file on disk, no oxlint config but the user said so elsewhere) | Edit was a violation, or there was no oxlint config / oxlint binary to lint against |
| PreToolUse config | Edit was not a config-weakening change                                                                                                         | Edit would weaken the config; stderr says which directive matched                   |

Stderr is the agent's signal; stdout stays empty so passing edits add no context noise.

## Verification

The plugin has no published build artifact. Run the Verification Contract from inside `claude-plugins/oxlint-guard/`:

```sh
deno check hooks/                # type-check both scripts + the lib + tests
deno test --allow-read --allow-run --allow-env hooks/   # 40 unit tests
```

(Deno's `lint hooks/` flags the test files for importing `https://deno.land/std/...` — that's a development-time surface, not the runtime hook surface. The hook scripts themselves have **zero** external imports: only `../lib/input.ts`, a local relative.)

Hermetic guarantee: every test runs without `--allow-net` and without `PATH` lookup of `oxlint`. The `Resolver` interface in `oxlint-guard.ts` and the pure `detectConfigWeakening` in `oxlint-config-off-guard.ts` are what the tests pin.

## Files

- `hooks/lib/input.ts` — shared parsing/filtering helpers (parseHookInput, isEditTool, isLintable, isOxlintConfig).
- `hooks/scripts/oxlint-guard.ts` — PostToolUse lint runner.
- `hooks/scripts/oxlint-config-off-guard.ts` — PreToolUse config-weakening blocker.
- `hooks/hooks.json` — the hook wrapper with the hermetic `--allow-read --allow-run --allow-env` permission set.

## Why Deno

Deno is the only mainstream runtime that can run a script with a fixed, hermetic permission set (`--allow-read --allow-run --allow-env` and explicitly **no** `--allow-net`). The lint guard can therefore never accidentally fetch a "fresh" oxlint binary from npm or a registry. The script itself has zero external imports: no `npm:`, no `jsr:`, no `https://` — so the only thing the runtime can do is read the file under lint and run a locally-installed `oxlint`.

## License

This plugin is part of the [systemfsoftware](https://github.com/systemfsoftware) monorepo and inherits its license.
