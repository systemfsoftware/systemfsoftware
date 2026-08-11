# Decision: CLI framework for the terok TypeScript port

Status: proposed · Date: 2026-08-11 · Scope: npm/apps/terok (CLI parsing only; the TUI's key handling is a separate decision)

## Decision

Use **`@effect/cli`** (the version pinned in the workspace catalog, `^0.77.0`) to parse every terok console surface.

- The command tree is built with `Command.make` / `Command.withSubcommands` (the 15 own verbs plus the 6 wired groups: `executor`, `sandbox`, `vault`, `gate`, `ssh`, `dbus`).
- The parse result is an `Effect` value; handlers are `Effect.gen` bodies. Parse failures surface as the typed `ValidationError`, not thrown text.
- Shell completion for bash, zsh and fish is generated from the same command tree by the framework's built-in `--completions <sh|bash|fish|zsh>` option; programmatic access is available via `Command.getBashCompletions` / `getFishCompletions` / `getZshCompletions` for the `completions` verb.
- Lazy verb dispatch is preserved as an entry-point gate (see "What would reverse this" and the lazy-loading note in "Candidates considered"): the entry point pre-scans `argv` for the first non-flag token and imports only the invoked verb's command module; the full tree is built only for the full-surface cases (bare invocation, `--help`/`-h`, unknown verb, shell completion). This is the same shape as the Python original's `_first_verb` / `_needs_full_own_surface` / `_load_own_commands` gate in `src/terok/cli/main.py`, which lives outside the parser there too (argparse), so the port keeps the architecture with the gate living next to `@effect/cli` rather than inside it.
- The three console entry points (`terok`, `terokctl`, `terok-tui`) are three `Command.run` bootstrap sites sharing one command-tree builder, matching the Python's `main(prog=...)` split.

## Candidates considered

|                                              | @effect/cli 0.77.0                                                                                                                                    | commander 15.0.0                                                                                                                                                                                                         | yargs 18.1.0                                                                                                          | citty 0.2.2                                                                                      | clipanion 4.0.0-rc.4                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Subcommand trees                             | yes (`withSubcommands`)                                                                                                                               | yes (`.command`)                                                                                                                                                                                                         | yes (`.command`)                                                                                                      | yes (`subCommands`)                                                                              | yes (static `paths`)                                                                                                    |
| Completion bash/zsh/fish generated from tree | yes — built-in `--completions`, all three shells                                                                                                      | **no** (verified: zero "completion" strings in 10.0.1 and 15.0.0 sources/Readme)                                                                                                                                         | bash + zsh only; **no fish** template (`build/lib/completion-templates.js`, 58 lines)                                 | **no** (zero "completion" strings in package)                                                    | **no** (zero "completion" strings in package; Yarn implements `yarn completions` in its own CLI package, not clipanion) |
| Lazy subcommand loading                      | none built in — subcommands are constructed `Command` values; a thin argv pre-parse gate in the entry point restores terok's one-verb-import behavior | process-level only: `.command(name, desc)` with no action spawns a **separate executable** (`_executeSubCommand` → `childProcess.spawn`); each verb becomes its own process, discarding the shared Effect runtime/layers | none built in — command modules are `require`d by the app at setup; no `require(`/`import(` in `build/lib/command.js` | **built in** — `SubCommandsDef = Record<string, Resolvable<CommandDef>>` with `Resolvable<T> = T | Promise<T>                                                                                                              |
| Effect-TS integration                        | first-class: parse result is `Effect`, typed `ValidationError`, renders through `@effect/platform` `Console`/`Terminal`/`FileSystem`/`Path` services  | imperative callbacks; parse happens outside Effect; argv typing via generics                                                                                                                                             | imperative builder API, mutable global, manual argv casting; ESM-only in v18                                          | data-record `CommandDef`; parse returns plain `ParsedArgs`; no service layer                     | class/decorator (`@Command.Path`) imperative style with `this.context`                                                  |
| Maintenance                                  | active — part of the effect monorepo, 0.77.0 in current use                                                                                           | active — 15.0.0 current                                                                                                                                                                                                  | active — 18.1.0 current                                                                                               | slow — 0.2.2 (Apr 2025), tiny scope, zero deps                                                   | **dormant** — npm `latest` dist-tag is `4.0.0-rc.4` (2024)                                                              |

Why the losers lost:

- **clipanion**: the `latest` dist-tag on npm points at a release candidate from 2024; there is no maintained stable line to depend on. It also has no completion generation in the shipped library and a class/decorator API that clashes with Effect's functional composition. The 15-verb surface would be re-implementing what @effect/cli already does, on a dormant base.
- **commander**: verified to ship **no shell-completion generation at all** in 10.0.1 (installed) or 15.0.0 (latest tarball) — terok needs bash, zsh and fish. Its lazy loading is process-level (each subcommand becomes a separate spawned executable), which would force every terok verb into its own process, discarding the shared Effect runtime, layer graph, and services. It is also callback-imperative, so the parse/validation/help paths would live outside Effect.
- **yargs**: has completion for bash and zsh but **no fish** template (verified in `build/lib/completion-templates.js`). No lazy command loading is built in. It is an imperative builder with mutable global state, and v18 is ESM-only — the least natural fit for an Effect-first codebase.
- **citty**: the only other candidate with genuine lazy subcommand loading built in (`Resolvable` subcommand values resolved only when matched) and a pleasant minimal API. It lost because it has **no completion generation** (verified — zero matches), so terok would hand-roll bash/zsh/fish scripts, and because parse results are plain records with no Effect or `@effect/platform` service integration. If the deciding criterion below ever reverses, citty plus hand-written completion scripts is the fallback.

## What comparable projects actually ship

Verified by reading manifests and source, not by recall:

- **In this repo, two shipped Effect CLIs already depend on `@effect/cli`**:
  - `packages/arethetypeswrong/cli/package.json` — `"@effect/cli": "catalog:"`; its `src/main.ts` boots via `Command.run({ name: 'attw', version })` and its `src/attw.handler.ts` builds the command with `Command.make` + `Options`/`Args`. The attw CLI is a port _from_ commander to `@effect/cli` (the handler comments characterize old commander behavior).
  - `packages/stryker-js/cli/package.json` — `"@effect/cli": "catalog:"`; its `src/stryker-cli.handler.ts` builds a root command with `Command.make` + `Command.withSubcommands([runCommand])` — a subcommand tree in production, with a custom `CliConfig.layer({ isCaseSensitive: true })`.
  - The workspace catalog pins `"@effect/cli": "^0.77.0"` (`pnpm-workspace.yaml`, line 21), so the version is already chosen centrally.
- **External Effect-based CLIs, verified by reading their `package.json` on GitHub**:
  - `ComposioHQ/composio`, `ts/packages/cli/package.json` — `"@effect/cli": "catalog:"` (agent CLI + ACP servers, the closest analog to terok).
  - `teableio/teable`, `packages/v2/devtools/package.json` — `"@effect/cli": "0.54.4"`.
  - `garden-co/classic-jazz`, `packages/jazz-run/package.json` — `"@effect/cli": "^0.41.2"`.
  - `nodecg/nodecg`, `package.json` — `"@effect/cli": "^0.72.1"`.
  - `mattpocock/sandcastle` and `founded-labs/react-native-reusables` `apps/cli` — `"@effect/cli"` (^0.74.0 / latest).
  - `Effect-TS/examples`, `templates/monorepo/packages/cli/package.json` — the official Effect monorepo template ships `"@effect/cli": "latest"` as its CLI package.
- No comparable project was found hand-rolling its own parser in the Effect ecosystem; the maintained, widely shipped implementation exists and is used.

## Deciding criterion

The framework must (1) generate bash, zsh **and** fish completion scripts from the same command tree that defines the verbs — no second mechanism, no hand-rolled scripts — and (2) be a first-class Effect value: parsing produces an `Effect` with typed `ValidationError` and renders through `@effect/platform` services, with proven production use in comparable Effect-based CLIs. `@effect/cli` is the only candidate of the five that satisfies both, and it is the one the repo already pins and already ships in two CLIs. The lazy-verb-import requirement is met by an entry-point argv gate (the identical shape the Python original uses around argparse), not by framework support; no candidate except citty offers framework-level lazy loading, and citty fails criterion (1) outright.

## What would reverse this

Re-open the decision (fallback: citty 0.2.2 plus hand-written completion scripts, or commander only if a newer release adds completion generation) if any of these observations is made against the real port:

- The eager command-tree construction proves to make per-verb lazy loading impossible or regressive in the bundled output — measured, e.g. as a cold `terok <own-verb>` startup that imports a large fraction of the verb modules (compare against the Python's one-module import as the baseline), and the entry-point gate cannot keep the import set to the invoked verb.
- `terok --completions zsh` / `--completions fish` output is unusable in a real shell (tested with an actual zsh/fish `compinit` load), or the built-in `--completions` option cannot be wired into the `terok completions install` verb's expected UX.

## Sources read

- `node_modules/.pnpm/@effect+cli@0.77.0_.../node_modules/@effect/cli/package.json` — version 0.77.0, exports map.
- Same package `dist/dts/Command.d.ts` — `withSubcommands`, `run`, `getBashCompletions`/`getFishCompletions`/`getZshCompletions` signatures.
- Same package `dist/cjs/internal/builtInOptions.js` — `completionsOptions = choiceWithValue("completions", [["sh","bash"],["bash","bash"],["fish","fish"],["zsh","zsh"]])`.
- Same package `dist/cjs/internal/cliApp.js` — `ShowCompletions` case renders bash/fish/zsh scripts.
- `packages/arethetypeswrong/cli/package.json` and `src/main.ts`, `src/attw.handler.ts` — in-repo `@effect/cli` CLI.
- `packages/stryker-js/cli/package.json` and `src/stryker-cli.handler.ts`, `src/main.ts` — in-repo `@effect/cli` CLI with `withSubcommands`.
- `pnpm-workspace.yaml` line 21 — catalog pin `"@effect/cli": "^0.77.0"`.
- `node_modules/.pnpm/commander@10.0.1/node_modules/commander/` — installed source; no completion support anywhere; `_executeSubCommand` child-process spawning.
- https://registry.npmjs.org/commander/-/commander-15.0.0.tgz — extracted; no "completion" match in any file including Readme.
- https://registry.npmjs.org/yargs/-/yargs-18.0.0.tgz — extracted; `build/lib/completion-templates.js` (bash + zsh only, 58 lines); `build/lib/completion.js`; `completion(cmd, desc, fn)` in `build/lib/yargs-factory.js`; no `require(`/`import(` in `build/lib/command.js`; dist-tags show 18.1.0 as `latest`.
- https://registry.npmjs.org/citty/-/citty-0.2.2.tgz — extracted; `dist/index.mjs` `resolveValue`/`_findSubCommand` (lazy `Resolvable` subcommands); `dist/index.d.mts` `SubCommandsDef`/`Resolvable`; no "completion" match.
- https://registry.npmjs.org/clipanion/-/clipanion-4.0.0-rc.4.tgz — extracted; `lib/advanced/Cli.d.ts`, `Command.d.ts`; no "completion" match; dist-tags: `latest` = `4.0.0-rc.4`.
- https://registry.npmjs.org/-/package/clipanion/dist-tags, .../commander/dist-tags, .../yargs/dist-tags, .../citty/dist-tags — `latest` versions: clipanion 4.0.0-rc.4, commander 15.0.0, yargs 18.1.0, citty 0.2.2.
- GitHub `package.json` manifests read for comparable Effect CLIs: ComposioHQ/composio `ts/packages/cli/package.json`; teableio/teable `packages/v2/devtools/package.json`; Effect-TS/examples `templates/monorepo/packages/cli/package.json`; garden-co/classic-jazz `packages/jazz-run/package.json`; nodecg/nodecg `package.json`; mattpocock/sandcastle `package.json`; founded-labs/react-native-reusables `apps/cli/package.json`.
- `/tmp/terok/src/terok/cli/main.py` — the Python original's `_OWN_VERB_MODULES` (15 verbs), `_WIRED_TREE_ROOTS` (executor, sandbox, vault, gate, ssh, dbus), `_first_verb`, `_needs_full_own_surface`, `_load_own_commands`, `terokctl_main`, argcomplete integration (bash).
