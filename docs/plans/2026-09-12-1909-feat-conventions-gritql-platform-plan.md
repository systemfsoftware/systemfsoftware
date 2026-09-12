# Conventions Platform — GritQL-First (grit engine) — Implementation Plan

## Goal Capsule

### Problem Frame

33 of 42 first-party package roots follow one convention: `tsconfig.json` carries `references: [{ "path": "./tsconfig.node.json" }]` and the sibling node project typechecks the package's config scripts. The 9 exceptions are 7 plain omissions (repair set, U4) and 2 doctrinally-exempt packages (`oxlint-plugin-recommended` — its `guard-no-behavior.mjs` forbids `tsconfig.node.json`, RC1; `toolchain/vitest-config` — zero node-side TS). The correlation is perfect; nothing re-fires when it is dropped. The original remedy — a biome GritQL plugin — died in a six-probe spike: biome 2.5.13's plugin compiler rejects `language json` outright (Appendix A). The user then ruled the product shape: the platform extends **far beyond tsconfig files**, **anyone can plug their own GritQL rules in**, and it is **GritQL-first** — rules are `.grit` files in the GritQL language the grit engine natively consumes; no proprietary rule format exists (Appendix C records the ast-grep interlude this ruling superseded).

### Objective

Repo conventions become machine-enforced through a published, composable, **GritQL-first** rule platform: `@systemfsoftware/conventions` ships a growing library of GritQL rules (first rule: every first-party `tsconfig.json` declares a node-project reference), accepts any consumer's own `.grit`/pattern files alongside the bundled library, runs offline in sandboxed environments, and is adoptable in any repo with one devDependency. This repo's JSON lint gate is the platform's first consumer: observed red with exactly 7 findings before repair, green after.

### Authority hierarchy

Session-settled user rulings (Product Contract Key Decisions) override plan KTDs; KTDs override unit approaches. Repo law binds throughout: Evaluator own-commit discipline (CONST-E9), evidence before done (CONST-E7), `pnpm check:local` green (REPO-D1).

### Success Criteria

- Enrollment observed red naming exactly the 7 packages (PR body evidence), green after repair; `pnpm check:local` exits 0 whole-run.
- Package gates green: `grit patterns test` rule suite, wrapper vitest suite, `pack:all` tarball shape, changeset lane.
- Consumer smoke: a scratch repo outside the workspace installs/links the package, adds a custom `.grit` rule via `--rules`, and observes composed findings (AE7); sandbox smoke per AE8 (offline bwrap, engine from PATH).
- PR CI watched green (`gh pr checks --watch --fail-fast`).

## Product Contract

### Key Decisions (session-settled)

- **D1 (dead).** biome GritQL plugin — falsified by the six-probe matrix (Appendix A).
- **D2.** Association = a declared `references` entry (basename-tolerant `./tsconfig.node.json`); stryker-js-typescript-checker `testResources/**` fixtures exempt; `oxlint-plugin-recommended` exempt (RC1); `toolchain/vitest-config` exempt; dprint stays sole formatter; NO selftest guard/harness (proof of fire = observed-red enrollment replayed).
- **D3.** Non-interactive evidence: wiki + web + destructive-review gates resolve open items; never walkthroughs.
- **D4.** Distribution is a product requirement: the platform must work in ANY repo; rug-resistance matters (rule data ours, engine exact-pinned, pin = freeze-not-break; building our own engine rejected — fork the MIT engine at named triggers instead).
- **D5.** Engine ownership rejected as a product-category rebuild for a rule library an existing general engine already serves.
- **D6 (supersedes the ast-grep mechanism).** **GritQL-first**: the engine is the grit CLI (Rust, MIT; repo now stewarded under the biomejs org). Rules are GritQL `.grit`/markdown pattern files — the engine's native format — so "anyone can plug their own rules in" composes consumer patterns with bundled patterns in one scan; growth beyond tsconfig/JSON is new GritQL rule files on any of the engine's target languages (json, js/ts, yaml, css, markdown, python, rust, go, sql, …), never platform changes.

### Requirements

- **R1.** `@systemfsoftware/conventions` is published and adoptable in any repo with one devDependency; its bin runs offline (no network at scan time) and works under read-only, network-isolated sandboxes (bubblewrap) per the comment-checker precedent.
- **R2.** Consumer rules load without modifying the package: `--rules <path>…` accepts directories of `.grit`/`.md` patterns or single files; bundled + consumer rules compose into one scan; findings name their owning rule ids.
- **R3.** The platform is multi-surface: rules declare their own `language`; new rules on new surfaces are new GritQL files, never platform changes (D6).
- **R4.** First bundled rule: `require_tsconfig_node_reference` — verified working on the pinned engine (spike, Appendix D).
- **R5.** This repo enrolls the platform as its JSON lint gate: `lint:json` in `check:ci` + `check:local` + precommit (explicit-file mode, empty-set tolerated, `/repos/` filter).
- **R6.** Enrollment exemptions live as wrapper `--ignore` flags with reasons in the reason ledger: `repos/**` (vendored, REPO-S3), `vendor/**`, stryker-js-typescript-checker `testResources/**` (fixtures, incl. deliberately-invalid parses), `oxlint-plugin-recommended` (RC1), `toolchain/vitest-config` (zero node-side TS).
- **R7.** The enrollment is observed red on the real tree: the evaluator commit's `pnpm lint:json` names exactly the 7 non-conforming packages, output pasted into the PR body; green after repair. A missing pattern file, unresolvable engine, engine parse error, or empty selection never reports green — a broken gate fails loud (KTD4, AE6).
- **R8.** Repairs preserve JSONC comments (fork-rationale comments in `stryker-js` and `stryker-js-vitest-runner` survive verbatim) and dprint-formatted shape (`dprint check` green on every repaired file).
- **R9.** Biome spike residue is fully removed (config, plugin dir, catalog entry, devDep, stale `commitlint.config.ts` `/biome\.json$/` matcher).
- **R10.** The REPO-W8 decision record argues the do-nothing baseline, names every alternative and why each lost, records rug triggers and the fork path (U5).

### Acceptance Examples

- **AE1.** Given a conforming first-party `tsconfig.json`, when the platform scans it, then no finding and exit 0.
- **AE2.** Given `packages/stryker-js/stryker-js-engine/tsconfig.json` (no `references`), when scanned, then exactly one finding naming the rule id and file, exit 1.
- **AE3.** Given the comment-bearing `packages/stryker-js/stryker-js/tsconfig.json`, when scanned, then the JSONC comments parse (violation found; comments never break the parse) — spike-verified.
- **AE4.** Given `references` entries using either `./tsconfig.node.json` or `tsconfig.node.json`, then no finding (basename tolerance).
- **AE5.** Given the R6 exemption set, when the full tree is scanned, then exactly 7 findings (the repair set) — spike-verified: 16 raw matches = 7 repair + 2 exempt packages + 7 fixtures; exemptions carve to 7.
- **AE6.** Given a deleted pattern file, an unresolvable engine, an engine parse error (code 300), or a zero-file selection in roots mode, when the platform runs, then it fails loud (exit 2) naming the failed resolution step or the parse-error file — never exit 0.
- **AE7.** Given a consumer repo with the package installed and a custom `.grit` rule passed via `--rules`, when `conventions scan <roots>` runs, then bundled and consumer rules both apply in one invocation, findings name their owning rule ids, and the exit code reflects the findings.
- **AE8.** Given the platform run inside a read-only, network-isolated bwrap over the repo tree with the engine on PATH, then the scan completes with identical verdicts to an unsandboxed run (telemetry/network disabled or degraded gracefully — U1 verifies and pins the mechanism).

## Planning Contract

### Key Technical Decisions

- **KTD1. **Package: `packages/conventions`, bin `conventions`, engine literal-pinned.** `@systemfsoftware/conventions` with `bin: { "conventions": "./dist/main.mjs" }`, built in the `stryker-js-cli` shape (`tsdown` `exports.bin` + `packageJson`, `dts: false`, `.mjs`, `files: ["dist", "rules"]`; CLI-B1: bin target is gitignored dist; CLI-S1: exports authored in tsdown.config.ts). Engine: `"@getgrit/cli": "0.1.0-alpha.1743007075"` — a literal exact pin in `dependencies` (launcher + version contract for consumers whose postinstall works). The package's own `tsconfig.json`/`tsconfig.node.json` are self-conforming from day one (pinned shape in U2 step 1) and stay OUT of `files`. Pack-all tarball self-check: after `pnpm pack`, assert own `tsconfig*.json` absent and `dist/` + `rules/` present.
- **KTD2. **Launcher: zero-dependency composition + verdict-mediation wrapper.** A dependency-free Node bin (only `node:` builtins) doing exactly three jobs — each load-bearing, argued:
  1. **Selection** (deterministic): recursive walk for root config files (`**/tsconfig.json` for the bundled rule's declared surface — generalizes to per-rule file patterns) under the given roots, always excluding `node_modules`, minus consumer `--ignore` globs (gitignore-style, the R6 set ships as script flags). Mode detection is explicit: any positional containing glob characters (`*`, `**`, `?`, `[`) is roots-mode (walk + filter); otherwise positionals are literal file paths (file mode; empty set tolerated for precommit). The engine respects `.gitignore` by default — wrapper-owned selection with explicit paths sidesteps ignore-variance across repos; the engine's own parse-error warnings (code 300 on stderr) are captured and turned into failures (a malformed target file must never be silently skipped — vacuous-green closure per `docs/solutions/architecture-patterns/the-vacuous-pass-gate-input-sets.md`).
  2. **Composition** (U1-verified): writes `grit.yaml` with **inline `body:` entries** (bundled patterns' bodies extracted from the package `rules/` dir + each `--rules` source file's body extracted at compose time) into a temp dir as `<tmp>/c/.grit/grit.yaml`, and spawns the engine with **cwd = that dir** — the engine's CWD-walk-up discovery loads the local config, which provably wins over any registered global config. `--grit-dir` is broken in the pinned alpha (silently ignored for pattern loading); duplicate pattern names shadow silently, so the wrapper namespaces consumer entries (`consumer_<name>`) and fails loud on collision with bundled ids. Target files pass as **absolute paths** (verified from foreign cwd). Temp-dir writability under bwrap (`--tmpfs /tmp`) is AE8's sandbox case — verified: composed dir copied into the sandbox tmpfs at runtime works.
  3. **Verdict mediation** (U1-corrected): the engine's human-mode `check` **does** exit 1 on violations and 0 clean (the earlier advisory reading was a shell pipeline artifact — `$?` captured `tail`). The wrapper still runs **one** `check --json` invocation (JSON lands on **stderr**) and derives the verdict from `results[]` (fields verified: `local_name`, `path`, `start.line/col`, `extra.severity`) — names and severities for the summary line without a second engine run — mapping: 0 = clean, 1 = findings at/above level, 2 = wrapper/engine error (engine missing, pattern file missing, empty roots selection; engine nonzero-with-zero-results is treated as engine error). Human-mode exit 1 is the belt-and-braces cross-check documented in the README. Zero-match in roots mode prints `scanned 0 files` + how to widen, exit 2.
     Engine resolution chain (named, fail-loud): PATH `grit` → `node_modules/.bin/grit` (the pinned launcher) → error naming the chain and both fixes (install engine on PATH / allow the launcher's postinstall).
- **KTD3. **First rule: GritQL absence-composite, level error — spike-verified.** The bundled pattern (engine-native `.grit`/markdown file under `rules/`):
  ```grit
  engine marzano(0.1)
  language json

  `$program` where {
    $program <: not contains `{ "path": "./tsconfig.node.json" }`,
    $program <: not contains `{ "path": "tsconfig.node.json" }`
  }
  ```
  Mechanics verified on the pinned engine: object snippets are exact-shape; pair snippets match anywhere; `contains` is deep/transitive; `$program` anchors the whole document; the two literals give basename tolerance. `level: error`; the rule ships as a markdown pattern file (`rules/*.md`: frontmatter tags/level, title, description, ```grit body) — the wrapper extracts bodies into inline `body:` entries at compose time (KTD2.2); the rule contract is pinned by the vitest-drives-engine suite (Test Strategy). `$` inside GritQL regex strings is eaten by string interpolation — avoided by design (no regex in v1 rules; literal enumeration instead).
- **KTD4. **Proof of fire: two instruments, never conflated.** The package's `grit patterns test` suite (engine-native test cases inside the pattern markdown, run against the composed grit-dir) pins the RULE's contract engine-natively; the enrollment's observed-red observation proves the GATE fires on the real tree. No side-car selftest harness ships (D2). Engine parse errors and zero-match selections are failures on both instruments (AE6).
- **KTD5. **Wiring: `lint:json` root script + precommit row + reason ledger.** Root `package.json` gains `lint:json` invoking `pnpm exec conventions scan 'packages/**/tsconfig.json'` with the R6 `--ignore` flags; `check:ci` and `check:local` each gain the `pnpm lint:json || s=1` accumulate clause beside the dprint clause. `.lintstagedrc.js`'s JSON row gains a wrapper step in explicit-file mode: staged tsconfig files, the existing `/repos/` source filter, empty-set tolerated. `AGENTS.md` gains the Evaluator row naming every `--ignore` flag and its reason (the reason ledger) and `.github/AGENTS.md` the failure-table row. No workflow edits — CI continues to run `corepack pnpm check:ci`; `gh pr checks --watch` is out-of-band verification, not a workflow change.
- **KTD6. **Repair shape: per-package include lists, not a template.** Each new `tsconfig.node.json` is `{"extends":"@systemfsoftware/tsconfig/node","include":[<that package's root config files>]}` — exact lists (U4 table; re-verified against the tree this session); the `references` entry is appended without disturbing the JSONC fork-rationale comments in `stryker-js` and `stryker-js-vitest-runner`. The node project includes root config files only — never `tests/__fixtures__` (some fixtures are deliberately malformed). The preset sets `composite: true`; `*.tsbuildinfo` is gitignored; `turbo.json` `build.inputs` includes `*.config.ts` so the node project participates in hashing.
- **KTD7. **Supply-chain posture: engine via PATH, postinstall never granted.** Verified this session: `@getgrit/cli`'s postinstall downloads the engine binary from GitHub releases (dprint-precedent class); under this repo's allow-builds deny-all the binary is missing, and the launcher's self-repair `grit install` is itself broken against the current GitHub API (null decode). Therefore this repo takes the engine binary from the nix flake devShell (the `docs/solutions/tooling-decisions/dprint-from-the-repo-flake.md` doctrine; the wrapper's PATH-first resolution already prefers it), consumers keep the npm dependency (their postinstall normally runs; where it doesn't, the README documents the PATH override and the release-tarball manual install), and no `allowBuilds` entry is added without an explicit user ruling. All three outcomes are pre-authorized for U1: composition works → ship; engine missing → devShell PATH (already the default); engine present but wrong/unresolvable → fail loud via AE6, never silently degrade.
- **KTD8. **Evaluator discipline: own commit, red recorded, doctrine row.** Commit 1 (evaluator) = package + enrollment wiring + biome residue removal (including the stale `commitlint.config.ts` `/biome\.json$/` matcher — dead reference to a deleted file; its removal rides the residue commit it belongs to) — the whole gate, nothing it judges; its local run is observed red (7 findings) and pasted into the PR body. Repairs land after, in the same PR, turning it green (CONST-E9). Governs R10.

### High-Level Technical Design

Pure-core/imperative-shell: `src/select.ts` (walk + ignore-filter: pure data-in/data-out), `src/compose.ts` (grit.yaml generation: pure), `src/scan.ts` (engine invocation + JSON verdict parse: pure transform of engine output), `src/main.ts` (thin bin: resolve engine, orchestrate, map exit codes, print). The wrapper adds no decisions beyond exit-code mapping and selection — the engine and the rule data decide everything else.

### Test Strategy

- Rule contract: vitest suite drives the **engine** over fixture files (conforming/non-conforming/JSONC/basename-tolerance as real files on disk, engine spawned with the composed config) — U1 found `grit patterns test`'s native format is rewrite-oriented: pure-match lint rules test vacuously (identical-block cases always pass) or inverted; its failure exit (1) is observable, so consumers authoring rewrite rules can still use it, but our rule contract is pinned through the engine we ship against, not the format mismatch.
- Wrapper: vitest suite on select/compose/scan cores (selection boundaries incl. `--ignore` semantics, node_modules exclusion, mode detection; composition yaml shape; verdict mapping incl. exit 1/2 paths, parse-error failure, zero-match loud) — public-behavior assertions only.
- Layer classification (choose-test-layer gate): rule contract = external engine-native instrument (its own runner, not our suite); wrapper pure cores (select/compose/scan) = composition layer, vitest, public-CLI-observable assertions only; no unit tests for the thin bin (forwarding shell); no property farms — every proposed property is reachable from the published CLI surface, so public-function testing pins it (CONST-T14); observed-red replay is a gate instrument, never a shipped test file.
- Enrollment: observed-red replay is the gate's own instrument (never a shipped harness).
- Consumer + sandbox smoke: AE7/AE8 as first-class verification rows (U5), not README prose.

### Rollout

U1 spike remainder → U2 package → U3 evaluator enrollment (observed red) → U4 repairs (green) → U5 record + PR + watch green. One PR; evaluator commit lands whole before any repair (KTD8).

Load-bearing assumptions (destructive review, **Reversal** lens — rotated from the prior generation's Substitution): **A1** composition via `file:`/auto-import never silently drops a source (name collisions error loud — U1 step 6 audits; silent-drop would be vacuous green); **A2** the engine's local check path is fully offline (no startup network hang; telemetry opt-out exists and the wrapper sets it — U1 step 3); **A3** `grit patterns test` failure is observable (exit or parseable output — U1 step 2 decides; if advisory like `check`, the test script parses). Each has a stop-and-report condition at its U1 probe.

## Implementation Units

### U1. Spike the composition, offline, and engine-delivery surfaces — **Dependencies:** none

- **Goal:** The three remaining unverified surfaces are pinned: composed grit-dir with `file:` imports of absolute paths; `grit patterns test` on the bundled pattern markdown; offline/sandbox behavior (telemetry/network, bwrap, temp-dir writability); engine binary delivered via the flake devShell.
- **Files:** `temp/` scratch (gitignored) + a devShell-only flake probe.
- **Approach:**
  1. Compose a grit-dir whose `grit.yaml` enables a bundled pattern dir plus an external consumer pattern via `file:` with absolute paths; run `grit check --json` over both; confirm both rule ids in `results[]`.
  2. Author the pattern markdown with native test cases; run `grit patterns test`; confirm pass/fail behavior is observable (exit code recorded — if the test command also exits 0 on failure, the package `test` script parses its output, decided here).
  3. Offline probe: run check with network blocked (bwrap `--unshare-net`, mirroring `nix/comment-checker-bwrap.nix`: `--tmpfs /tmp --ro-bind`); observe telemetry attempts, failure/degradation behavior, and the env/config opt-out (analytics env var or config); pin the mechanism in the wrapper (set the opt-out before invocation).
  4. DevShell: add the grit engine binary to the flake devShell (dprint-doctrine; pinned rev), confirm `command -v grit` inside the devShell and the wrapper's PATH-first chain picks it.
  5. Parse-error handling: feed the invalid `testResources` fixture through the wrapper path; confirm code-300 on stderr is captured and fails (exit 2).
  6. Collision audit: the engine auto-imports the standard library and errors on duplicate pattern names across modules — verify a consumer pattern named identically to a bundled one fails loud (engine error, wrapper surfaces it), and audit the bundled rule name against stdlib collisions.
- **Test expectation:** none — spike; evidence recorded in this plan's Appendix D addendum and the U5 record.
- **Verification:** each probe's observed output recorded; stop-and-report on any falsification (composition impossible / test format unobservable / offline impossible / devShell delivery impossible).
- **Already-verified (this session, evidence in Appendix D — do not re-run):** JSON+JSONC parsing, the rule body, exact-7 selection after exemptions, `--json` results shape, advisory exit-0 behavior of `grit check`, postinstall/self-install breakage under deny-all, standalone release-tarball binary.

### U2. Build the platform package — **Dependencies:** U1

- **Goal:** `@systemfsoftware/conventions` builds, tests green, packs clean, self-conforms.
- **Files:** `packages/conventions/package.json`, `tsdown.config.ts`, `src/{main,select,compose,scan}.ts`, `vitest` suite under `src/__tests__/`, `rules/require-tsconfig_node_reference.md` (pattern + native tests; the `.grit` body inline in frontmatter/body per engine format), `README.md`, `LICENSE`, `.attw.json`, `oxlint.config.ts`, `tsconfig.json` + `tsconfig.node.json` (self-conforming day one: `{"extends":"@systemfsoftware/tsconfig/node","include":["tsdown.config.ts","oxlint.config.ts","vitest.config.ts"]}` minus nonexistent files per actual `ls`); `pnpm-workspace.yaml` (append `packages/conventions/`); `.changeset/` (minor intent).
- **Approach:**
  1. Scaffold per KTD1; pin self-conforming tsconfigs before any logic.
  2. Implement the three pure cores + thin bin per KTD2; the `test` script runs `grit patterns test` + vitest.
  3. Land the rule from KTD3 with its native test cases.
  4. Write the consumer README: one-devDependency adoption, `--rules` composition with a worked example authored from scratch (the on-ramp: a complete `.grit` file a consumer can copy), exit-code table, engine PATH override + manual install, musl/Alpine gap (release binaries are glibc-only), engine-upgrade path (pin bump = package release through changesets).
  5. Pack gates: `pnpm pack:all` shape, `.attw.json`, workspace-map row, tarball self-check (KTD1).
- **Patterns to follow:** `packages/stryker-js/stryker-js-cli` (bin build, CLI-B1/CLI-S1); `packages/stryker-js/stryker-js-typescript-checker` (data-dir shipping via `files`).
- **Verification:** `pnpm --filter @systemfsoftware/conventions test` green (both instruments); `conventions scan packages/conventions/tsconfig.json` green (self-conforming); pack + tarball assertions pass.

### U3. Enroll the gate (Evaluator commit) — **Dependencies:** U2

- **Goal:** The platform is this repo's JSON lint gate, observed red with exactly 7 findings; biome residue gone.
- **Files:** root `package.json` (+devDep, +`lint:json`, chain clauses), `.lintstagedrc.js` (JSON row), `AGENTS.md` (Evaluator row + reason ledger), `.github/AGENTS.md` (failure table), deletions: `biome.jsonc`, `biome-plugins/`, `pnpm-workspace.yaml` biome catalog entry, root `package.json` biome devDep, `commitlint.config.ts` stale `/biome\.json$/` matcher; `pnpm-lock.yaml` regenerated.
- **Approach:**
  1. Add the workspace devDep; regenerate the lockfile (`--no-frozen-lockfile`); remove every biome artifact listed above; audit: grep all package.jsons for `biome` — zero references expected, evidence recorded.
  2. Splice `lint:json` (with the R6 ignore flags) into both chains per KTD5; add the precommit row.
  3. Add the AGENTS Evaluator row with the per-flag reason ledger and the failure-table row.
  4. Observe and record: `pnpm lint:json` red naming exactly the 7 packages (paste into the PR body); `pnpm check:local` red only through the new clause.
- **Execution note:** Evaluator commit lands whole (KTD8).
- **Verification:** step 4's observations; `git status` shows no biome residue; the ledger names every `--ignore` flag; precommit dry run on a staged `repos/` file skips vendored JSON.

### U4. Repair the seven packages (Editable commits) — **Dependencies:** U3

- **Goal:** All first-party `packages/**/tsconfig.json` conform; the gate goes green; intents ship.
- **Files (verified against the tree this session):** new `tsconfig.node.json` + `references` append in —
  | Package                                                               | Node include list                                                                       |
  | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
  | `packages/oxlint-plugin/oxlint-plugin-effect-dmmf`                    | `["tsdown.config.ts"]`                                                                  |
  | `packages/stryker-js/stryker-js`                                      | `["oxlint.config.ts","tsdown.config.ts","vitest.config.ts"]`                            |
  | `packages/stryker-js/stryker-js-engine`                               | `["oxlint.config.ts","tsdown.config.ts","vitest.config.ts","vitest.stryker.config.ts"]` |
  | `packages/stryker-js/stryker-js-html-reporter`                        | `["oxlint.config.ts","tsdown.config.ts","vitest.config.ts"]`                            |
  | `packages/stryker-js/stryker-js-instrumenter`                         | `["oxlint.config.ts","tsdown.config.ts","vitest.config.ts"]`                            |
  | `packages/stryker-js/stryker-js-typescript-checker`                   | `["oxlint.config.ts","tsdown.config.ts","vitest.config.ts"]`                            |
  | `packages/stryker-js/stryker-js-vitest-runner`                        | `["oxlint.config.ts","tsdown.config.ts","vitest.config.ts"]`                            |
  | plus `.changeset/` (`none` intents; turbo hash changes are internal). |                                                                                         |
- **Approach:** Each node file extends `@systemfsoftware/tsconfig/node` exactly; `references` appended without touching JSONC comments (KTD6). Let the changeset guard name the intent set.
- **Execution note:** After the last edit, `pnpm check:local` whole-run (REPO-D1) — the tsconfig edits re-hash turbo tasks; a cached partial run proves nothing.
- **Verification:** `pnpm lint:json` exits 0; `dprint check` exits 0 on every repaired file; `pnpm check:local` exits 0; changeset lane green naming the intents.

### U5. Record the decision and land the PR — **Dependencies:** U4

- **Goal:** The REPO-W8 record exists; red/green evidence rides the PR; CI is watched to green.
- **Files:** `docs/solutions/tooling-decisions/conventions-gritql-platform.md` (new), PR body.
- **Approach:** Record the alternatives weighed and why each lost — do-nothing baseline (two shell lines calling `grit check` directly: argued — no selection, no exemption ledger, no verdict mediation, no advisory-exit fix, no composition seam for consumers; the wrapper is contamination-class earned: PATH-first engine resolution under deny-all postinstall + exit-code mediation the engine's own local mode lacks); biome GritQL (falsified, postmortem inline); eslint-plugin-jsonc (second toolchain for one rule); JSON-Schema+CLI (bespoke runner, no growth path to code conventions); OPA/conftest, CUE, semgrep (non-npm delivery); ast-grep YAML (explored, mechanism verified — superseded by the GritQL-first ruling: one rule language the engine natively distributes and anyone can author, vs a second YAML format we'd own); upstream-wait (ships nothing); bespoke engine (product-category rebuild). Record the pin-and-PATH-override rug posture with named replacement triggers (engine stops shipping glibc binaries for current platforms; JSON parsing regresses under a re-pin; pattern-language breaking change) and the response path (fork the MIT engine at the trigger; rule files survive if the pattern language is stable — verified at each re-pin). Name the maintenance owner (this repo's platform surface; engine bumps are package releases through the changeset pipeline).
- **Verification:** the record cites every alternative by name; the PR shows red-then-green plus AE7/AE8 smoke evidence; `gh pr checks --watch --fail-fast` exits 0.

## Verification Contract

| Gate                       | Command / Evidence                                                                                                                 | Applies to |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Rule fires                 | `pnpm lint:json` — exits 0 iff every selected first-party tsconfig conforms; exits 1 naming findings; exits 2 on broken instrument | U3, U4     |
| Rule contract              | `grit patterns test` + wrapper vitest suite green in the package `test` script                                                     | U2         |
| Selection exactness        | Enrollment red names exactly the 7 packages; PR body paste                                                                         | U3         |
| Consumer composition smoke | Scratch repo outside workspace: install/link, `--rules` custom `.grit`, composed findings observed (AE7)                           | U5         |
| Sandbox smoke              | Offline bwrap run, engine from PATH, identical verdicts (AE8)                                                                      | U5         |
| Repo gates                 | `pnpm check:local` exits 0 whole-run                                                                                               | U4         |
| CI                         | `gh pr checks --watch --fail-fast` exits 0                                                                                         | U5         |
| Tarball shape              | `pnpm pack` → own `tsconfig*.json` absent, `dist/`+`rules/` present                                                                | U2         |

## Definition of Done

Global: `pnpm check:local` exits 0 after the last edit; PR opened with red-then-green evidence; all checks green; tree restartable (spike residue gone, scratch cleaned). Package: published-shape gates green, minor changeset intent, README complete incl. on-ramp and upgrade path. Records: REPO-W8 doc argues every alternative incl. do-nothing; reason ledger in AGENTS.md.

## Appendix

### A. Biome postmortem (D1)

biome 2.5.13 (latest) cannot compile `language json` GritQL plugins — six-probe matrix: the verbatim docs example fails; `language css;` compiles; bare snippets compile but target js; `biome search -l json` parses the node-form then errors ("Error executing the Grit query"; "Expected a definition" on snippets). Config discovery in worktrees needs `--config-path=.` (`.git` is a file); `biome.json` rejects `//` comments (must be `biome.jsonc`). Upstream refs: biomejs/biome#8723 (JSON GritQL, 2026-01), #2582, #7998, #6782. Postmortem insight: biome's failure was its vendored plugin compiler, not GritQL — the grit engine itself natively targets JSON (spike-verified, Appendix D).

### B. Doc-review record (carried + engine-pivot deltas)

Non-interactive review (5 personas) on the ast-grep plan generation: 2 adversarial table findings dropped as tree-verified false positives; 8 entailed obligations and the recommended decisions are folded into this generation (count reconciliation in Problem Frame; invocation recipe replaced by the verified `--json` contract; absolute path resolution in KTD2; CLI grammar + exit table in KTD2; engine-bin chain named; zero-match loud text; tarball self-check in KTD1/U2; fixtures boundary in KTD6; `--only`/`--min-severity` dropped until a second rule exists; KTD7 three pre-authorized outcomes; rug triggers + do-nothing baseline + maintenance owner in U5; commitlint matcher removal in KTD8/U3; v0.1.0 accretion honesty + on-ramp worked example in U2 README; AE7/AE8 first-class in the Verification Contract).

### C. The ast-grep interlude

The mechanism was first chosen as an ast-grep wrapper (user-directed post-biome); its JSON matching (incl. JSONC) was verified live via the harness device and its distribution studied (MIT, 7-platform optionalDeps, postinstall). The user's rulings — "anyone should be able to plug their own gritte rules in", "gritte first" — superseded it: GritQL is the rule language consumers author; the grit engine is Rust with that language native (no YAML format of our own to maintain, engine-native pattern distribution via remote modules). ast-grep remains a credible fallback recorded in the W8 alternatives table.

### D. Spike evidence (2026-09-12, pinned engine `@getgrit/cli` 0.1.0-alpha.1743007075, engine build SHA 0e04dd49)

- Pinned install under pnpm deny-all: launcher present, engine binary missing (`grit doctor`: "grit: not installed"); `grit install` self-repair fails ("error decoding response body … invalid type: null") — release tarball (`grit-x86_64-unknown-linux-gnu.tar.gz`, 24.4MB) extracted manually; binary runs standalone.
- JSON snippets: pair-level matches anywhere; object snippets exact-shape; `contains` deep/transitive; `$program` = whole document; JSONC `//` comments parse (violation matched across comment lines in `packages/stryker-js/stryker-js/tsconfig.json`).
- Verified rule body (KTD3): rx-effect (conforming) → 0; stryker-js-engine + stryker-js (non-conforming, JSONC) → 1 each.
- Full `packages/` walk (49 tsconfig.json): 16 matches = 7 repair + `oxlint-plugin-recommended` + `toolchain/vitest-config` + 7 `testResources/**` fixtures; exemptions → exactly 7. One fixture (`errors/invalid-tsconfig`) parse-errors as a code-300 warning and still matches — wrapper must treat engine parse errors as failures (AE6).
- `grit check --json`: JSON is emitted on **stderr**; violating file listed, clean files absent; `--json` mode exits 0 always, human mode exits 1 on violations / 0 clean (both verified unpiped, incl. offline under bwrap).
- U1 addendum (2026-09-12, engine from `nix/grit.nix` = store path w0ifjjml…): composition verified via cwd-anchored inline-body config (bundled + consumer rule ids both present in `results[]`, clean file absent); `--grit-dir` silently ignored for pattern loading and a registered global config (from first-run dir) shadows foreign cwds — cwd-anchoring is the mechanism; duplicate names shadow silently (wrapper namespaces); `grit patterns test` exits 1 on failure but is rewrite-oriented (pure-match rules vacuous); offline bwrap (`--unshare-net`, ro-bind tree + /nix, tmpfs /tmp, binary from the nix store): identical JSON verdict, human exits 1/0, no telemetry hang (0.08s); devShell PATH resolution verified via `nix develop`.
