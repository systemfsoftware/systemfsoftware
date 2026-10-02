---
title: pnpm-guard agent plugin - Plan
type: feat
date: 2026-09-15
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
deepened: 2026-09-15
---

# pnpm-guard agent plugin - Plan

## Goal Capsule

- **Objective:** An AI agent working in a pnpm project cannot weaken that project's pnpm supply-chain security posture without a human — every route to a weaker posture the guard can see (workspace/npmrc/pnpmfile edits, pnpm CLI config commands, env/flag overrides, build-grant commands, and edits to the enforcement surface itself) is vetoed before it lands, in any repo where the plugin is installed. Routes the guard cannot see are documented boundaries, not silent gaps (Scope Boundaries).
- **Means:** a third distributable agent-plugins.org plugin, `pnpm-guard`, in the on-disk `oxlint-guard`/`git-subtrees` shape — two Deno PreToolUse hooks with a fail-closed exit contract (KTD1).
- **Authority hierarchy:** the user's request plus the confirmed scoping call-outs govern product scope; repo law binds where it applies (REPO-S3 `repos/` read-only; Evaluator surfaces land in their own commit with observed red/green; the `agent-plugins/` leaf's AGT-C1/L1/H1/D1/G1 rules); this plan's KTDs govern mechanics.
- **Stop conditions:** both hooks enforce per the exit contract with planted-violation red and benign green observed through the real `hooks.json` commands; `deno task check`/`deno task test` green in the plugin; README is public-facing and accurate; the repo wiring lands as its own commit; `pnpm check:local` passes at the root.
- **Tail ownership:** ce-work executes the units. Distribution is the repo's existing Claude marketplace channel; no npm publish.

---

## Product Contract

### Summary

`pnpm-guard` is a Claude Code / agent-plugins.org plugin that blocks agent actions weakening pnpm's install-time supply-chain protections. A PreToolUse file guard vetoes edits to `pnpm-workspace.yaml`, `.npmrc`, and `.pnpmfile.*` that weaken the security posture relative to the file's effective before-state (pnpm 11 defaults as the floor); a PreToolUse command guard vetoes Bash invocations that flip the same switches out-of-band (`pnpm config set`, `--config.*` flags, `pnpm_config_*` env prefixes, `--dangerously-allow-all-builds`, and the grant commands `pnpm approve-builds` / `pnpm add --allow-build` / `pnpm audit --fix`). Exclusion-list additions, auth-token lines, manifest-injection keys, and build-script grants are blocked outright — a human mints those by hand. The guard fails closed on edits it cannot verify and defends its own enforcement surface — including the import maps that select its parsers — against agent edits.

### Problem Frame

pnpm 11 ships real install-time supply-chain protection — release-age quarantine, build-script approval, exotic-subdep blocking, trust policy — but every knob is a line in `pnpm-workspace.yaml` or a CLI/env override, and the AI agent mid-task is exactly the actor most tempted to flip one: `minimumReleaseAge: 0` unblocks a too-fresh dependency; an `allowBuilds: true` grant unblocks a build; an exclusion entry unblocks an install. This is the same cheap-fix dynamic `oxlint-guard` closes for lint: the failing gate is edited instead of the code. CI-time policy is policy the agent has already moved past; the edit and the command are the moments to intervene. The repo already proved the class single-setting with `.claude/hooks/guard-protected-writes.ts` (own-org exclusion rule); this plugin distributes the mechanism generically. And a file-only guard would be decorative — the CLI, env, and grant-command routes flip the same switches without touching the file, so the prohibition must close transitively or not at all (`docs/solutions/architecture-patterns/a-prohibition-must-close-transitively.md`).

### Requirements

**Plugin packaging**

- R1. The plugin lives at `agent-plugins/pnpm-guard/` outside the pnpm workspace: `plugin.json` (agent-plugins.org schema 1.0.0), `hooks/hooks.json` at `agent-plugins/pnpm-guard/hooks/` — the `hooks/` subdirectory both shipped siblings use; AGT-H1 forbids only the reverse-domain namespaced directory, which nothing reads; Deno 2.x runtime; `deno.jsonc` with `nodeModulesDir: "none"` and `publish.exclude: ["**"]` (AGT-D1); no comments in shipped config files (AGT-C1); formatted by the root dprint scan (AGT-G1); shipped plugin files reference the repo with absolute URLs, only LICENSE links relatively (AGT-L1).
- R2. `hooks/hooks.json` registers two PreToolUse hooks: the file guard on the edit-tool matcher `Write|Edit|Update|MultiEdit|Create|morph_mcp_edit-file|morph_edit` (the oxlint-guard matcher), the command guard on `Bash`. Commands carry the `command -v deno || exit 1` prelude and `--config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"` (entrypoint-anchored config discovery; `hook-subprocess-drops-path` lesson), with timeouts of 30s (file) and 15s (command).

**File-edit guard**

- R3. The guard matches any file named `pnpm-workspace.yaml`, `.npmrc`, or `.pnpmfile.mjs`/`.pnpmfile.cjs` at any depth, reconstructs the whole before/after document pair per edit shape (`Write` content with on-disk old side, `Edit`/`Update` hunks, `MultiEdit` sequential hunks, morph shapes, bridge-synthesized patch pairs), and applies the policy of R4–R8 to the reconstructed pair. `.pnpmfile.*` is fail-closed on any content-bearing edit: it is install-time arbitrary code, so the human writes it (R6's grant class).
- R4. Direction-aware matrix against effective values: each side's effective value is the explicit setting if present, else the pnpm 11 default (KTD3 table). A change that leaves every guarded setting at an equal-or-stronger effective value is allowed; any weakening blocks. Keys not enumerated in the matrix are open-world (allowed) — the matrix is data, and new security keys land as rows (deferred data-edit, Scope Boundaries).
- R5. Exclusion keys invert polarity, not direction: any added entry under `minimumReleaseAgeExclude` or `trustPolicyExclude` blocks, and introducing `trustPolicyIgnoreAfter` blocks. Removals are allowed. There is no allowlist file (Key Decision 3).
- R6. Build-script trust: any transition that makes an `allowBuilds` entry effectively `true` (absent→`true`, `false`→`true`) blocks, and `dangerouslyAllowAllBuilds: true` blocks. Transitions to `false`, and `false`→absent (unreviewed-by-default), are allowed — with the documented cost that wiping an explicit deny ledger makes the next install of those packages fail loudly (`ERR_PNPM_IGNORED_BUILDS`) rather than silently: the audit trail is lost, the failure is not (KTD3 footnote).
- R7. Registry and credential integrity, in both files pnpm reads them from. `.npmrc`: setting the default `registry` to a non-npmjs URL blocks; modifying an existing `@scope:registry` line blocks; adding a new `@scope:registry` line is allowed (new-scope setup, not an override of an existing resolution); `strict-ssl=false` blocks; introducing or modifying any auth-token line blocks — `_auth`, any `//host/:_authToken` key (matched by trailing `:_authToken`), and `always-auth=true` — because a planted credential line rides every future publish to the configured registry. `pnpm-workspace.yaml`: the `registries` map and `strictSsl` get the same rules (pnpm 11's workspace home for those knobs); introducing `packageExtensions` or changing any entry blocks (it injects dependencies and fields into package manifests without a manifest edit — a dependency-add no other gate catches, since the injected dep can itself be old and trusted); introducing or modifying `patchedDependencies` blocks (a patch is a code modification path; grants are human-minted).
- R8. Fail closed: on a guarded target, an unverifiable payload shape, an oversize payload, or content that does not parse as YAML (workspace) / INI (npmrc) exits 2 with a cannot-verify message naming the remediation (re-express as Edit/Write/MultiEdit) — a skip indistinguishable from a pass enforces nothing (`comment-checker-hook-silently-bypasses-on-patch-mode-edit`).

**Command guard**

- R9. For every pnpm-family invocation in the Bash payload (`pnpm`, `pn`, `pnx`, `pnpx`, `corepack pnpm`, at any nesting the parsed AST reaches — pipelines, `&&` chains, command substitution), the guard blocks: `config set <guarded-key> <weakening-value>` and `config delete <guarded-key>` where the matrix would block the equivalent file edit; the same writes retargeted out of the project — `--location global`, or `-C <dir>` escaping the project root — on guarded keys (the agent does not write global pnpm config; humans do); `--config.<guarded-key>=<value>` in weakening direction; `--no-<guarded-key>` and `=<false>` forms; `--dangerously-allow-all-builds`; `pnpm_config_<guarded-key>` env assignments (prefix form and `export`, per the verified AST mechanics in KTD6); and the grant commands — `pnpm approve-builds <pkgs…>`, `pnpm add --allow-build=<spec>` (each name in a comma list, each repeat of the flag, and a `*`/glob value treated as grant-all), and `pnpm audit --fix` (pnpm 11 auto-adds exclusion entries for its fixes — an agent running it mints exemptions through pnpm, so it joins the human-run class). Each grant synthesizes `allowBuilds[<name>] = true` (or an exclusion append) through the matrix's single-change form.
- R10. Guarded keys match camelCase, kebab-case, and UPPER_SNAKE spellings (`minimumReleaseAge` / `minimum-release-age` / `PNPM_CONFIG_MINIMUM_RELEASE_AGE` — pnpm's canonical env form) across env names, config keys, and flags.

**Contract, hermeticity, self-defense**

- R11. Exit contract per the repo's hook doctrine (CONCEPTS.md "Hook verdict"): 0 = silent allow; 2 = block with stderr naming the setting, the observed weakening, and the remediation — for grants, "ask a human to run `pnpm approve-builds <pkg>` / edit `pnpm-workspace.yaml` by hand"; stdout stays empty. The matrix ships public in the README and the plugin source, so message specificity leaks nothing an agent could not read anyway (the repo's own hooks name their rules the same way). A missing Deno runtime surfaces through the prelude's exit 1 — loud to the human, non-blocking for the session.
- R12. Hermetic: the file guard runs with `--allow-read` only; the command guard needs no permissions beyond stdin; neither ever runs with `--allow-net`. Dependencies (`@std/yaml`, `just-bash`) resolve from Deno's registry cache; the README documents the first-run warm.
- R13. Self-defense: the file guard vetoes agent edits to the enforcement surface itself — `agent-plugins/*/src/**`, `agent-plugins/*/hooks/**`, `agent-plugins/*/plugin.json`, `agent-plugins/*/deno.jsonc`, `agent-plugins/*/deno.lock`, `.claude/hooks/**`, `.claude/settings.json`, `.claude/deno.jsonc`, `.claude/deno.lock`, and `.claude-plugin/marketplace.json` — with a message stating these are human-edited. The import maps and lockfiles are enforcement surface because they select and pin the parsers the guard trusts (KTD7): an agent that can swap `@std/yaml` for a hostile module with the same export shape programs the guard's verdicts. Marketplace-installed copies live outside the repo and are already unreachable; this closes the in-repo wiring's self-authored-guard circularity. Documentation and doctrine (`README.md`, `agent-plugins/AGENTS.md`) stay editable — they are review-gated doctrine surfaces, consistent with the repo's existing posture, and carry no execution semantics.

**Documentation and distribution**

- R14. A public-facing `README.md` documents install (marketplace and local folder), the blocked-setting matrix, the exit contract, prerequisites (Deno 2.x; pnpm 10.26+ for the `allowBuilds`-era settings, pnpm 11 defaults as baseline), the documented boundaries — obfuscated execution, generic file deletion, the TOCTOU window on the PreToolUse on-disk read (accepted; a concurrent-writer race is out of scope for a per-tool-call hook), the global-config blind spot (A7), post-11.21 settings — and the hermetic guarantee.
- R15. `.claude-plugin/marketplace.json` gains a `pnpm-guard` entry (source `./agent-plugins/pnpm-guard`).

**Repo dogfooding**

- R16. `.claude/settings.json` gains both PreToolUse entries mirroring the plugin commands with `$CLAUDE_PROJECT_DIR` paths, in their own commit, with the gate observed: a planted weakening edit/command blocked (exit 2, named setting) and a benign edit/command allowed, both through the real wired command. `.claude/hooks/guard-protected-writes.ts` is untouched — its `minimumReleaseAgeExclude` check remains as belt-and-braces redundancy (R13's self-defense now also covers the surface it lives on). The wiring edit is the last agent-made edit to `.claude/settings.json`: once active, R13 vetoes subsequent agent edits to it — intended polarity, noted in U7.
- R17. Wired-in, agent sessions in this repo become stricter than REPO-S2's own-org exclusion allowance: adding `@systemfsoftware/*` to `minimumReleaseAgeExclude` — permitted to agents today by `guard-protected-writes.ts` — is blocked by the plugin (R5). That delta is intentional (Key Decision 3: humans mint exemptions); own-org exclusions become a hand edit.

### Key Decisions

- **Both vectors guarded — file edits and commands/env/flags.** (session-settled: user-approved — chosen over a file-only guard: the CLI, env, and grant-command routes flip the same switches without touching the file, so file-only enforcement is decorative) Governs R3, R9.
- **Direction-aware weakening semantics against pnpm 11 effective defaults.** (session-settled: user-approved — chosen over blocking any change to the guarded keys: legitimate hardening — raising the release age, revoking a grant — must stay agent-reachable) Governs R4.
- **Exclusion additions blocked outright; no per-project allowlist.** (session-settled: user-approved — chosen over an allowlist file the project could configure: an agent-editable allowlist re-opens the bypass it exists to close — the exemption's author must not be its beneficiary) Governs R5, R17.

### Scope Boundaries

Out of scope by design, not omission:

- `package.json` edits — pnpm 11 reads no configuration from `package.json#pnpm` (verified this session against the migration docs and the installed 11.21.0 bundle); there is no pnpm security surface there to guard.
- Other package managers (npm, yarn, bun) and the global config (`~/.config/pnpm/config.yaml`) — outside the project the plugin can see; R9 blocks the agent's `--location global` writes, but reading or repairing a pre-weakened global config is out of scope (A7).
- `overrides` range changes — dependency management pnpm re-gates at install time (any newly resolved version must still clear `minimumReleaseAge`, `trustPolicy`, and lockfile integrity); a range-widening alone executes nothing. Documented boundary rather than a matrix row: subset-comparing semver ranges buys defense-in-depth at high false-positive cost against routine Renovate-driven override bumps.
- Generic file-deletion guarding (`rm pnpm-workspace.yaml` via Bash) and command obfuscation beyond the parsed AST (`echo … | sh`) — documented boundaries, same class as `git-subtrees`' limits; git history and CI's frozen-lockfile remain the backstop.
- `ignoreScripts` and `verifyDepsBeforeRun` — not posture-weakening knobs (the former disables more execution, not less); excluded from the matrix.
- The TOCTOU window between the guard's on-disk read and the agent's write — accepted and documented; closing it needs file locking that breaks R12's hermeticity.
- Write-capable MCP tools outside the edit-tool matcher — the matcher is a closed tool-name set (`code.claude.com/docs/en/hooks` matcher semantics; the same gap `oxlint-guard` carries); a PostToolUse posture sweeper is the deferred closure.
- Erosion of a stronger-than-default global baseline to "default" — the matrix reads project files only (A7); the README discloses that machines with hardened global config should keep the hardening in the project file.

**Deferred to Follow-Up Work:**

- A PostToolUse posture sweeper — after any tool use, re-read the guarded files on disk and compare against the last-seen posture, closing matcher gaps (A6) and the guard-absent window within one tool call.
- A CI lane running the policy core over the committed `pnpm-workspace.yaml`/`.npmrc` — the hook tasks and the CI tasks become the same tasks (`software-wiki/pages/pre-merge-agent-gates.md` A2; `udonc/pm-guard` ships a plugin-test workflow as precedent).
- A CI job running `deno task check` / `deno task test` over `agent-plugins/` (the leaf AGENTS.md verification contract is session-enforced until then).
- Matrix extension to settings introduced after pnpm 11.21 — a data edit in the policy core (KTD3 names the shape), not new mechanism.

---

## Planning Contract

### Key Technical Decisions

- KTD1 — Third plugin in the `agent-plugins/` leaf, in the on-disk shape of its siblings. `oxlint-guard` (file guard: extraction → verdict → fail-closed shell) and `git-subtrees` (Bash guard: `just-bash` AST walk → per-command validation) together already solve both halves of this problem; the leaf's AGT rules and the marketplace channel govern packaging. Rejected: a workspace package under `packages/` (turbo/tsc/vitest would fight the Deno toolchain, and the artifact must install as a folder); extending `.claude/hooks/` in-repo only (not distributable, and the user asked for an agent-plugins.org plugin); a `.pnpmfile.mjs` hook as the enforcement mechanism (pnpm's own extension point runs at install time only — it never sees the weakening edit or command, and the file is itself agent-writable code; the PreToolUse seam is the only one that vetoes before the act).
- KTD2 — Vendored payload/extraction surface, no cross-plugin imports. Plugins install as folders; consumers never see the monorepo, so `pnpm-guard` carries its own copy of the stdin/payload layer just as `git-subtrees` carries its own parsing. The duplication is the distribution contract, not drift. It is a physical copy: `oxlint-guard/src/guard-config.ts` exports only `runConfigGuard` — the ~150 lines of extraction consts (`extractPairs`, `applyHunks`, `reconstructedPair`, the per-shape extractors) are module-private and must be copied, with the morph-shape `file_edits`/`edits` discriminator named as the boundary that drifts first between the two copies. Accepted cost; both copies are inside R13's vetoed surface.
- KTD3 — Effective-value comparison with pnpm 11 defaults as the baseline. Both sides parse to _effective_ values (explicit setting, else default), so an absent key and a key at its default are the same posture and only real changes in posture block. Defaults verified this session against the pnpm 11.0 release notes and the installed 11.21.0 bundle (`minimumReleaseAge` 1440, `blockExoticSubdeps`/`strictDepBuilds`/`verifyStoreIntegrity` true, `trustPolicy` off, `trustLockfile` false — where `true` _skips_ the lockfile verification pass, i.e. is the weaker pole). Removal of an explicitly-set `minimumReleaseAge` blocks: explicitness itself carries strictness (`minimumReleaseAgeStrict` defaults true only when the age is explicitly configured), so removal reverts to the non-strict default — a weakening the numeric comparison alone would miss.

  | Guarded setting (effective)                           | pnpm 11 baseline                           | Blocks when                                                           | Allows when                     |
  | ----------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------- |
  | `minimumReleaseAge`                                   | 1440, non-strict                           | new < old effective; explicit value removed                           | new ≥ old effective             |
  | `minimumReleaseAgeStrict`                             | false; true iff age explicit               | effective true → false                                                | → true, including absent → true |
  | `minimumReleaseAgeExclude`                            | none                                       | any entry added                                                       | entries removed                 |
  | `minimumReleaseAgeIgnoreMissingTime`                  | true                                       | effective false → true                                                | → false                         |
  | `blockExoticSubdeps`                                  | true                                       | → false                                                               | → true                          |
  | `strictDepBuilds`                                     | true                                       | → false                                                               | → true                          |
  | `trustPolicy`                                         | off                                        | no-downgrade → off/absent                                             | off → no-downgrade              |
  | `trustPolicyExclude`                                  | none                                       | any entry added                                                       | entries removed                 |
  | `trustPolicyIgnoreAfter`                              | unset                                      | introduced                                                            | removed                         |
  | `trustLockfile`                                       | false (`true` skips lockfile verification) | → true                                                                | → false                         |
  | `verifyStoreIntegrity`                                | true                                       | → false                                                               | → true                          |
  | `allowBuilds` per package                             | unreviewed                                 | → `true` (absent or `false`)                                          | → `false`; `false` → absent ¹   |
  | `dangerouslyAllowAllBuilds`                           | false                                      | → `true`                                                              | any other state                 |
  | `packageExtensions` (workspace)                       | absent                                     | introduced or any entry changed                                       | entries removed                 |
  | `patchedDependencies` (workspace)                     | absent                                     | introduced or changed                                                 | removed                         |
  | `registries` / `strictSsl` (workspace)                | npmjs / true                               | non-npmjs default; existing scope entry modified; `strictSsl` → false | new scope entry added; → true   |
  | `.npmrc` `registry=`                                  | npmjs                                      | set to non-npmjs; existing scope-registry line modified               | new scope-registry line         |
  | `.npmrc` `strict-ssl`                                 | true                                       | → false                                                               | → true                          |
  | `.npmrc` `_auth`, `//host/:_authToken`, `always-auth` | absent / false                             | introduced or modified (any value)                                    | removed / → false               |
  | `.pnpmfile.mjs` / `.pnpmfile.cjs`                     | absent                                     | any content-bearing edit (fail-closed)                                | —                               |

  ¹ Wiping an explicit deny ledger (`false` → absent for many packages at once) is allowed by the row but loses the review trail; the next install of those packages then fails loudly as unreviewed (`ERR_PNPM_IGNORED_BUILDS`) — the failure is visible, the ledger is not.

  Caveat (A7): "effective" here means effective-from-the-project-file against pnpm 11 defaults, not the machine's merged config. The guard cannot see global `config.yaml` or ambient env, so the baseline it defends is the portable one — the README states this and recommends projects carry their real posture in the file the guard reads. Keys not enumerated above are open-world (R4); the matrix is data and new security keys land as rows.

- KTD4 — Exclusion entries, auth lines, injection keys, and build grants are polarity inversions, not directions. An exclusion entry, a `_auth` line, a `packageExtensions` injection, or a `true` grant is satisfiable by writing a declaration, which inverts the rule: the actor that trips the guard becomes the actor that mints the exemption (`an-escape-hatch-is-an-unfalsified-hypothesis`). No allowlist ships until a population claim is falsified by probe; the README tells the human where to edit instead. `pnpm audit --fix` is not special-cased in the matrix — it is grant-class in R9 (it auto-adds exclusion entries, a pnpm 11 behavior verified this session), so an agent running it is blocked and the human runs it when a CVE actually demands the exception.
- KTD5 — Fail closed on guarded targets, fail open elsewhere. The `comment-checker` lesson is the canon: a guard that skips what it cannot read is a guard that can be walked around, and the skip is indistinguishable from a pass. On a guarded target, unrecoverable content, oversize payloads, and unparseable YAML/INI exit 2 with the remediation; on any other target the hook is silent (exit 0). This matches `rule-admission-severity-and-accretion`'s verdict direction — indeterminable state resolves to failure — and the oxlint-guard config guard's posture, which blocks for the same reason at the same seam.
- KTD6 — Command guard reuses the `just-bash` AST walk, with verified assignment mechanics. `git-subtrees`' `visitCommands` reaches simple commands inside pipelines, `&&` chains, and command substitution. Env mechanics verified empirically against `just-bash@3.2.0`: the prefix form `pnpm_config_x=0 pnpm install` surfaces as `SimpleCommandNode.assignments[]`; the `export` form carries the assignment as a literal in `args[0]` (`name === 'export'` with empty `assignments`), so the walker reads both surfaces. The token-level fallback is demoted to future drift insurance (a just-bash upgrade changing these shapes), documented in the README if it ever fires. Obfuscated execution (`| sh`, base64 blobs) is out of the AST's reach and stays a documented boundary — the same line `git-subtrees` draws.
- KTD7 — Parse, never regex, for values. `pnpm-workspace.yaml` parses through `@std/yaml` (already proven in this repo's `scripts/` tooling), `.npmrc` through a small line-oriented INI reader (comments, `key=value`, scope keys, `//host/:key` sentinels matched on the trailing segment). The oxlint guard's regex-over-module-source scanning is a _boundary it documented as best-effort_ because module configs are code; here both formats are data with a real parser, so the guard checks resolved values exactly and inherits no best-effort caveat. Keys are normalized across camelCase/kebab-case/UPPER_SNAKE before comparison. The parsers themselves are pinned by R13's veto over `deno.jsonc`/`deno.lock` — a parser the agent could swap would invert every guarantee here.
- KTD8 — The wiring commit is separate from the plugin commit, with observed red/green. `.claude/` and the activated hook entries are Evaluator surface ("its own commit, never shared with the work it judges; gate observed red before and green after"). The plugin's own files are leaf-governed editable code; activating them in this repo's sessions is the evaluator act, so R16 lands alone and its proof is a planted violation blocked through the real wired command.
- KTD9 — Dogfood despite the strictness delta. Both sibling plugins are wired into `.claude/settings.json`; an unwired guard in the repo that builds guards is doctrine violation in spirit. The cost is R17's delta (own-org exclusions become hand edits) — accepted because it is the same rule the plugin distributes, and because `guard-protected-writes.ts` stays as the redundant inner layer. Rejected: keeping the repo unwired (unproven artifact, no dogfooding signal); wiring a config-flagged variant (an agent-reachable config switch on a guard is the escape hatch KTD4 refuses).
- KTD10 — Self-defense closes the in-repo circularity, including the resolver surface. A guard wired from `$CLAUDE_PROJECT_DIR/agent-plugins/…` is editable by the very agent it guards — the self-authored-guard circularity. Marketplace installs don't have this (the installed copy lives in Claude's cache outside the repo), but the dogfooded configuration does, and so does every hook under `.claude/`. R13's edit-veto covers the plugin's code and manifests, the hook tree, the settings file, the marketplace manifest, and — because they select and pin the parsers the guard trusts — the `deno.jsonc` import maps and `deno.lock` files of both the plugin and `.claude/`. It is deliberately a _veto with a message_, not a permission system: the human edits these files directly; the agent is told to ask.

### High-Level Technical Design

```mermaid
flowchart TB
  subgraph FileGuard["PreToolUse file guard (edit tools)"]
    A[stdin payload] --> B{target basename is pnpm-workspace.yaml,<br/>.npmrc, or .pnpmfile.*?}
    B -- no --> C{target is enforcement<br/>surface (R13)?}
    C -- no --> Z0[exit 0]
    C -- yes --> X3[exit 2: human-edited surface]
    B -- yes --> D[extract before/after pair<br/>per edit shape]
    D -- contentless --> Z0
    D -- unrecoverable / oversize --> X1[exit 2: cannot verify]
    D -- pair --> E[parse both sides to<br/>effective values]
    E -- unparseable --> X1
    E -- ok --> F{matrix: any weakening<br/>or polarity inversion?}
    F -- no --> Z0
    F -- yes --> X2[exit 2: named setting + remediation]
  end

  subgraph CmdGuard["PreToolUse command guard (Bash)"]
    M[stdin payload] --> N[parse script AST,<br/>walk every simple command]
    N --> O{pnpm-family command?}
    O -- no --> Z1[exit 0]
    O -- yes --> P{config set/delete on guarded key<br/>(incl. --location global / -C escape),<br/>--config flag, --no- key, env prefix or export,<br/>--dangerously-allow-all-builds,<br/>approve-builds / --allow-build / audit --fix?}
    P -- no --> Z1
    P -- yes --> Q{matrix blocks the<br/>implied change?}
    Q -- no --> Z1
    Q -- yes --> X4[exit 2: named setting + remediation]
  end
```

Both guards share the vendored payload layer (KTD2); the policy matrix (KTD3) is one pure decision surface consumed by both — the file guard compares effective values, the command guard applies the same matrix to each synthesized single change.

### Assumptions

- A1. The plugin name is `pnpm-guard` — distinct from the existing `pm-guard` marketplace plugin (udonc/pm-guard, a wrong-package-manager blocker with fail-open detection; complementary scope, no overlap). The README's first line disambiguates.
- A2. `@std/yaml` parses real-world `pnpm-workspace.yaml` documents, including this repo's (catalogs, comments, nested maps). Verified in U3 against an inline fixture copy of the real file; if anchors/merge keys defeat it, the fail-closed branch (R8) fires and the fixture records the boundary.
- A3. Verified against `just-bash@3.2.0`: prefix assignments (`pnpm_config_x=0 pnpm i`) surface in `SimpleCommandNode.assignments[]`; the `export` form carries them in `args[0]` when the command name is `export` (KTD6 carries the mechanics). Residual risk: a future just-bash upgrade reshaping these surfaces — the token-level fallback is drift insurance.
- A4. The matrix reflects pnpm 11.21 (verified this session against the installed bundle and the v11.0 release notes); the README states the baseline version.
- A5. The `Create` matcher entry behaves as in `oxlint-guard` (kept for parity; the repo wiring omits it, matching the existing entries' style — the open question is inherited and unchanged).
- A6. The edit-tool matcher plus `Bash` enumerates the agent's write/command surfaces: any MCP tool with file-write capability that is not in the matcher edits `pnpm-workspace.yaml` without the file guard firing (destructive review — Edge-First).
- A7. The project file is the security-relevant locus: the matrix baselines against pnpm 11 defaults, not the machine's merged effective config (global `config.yaml` + env), so a stronger-than-default global baseline can be eroded to "default" without blocking (destructive review — Edge-First).

Destructive review (lens: Edge-First; surfaced assumptions A2, A6, A7) produced the Scope Boundaries and Risks additions above and the sweeper/CI follow-ups; the remediation record lives in the session transcript, not the plan.

### Sequencing

U1 (scaffold + vendored payload layer) → U3 (policy core) → U4 ∥ U5 (the two guards, parallelizable after U3) → U6 (README + marketplace) → U7 (repo wiring, own commit per KTD8). U2 was folded away in review — its payload half lives in U1, its extraction half in U4; the gap is deliberate (U-IDs stay stable).

---

## System-Wide Impact

- **Every edit spawns one more hook; every Bash call spawns one.** The repo's sessions already run three PreToolUse hooks per edit and three per Bash call; this adds a fourth of each. Deno startup dominates (~tens of ms); the command guard's AST parse of typical commands is negligible beside it. Timeouts (30s/15s) bound the worst case, and exit 0 stays silent so passing traffic adds no context noise.
- **Agent strictness delta in this repo.** Post-wiring, agent sessions cannot add _any_ `minimumReleaseAgeExclude` entry — including the own-org entries REPO-S2 permits today via `guard-protected-writes.ts` (R17). Release workflows that relied on agent-added own-org exclusions move to hand edits. The existing hook is unchanged, so the repo's own rule keeps its enforcer; the plugin is the stricter outer layer.
- **Enforcement-surface writes become human-only in dogfooded repos.** R13's veto over the plugin's code, manifests, hook tree, settings, import maps, lockfiles, and the marketplace manifest means agent sessions in this repo can no longer edit hook code, wiring, or the resolver configuration behind them — previously convention (CONST-E9 discipline), now enforced at the seam.
- **Failure propagation.** A guard that exits 1 (internal defect, missing Deno) is non-blocking: the edit proceeds and the message surfaces to the human — the intended degradation, identical to the siblings. A guard that exits 2 on a false positive stops one edit and states its reason; the matrix is data, so a misjudged setting is a one-line fix plus test, not a redesign.
- **Distribution.** The marketplace entry makes the plugin installable by strangers; the README's matrix and boundaries are then the public contract and must not overclaim (obfuscation, file deletion, TOCTOU, and post-11.21 settings stay documented gaps).

## Risks & Dependencies

| Risk                                                                                                                               | Likelihood            | Impact                                         | Mitigation                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| False-positive blocks on legitimate YAML (anchors, multi-doc)                                                                      | Medium                | Medium — agent friction, workaround culture    | Fail-closed message names the remediation; A2 fixture proves the common shapes; matrix is data, corrections are local       |
| Agent routes around via unparsed execution (`                                                                                      | sh`) or file deletion | Low                                            | Medium — guard is advisory against a determined agent                                                                       |
| Guard silently absent (Deno missing → prelude exit 1; hook disabled; matcher gap per A6) — a weakened file reaches merge unchecked | Low                   | Medium — enforcement is a session-local fact   | README prerequisite; the deferred CI lane re-runs the same matrix; the deferred sweeper narrows the window to one tool call |
| pnpm adds/renames settings after 11.21; matrix drifts                                                                              | Medium                | Low — new settings unguarded until added       | Matrix is one data block (KTD3); README states baseline version; follow-up is a data edit                                   |
| Vendored extraction copy drifts from `oxlint-guard`'s (morph-shape discriminator first)                                            | Medium                | Low — the two guards disagree on an edge shape | KTD2 names the drift boundary; both copies are R13-vetoed; a shared scenario table is a follow-up if drift bites            |
| Hook latency accumulates across sessions                                                                                           | Low                   | Low                                            | Deno startup already paid ×3; silent-exit discipline; timeouts bounded                                                      |
| Self-defense veto blocks a legitimate agent-assisted hook change in this repo                                                      | Low                   | Low — ask the human                            | Intended polarity (KTD10); message says so                                                                                  |

Dependencies: Deno 2.x on PATH (shared with siblings); `@std/yaml` and `just-bash@3.2.0` on jsr (both already in repo use); the marketplace infrastructure already shipping two plugins.

---

## Implementation Units

### U1. Plugin scaffold and vendored payload layer

- **Goal:** Create the plugin directory with manifest, hook registration, toolchain config, and the shared stdin/payload surface both guards decode from.
- **Requirements:** R1, R2
- **Dependencies:** none
- **Files:**
  - `agent-plugins/pnpm-guard/plugin.json`
  - `agent-plugins/pnpm-guard/hooks/hooks.json`
  - `agent-plugins/pnpm-guard/deno.jsonc`
  - `agent-plugins/pnpm-guard/LICENSE`
  - `agent-plugins/pnpm-guard/src/payload.ts`
- **Approach:** `plugin.json` mirrors `oxlint-guard`'s fields (schema 1.0.0, name, version 0.1.0, description naming both guards, author, repository, MIT license, keywords `pnpm`, `supply-chain`, `claude-code`, `hooks`, `guard`). `hooks/hooks.json` uses the wrapper shape with two PreToolUse entries per R2 — commands copied structurally from the siblings: `command -v deno` prelude with the plugin-named error, `deno run --quiet --config "${CLAUDE_PLUGIN_ROOT}/deno.jsonc"` with `--allow-read` for the file guard and bare for the command guard. `deno.jsonc` pins `@std/yaml`, `just-bash`, `@std/path`; tasks `check` (`deno check src/ && deno lint src/`) and `test` (`deno test src/`); `publish.exclude: ["**"]`, `nodeModulesDir: "none"`, no name/version/exports (AGT-D1). `src/payload.ts` is the vendored copy of `oxlint-guard/src/payload.ts` (edit-tool list, capped stdin read, tolerant decode) — no standalone test file, sibling-faithful; the guards' tests exercise it. No comments in any shipped config (AGT-C1).
- **Patterns to follow:** `agent-plugins/oxlint-guard/plugin.json`, `agent-plugins/oxlint-guard/hooks/hooks.json`, `agent-plugins/oxlint-guard/deno.jsonc`, `agent-plugins/oxlint-guard/src/payload.ts`, `agent-plugins/git-subtrees/hooks/hooks.json`.
- **Test scenarios:**
  - Test expectation: none for the manifest/config files — pure static configuration; correctness is the Verification Contract's JSON-validity item plus the U4/U5 smokes. `payload.ts` is vendored proven code, exercised through the guards' suites (sibling precedent: `oxlint-guard/src/payload.ts` carries no test file).
- **Verification:** all three JSON/JSONC files parse; `deno task check` compiles `src/payload.ts`; `hooks.json` references `src/` scripts that exist after U4/U5; the leaf rules hold (hooks in the `hooks/` subdirectory, no config comments).

### U3. Policy core — the matrix as pure decisions

- **Goal:** One pure decision surface implementing the KTD3 matrix for both file formats and the single-change form the command guard feeds it.
- **Requirements:** R4, R5, R6, R7, R10
- **Dependencies:** U1
- **Files:**
  - `agent-plugins/pnpm-guard/src/policy.ts`
  - `agent-plugins/pnpm-guard/src/policy.test.ts`
- **Approach:** Pure functions over parsed documents: normalize keys across camelCase/kebab-case/UPPER_SNAKE; compute effective values (explicit ?? default) per side; diff the guarded keys and emit either the allow verdict or the block verdict naming each setting, its before/after effective values, and the remediation line. The policy parses both formats into one normalized key/value view — YAML (workspace) and INI (npmrc, with `//host/:_authToken` sentinels matched on the trailing segment) — so the matrix is format-agnostic; the single-change form (`set key to value`, used by the command guard) evaluates against the same defaults. The A2 fixture is an inline string: a redacted copy of this repo's real `pnpm-workspace.yaml` shape (catalogs, comments, exclusions) embedded in the test file — no fixtures directory, sibling-faithful.
- **Patterns to follow:** the verdict types and message discipline of `agent-plugins/oxlint-guard/src/guard-config.ts`; `@std/yaml` usage in the repo's `scripts/` tooling.
- **Execution note:** Test-first on the matrix rows — each table row in KTD3 is a scenario pair (the blocking transition and the allowed transition) before any shell wiring exists. Layer discipline (choose-test-layer): the policy core is a pure validator, so the invariant tests are properties — allow-verdict changes never weaken any guarded effective value (monotonicity), and every transition that weakens one or adds an exclusion/grant/auth line is blocked (closure) — run at a high iteration count, with the matrix rows as the named-threshold scenarios beside them.
- **Test scenarios:**
  - Every matrix row's block direction: `minimumReleaseAge` 1440→0; explicit value removed; 10080→1440; strict true→false; exclusion entry added (incl. `@systemfsoftware/*` — the plugin has no org concept); `trustPolicyIgnoreAfter` introduced; `blockExoticSubdeps`/`strictDepBuilds`/`verifyStoreIntegrity` →false; `trustPolicy` no-downgrade→off; `trustLockfile`→true; `allowBuilds` absent→`true` and `false`→`true`; `dangerouslyAllowAllBuilds`→true; `packageExtensions` introduced and entry-changed; `patchedDependencies` introduced; workspace `registries` default→non-npmjs and existing scope entry modified; workspace `strictSsl`→false; `.npmrc` `registry=`→non-npmjs; existing scope-registry line modified; `strict-ssl=false`; `_auth=` introduced; `//registry.npmjs.org/:_authToken=` introduced; `always-auth=true` introduced.
  - Every matrix row's allow direction: age 1440→10080; exclusion removed; grant revoked (`true`→`false`); `false`→absent; `trustPolicy` off→no-downgrade; `trustLockfile` true→false; new scope-registry line added; strict-ssl false→true; `_auth` removed.
  - Equal-value rewrite (same effective posture, comments added/removed) allows — the open-world rule: an unenumerated new key (e.g. a new `catalogs` entry) allows.
  - kebab-case and UPPER_SNAKE spellings (`minimum-release-age`, `MINIMUM_RELEASE_AGE`) hit the same decisions as camelCase.
  - Real-workspace fixture: an edit adding an exclusion entry to the repo's actual workspace shape blocks; an edit raising the age allows.
  - Unparseable new side yields the cannot-verify verdict, not a policy verdict.
- **Verification:** `deno task test` green; each KTD3 row covered in both directions.

### U4. File guard hook

- **Goal:** The PreToolUse shell that turns payloads + policy into exit codes for `pnpm-workspace.yaml`/`.npmrc`/`.pnpmfile.*` edits, including self-defense — with the extraction layer vendored into it.
- **Requirements:** R3, R8, R11, R12, R13
- **Dependencies:** U1, U3
- **Files:**
  - `agent-plugins/pnpm-guard/src/guard-files.ts`
  - `agent-plugins/pnpm-guard/src/guard-files.test.ts`
- **Approach:** One module after `oxlint-guard/src/guard-config.ts`'s shape: extraction (vendored from its module-private consts — Write content + on-disk old side; Edit/Update hunks applied sequentially by first-occurrence replace; MultiEdit entry hunks; morph shapes; empty collection = contentless; failed hunk application = unrecoverable; absent-on-disk old side means empty-old) above a thin shell — read stdin (capped) → decode → filter by tool name → classify target (guarded basename at any depth / enforcement-surface path per R13 / other) → extract pair → parse → policy → exit. Enforcement-surface matches resolve relative to the project root the same way `guard-protected-writes.ts` resolves writes that escape it. Block messages carry the setting name, observed transition, and remediation; the self-defense message states the surface is human-edited. Runs with `--allow-read` only.
- **Patterns to follow:** `agent-plugins/oxlint-guard/src/guard-config.ts` end-to-end (extraction cluster + shell half); `.claude/hooks/guard-protected-writes.ts` for path resolution and the refusal-message register.
- **Execution note:** Smoke-first — before any suite test, pipe fixture PreToolUse JSON into the script and assert exit codes (0/2), stderr content, empty stdout; the suite then pins the same decisions as composition tests through the exported run surface (in-process, no process spawning — the admission gate refuses spawn-in-test).
- **Test scenarios:**
  - Blocking: Edit payload weakening `minimumReleaseAge` on a fixture workspace → exit 2, stderr names the setting, stdout empty.
  - Blocking: Write creating a new `pnpm-workspace.yaml` whose content sets `minimumReleaseAge: 0` (empty old side) → exit 2.
  - Blocking: MultiEdit where only one hunk weakens among benign hunks → exit 2.
  - Blocking: Write creating `.npmrc` containing `_auth=…` or `//host/:_authToken=…` → exit 2; any content-bearing edit to `.pnpmfile.mjs` → exit 2 (fail-closed basename).
  - Blocking: edit to `agent-plugins/pnpm-guard/src/policy.ts` itself, to its `deno.jsonc`, to `.claude/settings.json`, or to `.claude-plugin/marketplace.json` (self-defense) → exit 2 with the human-edited message.
  - Allowing: benign rewrite of the workspace (comment added, new catalog entry) → exit 0, silent; edit to an unrelated file → exit 0.
  - Fail-closed: unrecoverable extraction shape on a guarded target → exit 2 cannot-verify; oversize stdin → exit 2; unparseable YAML new side → exit 2.
  - Skip: non-edit tool, malformed stdin on a non-guarded target, payload without a path → exit 0.
- **Verification:** `deno task test` plus the smoke runs through the real `hooks.json` command string with `CLAUDE_PLUGIN_ROOT` pointed at the plugin directory.

### U5. Command guard hook

- **Goal:** The PreToolUse Bash guard over pnpm-family invocations.
- **Requirements:** R9, R10, R11, R12
- **Dependencies:** U1, U3
- **Files:**
  - `agent-plugins/pnpm-guard/src/guard-commands.ts`
  - `agent-plugins/pnpm-guard/src/guard-commands.test.ts`
- **Approach:** Parse `tool_input.command` with `just-bash`; walk every simple command (the `git-subtrees` visitor reaches pipeline/`&&`/substitution nesting); match pnpm-family program names (incl. `corepack pnpm` as a two-word prefix); for each matched invocation extract: `config set/delete` key+value (plus `--location`/`-C` retargeting per R9), `--config.<key>=<value>` flags, `--no-<key>`/`--<key>=false` forms, `--dangerously-allow-all-builds`, the grant commands — `pnpm approve-builds` positionals, `pnpm add --allow-build=` (every name in a comma list, every repeat of the flag, `*`/glob values as grant-all), `pnpm audit --fix` — and `pnpm_config_*` env assignments through both verified AST surfaces (KTD6: `assignments[]` for the prefix form; `args[0]` parsed for `NAME=VALUE` when the command is `export`). Each extracted change synthesizes a single change through the U3 policy; any blocking change vetoes the whole command. No filesystem access — stdin only.
- **Patterns to follow:** `agent-plugins/git-subtrees/src/guard-git-subtree.ts` (AST walk, dynamic-word handling, payload shape, message register).
- **Execution note:** Smoke-first as in U4, with the suite as in-process composition tests through the exported run surface.
- **Test scenarios:**
  - Blocking: `pnpm config set minimumReleaseAge 0`; `pnpm config set minimum-release-age 0`; `pnpm config delete blockExoticSubdeps`; `pnpm config set strictDepBuilds false --location global`; `pnpm -C .. config set trustPolicy off`; `pnpm install --dangerously-allow-all-builds`; `pnpm i --config.strict-dep-builds=false`; `pnpm install --no-block-exotic-subdeps`; `pnpm_config_minimumReleaseAge=0 pnpm install`; `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm install` (canonical env form); `export pnpm_config_trust_policy=off && pnpm i`; standalone `export pnpm_config_block_exotic_subdeps=false` with no following pnpm command; `pnpm approve-builds esbuild`; `pnpm add --allow-build=esbuild left-pad`; `pnpm add --allow-build=esbuild,sharp left-pad` (comma list); `pnpm add --allow-build=esbuild --allow-build=sharp x` (repeats); `pnpm add --allow-build=* x` (glob = grant-all); `pnpm audit --fix`; each inside a pipeline/`&&` chain/command substitution (nesting reaches them); `corepack pnpm config set trustPolicy off`.
  - Allowing: `pnpm install --frozen-lockfile`; `pnpm test`; `pnpm audit` (read-only); `pnpm config set verifyDepsBeforeRun error` (unguarded key); `pnpm config set minimumReleaseAge 10080` (strengthening); non-pnpm commands; malformed payload.
  - Spelling parity asserted for config keys, flags, and env names across camelCase, kebab-case, and UPPER_SNAKE.
  - Dynamic words (`$(pnpm config get …)` substitutions) do not crash the walker; unresolvable dynamics fail open only for _reading_ values, never for recognizing a guarded literal.
- **Verification:** `deno task test` green; smoke runs through the real `hooks.json` command.

### U6. README and marketplace entry

- **Goal:** Public-facing documentation and distribution registration.
- **Requirements:** R14, R15
- **Dependencies:** U4, U5
- **Files:**
  - `agent-plugins/pnpm-guard/README.md`
  - `.claude-plugin/marketplace.json` (add entry)
- **Approach:** README after the siblings' structure: one-line value claim (disambiguating from `pm-guard`), the problem (agent-weakens-supply-chain), install (marketplace add + install; local folder fallback), the blocked-setting matrix rendered as a table, the command/env/flag coverage, the exit contract table (allow/block/cannot-verify/deno-missing), prerequisites (Deno 2.x; pnpm baseline), boundaries (obfuscated execution, file deletion, TOCTOU window, global-config blind spot, post-11.21 settings, overrides stance, vendored-copy drift), hermeticity, development commands. Marketplace entry mirrors the siblings (source `./agent-plugins/pnpm-guard`, category `safety`). Links to the repo are absolute (AGT-L1); only LICENSE links relatively.
- **Patterns to follow:** `agent-plugins/oxlint-guard/README.md` (structure, exit-table, boundaries section), `agent-plugins/git-subtrees/README.md` (concise variant).
- **Test scenarios:**
  - Test expectation: none — documentation and registration; correctness is the Verification Contract's JSON-validity and README-accuracy checks (documented matrix equals the U3 fixture-backed matrix; documented boundaries equal the implemented ones).
- **Verification:** README statements match observed U4/U5 smoke behavior; marketplace JSON parses; `pnpm check:local` green (dprint covers the new files).

### U7. Repo wiring (own commit)

- **Goal:** Activate both hooks in this repo's own sessions.
- **Requirements:** R16, R17
- **Dependencies:** U1, U3–U6
- **Files:**
  - `.claude/settings.json` (two PreToolUse entries)
- **Approach:** Add the file-guard entry to the existing edit-tool matcher block and the command-guard entry to the Bash block, mirroring the sibling entries verbatim in structure (`command -v deno` prelude, `$CLAUDE_PROJECT_DIR`-anchored paths, same timeouts as `hooks.json`). Matcher text follows the existing repo entries (which omit `Create` — A5). One commit, alone, after the plugin commits land (KTD8). The observed proof: with the wiring active, attempt a planted weakening edit (`minimumReleaseAge: 0` in a scratch copy of the workspace file addressed by a fixture payload through the wired command) — blocked, exit 2, named setting; attempt the same via a Bash payload (`pnpm config set minimumReleaseAge 0`) — blocked; benign edit and benign `pnpm install --frozen-lockfile` payloads — exit 0. Remove the planted fixtures; nothing enters the commit but the settings entries. This edit is the last agent-made edit to `.claude/settings.json` — once the guard is live, R13 vetoes agent edits to it (intended; noted in R16).
- **Patterns to follow:** the existing entries in `.claude/settings.json`.
- **Execution note:** This is the Evaluator-surface commit — it must not carry any plugin-code change, and the red/green observation happens through the real wired command, not a direct script invocation.
- **Test scenarios:**
  - Test expectation: none — configuration activation; the proof is the observed red/green pair described in Approach, recorded in the PR body.
- **Verification:** settings JSON parses; both new entries present alongside untouched existing entries; `guard-protected-writes.ts` byte-identical to pre-work; `pnpm check:local` green.

---

## Verification Contract

- Plugin gates: `deno task check` and `deno task test` from `agent-plugins/pnpm-guard/` — every U3/U4/U5 scenario green.
- Test-layer gate (choose-test-layer admission): every suite test runs in-process through the guards' exported run surfaces (stdin text + injected fs → verdict, exit mapping, stderr) — the same surface each guard's own `import.meta.main` shell consumes; no test spawns a process, and the smoke runs above are verification-time proofs, not suite members. Mutation coverage does not reach this leaf — the workspace's CI mutation tooling covers pnpm packages, and `agent-plugins/AGENTS.md` defines the leaf's own verification contract (`deno task check`/`deno task test`), which is the governing gate here.
- Smoke proof: fixture PreToolUse payloads piped through the real `hooks.json` command strings (with `CLAUDE_PLUGIN_ROOT` set) — blocking payloads exit 2 with named-setting stderr and empty stdout; benign and skip payloads exit 0 silently; oversize/unverifiable payloads on guarded targets exit 2.
- Wiring red/green (U7): planted weakening (file edit and Bash command) blocked through the wired `.claude/settings.json` entries; benign counterparts allowed; observation recorded in the PR.
- JSON validity: `plugin.json`, `hooks/hooks.json`, `.claude-plugin/marketplace.json`, `.claude/settings.json` all parse.
- Root gates: `pnpm check:local` from the repo root — the plugin directory is outside the workspace but inside the dprint scan (AGT-G1); green proves formatting and that nothing else moved.
- Hygiene: no file under `repos/` modified (REPO-S3); `.claude/hooks/guard-protected-writes.ts` untouched; no scratch fixtures committed.

## Definition of Done

- Both guards implement the R3–R13 contracts with the R11 exit semantics, proven by the test scenarios and the smoke runs; every KTD3 matrix row is covered in both directions by a passing test.
- The plugin is complete per the leaf rules (AGT-C1/L1/H1/D1/G1), registered in the marketplace, and documented by a README whose matrix and boundaries match observed behavior.
- The repo wiring landed as its own commit with the observed red/green pair; agent sessions in this repo now veto all exclusion additions (R17) and enforcement-surface edits (R13).
- `deno task check`, `deno task test`, and `pnpm check:local` all green; the four JSON artifacts parse.
- Cleanup criterion: no fixture, probe, or alternate-approach residue in the diff; the planted-violation files from U7's observation never entered a commit.

---

## Sources & Research

- pnpm documentation, verified this session against the installed 11.21.0 bundle (`dist/pnpm.mjs`) and the v11.0 release notes: [supply-chain-security](https://pnpm.io/supply-chain-security), [settings/build](https://pnpm.io/settings/build) (`allowBuilds`, `strictDepBuilds`, `verifyDepsBeforeRun`, migration of the removed build settings, `--allow-build` list semantics), [settings/dependency-resolution](https://pnpm.io/settings/dependency-resolution) (`minimumReleaseAge*`, `trustPolicy*`, `blockExoticSubdeps`, `trustLockfile` — true skips the lockfile verification pass, `packageExtensions`, `patchedDependencies`, `registries`/`strictSsl`, convergence overrides), [migration](https://pnpm.io/migration) (`.npmrc` auth/registry-only split, `package.json#pnpm` no longer read).
- [agent-plugins.org](https://agent-plugins.org) spec 1.0.0 (portable manifest; client extension namespaces) — with the leaf's AGT-H1 ruling that no client reads a namespaced hooks copy; both shipped siblings keep `hooks/hooks.json` in the `hooks/` subdirectory.
- Repo precedents: `agent-plugins/oxlint-guard/` (plugin.json, hooks.json, payload/extraction/verdict architecture, README contract), `agent-plugins/git-subtrees/` (just-bash AST command guard), `.claude/settings.json` (wiring pattern), `.claude/hooks/guard-protected-writes.ts` (the single-setting prior art this generalizes), `.claude-plugin/marketplace.json`, `agent-plugins/AGENTS.md` (leaf law).
- Prior art: [udonc/pm-guard](https://github.com/udonc/pm-guard) — a Claude Code PreToolUse plugin blocking the wrong package manager; complementary scope (wrong-tool, not posture), fail-open on undetectable config and a documented quoted-command blind spot — both contrasts validate KTD5's fail-closed posture and the AST-parse choice; its plugin-test CI workflow is the precedent for the deferred CI lane.
- Wiki taste (`software-wiki`): `pages/pre-merge-agent-gates.md` (hook tasks and CI tasks must be the same tasks — drove the deferred CI lane), `pages/agent-security-gates.md` and `pages/agent-change-scope-control.md` (gate-before-implementation stance; consistency check only).
- Claude Code hooks reference (`code.claude.com/docs/en/hooks`) — PreToolUse matcher semantics grounding the A6 boundary.
- Institutional learnings: `docs/solutions/architecture-patterns/a-prohibition-must-close-transitively.md` (command-vector closure), `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md` (no allowlist), `docs/solutions/integration-issues/comment-checker-hook-silently-bypasses-on-patch-mode-edit.md` (fail-closed, patch-mode payloads), `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` (indeterminable → failure), `docs/solutions/conventions/deno-config-discovery-follows-entrypoint.md` (`--config` in the hook command), `docs/solutions/runtime-errors/hook-subprocess-drops-path.md` (the `command -v deno` prelude), `docs/solutions/tooling-decisions/dprint-from-the-repo-flake.md` (the repo's supply-chain posture the plugin distributes).
- Review evidence folded into this revision: `just-bash@3.2.0` assignment mechanics verified empirically (prefix form via `assignments[]`; `export` via `args[0]`); `pnpm config set _auth <token> --location project` verified live to write an unguarded credential line (residue cleaned; tree verified clean); `PNPM_CONFIG_MINIMUM_RELEASE_AGE` verified as the canonical env spelling.
- Session research notes: pnpm 11 defaults table from the 11.0 release post; `trustPolicy` is a publisher-trust check, not a lifecycle-script control (a widely-circulated practitioner post errs here — the plan does not rely on that source); Socket's coverage of the pnpm 11 defaults as the Mini Shai-Hulud response.
