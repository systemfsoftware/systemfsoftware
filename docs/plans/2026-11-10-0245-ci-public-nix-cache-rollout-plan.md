---
title: Public Nix Cache Rollout - Plan
type: ci
date: 2026-11-10
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Public Nix Cache Rollout - Plan

## Goal Capsule

- **Objective:** Every public organization repository that has a flake substitutes Nix store paths from the organization's public binary cache (`https://nix.systemfsoftware.com`), locally and in every CI Nix job, and a cache miss or an unreachable cache never fails a job. The five repositories whose outputs the others build publish to the cache from their default branches only.
- **Means:** The cache settings ride on every Nix installer step and in each flake's `nixConfig` (KTD1, KTD2). Shared workflows change first and callers then pin them (KTD3). Pushing is a separate default-branch-only workflow per producer (KTD5): a producer pushes the outputs consumers build from its default-branch HEAD, so a consumer substitutes a producer output only where a push covered the revision its pins record — anything else builds from source under `fallback` (R5).
- **Authority:** Requirements outrank decisions; decisions outrank units. The owner alone creates or reads credentials, GitHub environments, repository settings and secret syncs. This plan never does, and never asks a peer to.
- **Stop conditions:** Stage 3 stops per repository until the owner reports that repository's environment.
- **Execution profile:** Stage 2 is 21 pull requests, one per repository. Stage 3 is 5 more, one per producer. The maker opens them and supplies evidence; the conductor arranges review and authorizes merges through each repository's own path. The maker never merges by hand.

---

## Product Contract

### Summary

Roll the public cache out to all 21 flake repositories as consumers, then give the 5 producers a default-branch-only publish job. A producer pushes the outputs consumers build from its default-branch HEAD; a consumer whose pins record a revision no push covered keeps building those outputs from source, which the contract accepts, and moving pins is deferred follow-up work. Consumer work needs no credential and proceeds first. Producer work waits, per repository, on the owner's environment.

### Problem Frame

The cache is live and its contract is fixed: three Nix settings for readers, a signed `nix copy --to` for producers. No repository uses it yet. Each repository installs Nix its own way, so "use the cache" is about 53 installer steps, a handful of shared workflows that other repositories pin by commit, and 21 flakes.

`fallback = true` makes a wrong configuration invisible: the job stays green and builds from source. That, and the pinned shared workflows, are where this rollout can look done and not be.

The previous cache actions are retired and now only warn. A scan of all 21 default branches finds no reference to them, so that requirement is already true and must stay true.

Consumers also pin their producers. Each consumer's `flake.lock` records the revision its flake builds producer outputs from: nine template repositories pin the home repository at one commit (`31963d5a…`), and the `pnpm-release-management` and `comment-checker` revisions recorded across consumer locks scatter over eleven and four distinct commits. A producer's push uploads outputs of its default-branch HEAD only, so a consumer can substitute a producer output exactly when its recorded revision is one that producer's push ran on and covered, its evaluation matches the producer's (Q6), and the path was not refused (R13) — in practice, revisions pushed after that producer's publish workflow lands. Every other consumer keeps building those outputs from source under `fallback`, which the request accepts; moving the pins is deferred follow-up work (Scope Boundaries).

### Requirements

**Consumption**

- R1. Every Nix installer step in a consumer's workflows and local composite actions configures the cache as an additional substituter, trusts the cache's public key, and sets `fallback = true`, so a CI Nix job substitutes from the cache and builds from source on a miss.
- R2. Every consumer flake declares the same three settings as its `nixConfig`, so `nix develop` and `nix build` on a developer machine use the cache once that user accepts the flake's settings and is trusted by their Nix.
- R3. A job that runs Nix inside a shared workflow another repository owns is configured only when the caller pins a commit of that workflow that carries R1, or calls it at `@main` after that workflow's publisher has merged the change that carries R1. The shared workflows are the home repository's reusables and the release-management repository's `changeset-check.yml` and `release.yml`.
- R4. No consumer references the retired cache actions, before or after the rollout.
- R5. No CI job fails because the cache has no path, is unreachable, or resolves through a stale wildcard DNS record.
- R6. The public key written in each consumer equals the cache's published public key byte for byte; a PR proves it.

**Delivery**

- R7. Each repository's change is its own pull request, merged through that repository's own merge path after an independent review of its exact head. Titles, bodies and commit messages obey the public-repository pack: they name nothing a signed-out reader cannot open, and they carry no absolute machine path, real username or host name — quoted command output is rewritten to repository-relative paths or placeholders before it enters a PR (pack: public-repository, names-are-public-or-placeholders.md, people-and-paths-are-placeholders.md).
- R8. Every pull request is reported with its number, head SHA and command output that shows the change works in that repository.

**Production**

- R9. A producer pushes only on a push to its default branch, never on `pull_request`, `merge_group` or manual dispatch.
- R10. Push credentials come from a GitHub environment restricted to the default branch, never from repository-level secrets.
- R11. Before any upload the job derives the public key from the signing key and compares it with the cache's published public key; a mismatch uploads nothing and fails the job.
- R12. The job uploads, with the cache's documented `nix copy --to`, every output another repository's flake builds from that producer. A consumer whose input overrides, or whose calls of a producer lib function with its own inputs, evaluate a producer's outputs against different dependencies builds different store paths than the producer pushes; such consumers are recorded under Q6, not counted as covered by this requirement.
- R13. Every path the cache refuses with 413 (a compressed NAR over the 100 MB request cap), and every path that refusal blocks, is reported by store path; the job still uploads every path it can, and a passing job accounts for each attempted path as uploaded or reported.
- R14. A producer's PR waits for that repository's environment. No consumer PR waits for a producer PR.

### Scope Boundaries

**Outside this work**

- Creating, moving or reading a credential, environment, repository setting or secret sync; the owner's later OIDC and Worker-signing steps.
- Creating a repository or changing a repository's visibility.
- Changing the cache, its Worker, its public key or its retired actions.
- Editing historical plans and solution documents that mention the installer actions.
- Adding a committed test, check or CI job that grades the rollout itself (pack: ci-workflows, ci-never-grades-the-repository-itself.md).

**Considered, not built**

- A `connect-timeout` or other setting beyond the contract's three. A cache that hangs instead of failing is visible as a slower job and cheap to fix then; evidence that would change this is a job slower than its median by a wide margin while the DNS record propagates.
- `accept-flake-config` in CI. It lets any flake's `nixConfig` set arbitrary Nix options for the job; the installer-level settings give CI the cache with no such exposure.
- A shared composite action carrying the cache settings. Its pin would chain every repository behind the home repository and the home repository behind the release-management repository.
- Pushing outputs of non-producers, other platforms than `x86_64-linux` and `aarch64-linux`, or the closure's already-public paths selectively.

**Deferred to Follow-Up Work**

- Lock convergence: moving each consumer's producer pins onto revisions those producers have pushed (about 20 PRs — every repository whose flake pins one of the five producers except `qmd`, which pins none). Planned here as Stage 4 and removed at the owner's direction (session-settled: user-directed — chosen over keeping convergence in this rollout: the request's Done-when accepts a miss that builds from source, and convergence adds a second PR to nearly every repository with drift its CI must absorb). Its hit-rate limits, both found in review: pins sit on historical revisions no push ever served (the nine templates pin one home commit; `pnpm-release-management` revisions scatter over eleven commits), and consumers whose `follows` overrides or producer-lib calls evaluate producer outputs against different dependencies (Q6) build derivations no push serves — convergence must move pins and align evaluations before a hit is possible.
- Rotating the cache key. It touches every site this plan edits; a stale key is a miss, never a failure.

### Outstanding Questions

Blocking Stage 3, for the owner:

- Q1. The name of the GitHub environment in each of the five producers, and whether it is one name for all five.
- Q2. The `comment-checker` default branch is `master`, not `main`. Which branch does its environment restrict to, and does "from main" mean its default branch?
- Q3. Is the push token URL-safe? It reaches `nix copy --to` as Basic-auth credentials and must match GitHub's log masking exactly.

Not blocking, for the owner or conductor:

- Q4. Local `nix develop`: a flake's `nixConfig` applies only to a user the Nix daemon trusts, and only after one interactive acceptance; direnv cannot answer it. Does the owner's machine trust the user, or should contributor docs say how to?
- Q5. Who enqueues each approved PR (each repository's own queue, or the owner), and on what instruction? The maker waits for it.
- Q6. Which consumers evaluate a producer's outputs against different dependencies than the producer builds with, so no producer push can serve the derivations they build? Divergence is decided by result: the consumer's evaluated derivation path for a producer output — including member tarballs built through a producer lib function called with the consumer's own pkgs — differs from the producer's own. Verified on default branches on 2026-11-10: `frontend` overrides its `stryker-js-effect`, `comment-checker` and `systemfsoftware` inputs with its own nixpkgs (`frontend` flake.nix:30-37) and builds the home repository's member tarballs through `systemfsoftware.lib.mkConsumerStore { inherit pkgs; ... }` (`frontend` flake.nix:233); the home repository likewise builds its workspace through `pnpm-release-management`'s lib with its own pkgs. U7 step 4's per-producer comparison completes the list; it runs for every consumer that overrides any producer input or calls a producer lib with its own pkgs. For each divergent consumer the owner chooses: point every `follows` override on that producer input at the producer's own nixpkgs and stop building producer outputs through such a lib call (cost: the consumer deliberately evaluates those outputs against the producer's lock and gives up the lib call, a real change to its flake), or accept building those outputs from source. Not blocking: no unit in this plan waits on it.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Attach the settings to each installer step, not to workflow `NIX_CONFIG`.** The installer writes them to the daemon's system configuration, so they hold for every later Nix call in the job whatever the environment, sudo or caller. A step either carries the block or it does not, which one inventory per repository can prove; an environment variable's reach through composite actions and reusable workflows cannot be proven that way, and a miss is silent under `fallback`. The contract's README shows `NIX_CONFIG`; it fixes the three settings, not the carrier. Chosen over workflow-level `env`, which edits fewer files but leaves transitive callers unverifiable. The Determinate installer takes the same lines through `extra-conf` and the Cachix installer through `extra_nix_config`; both trust the runner user by default and write the system file, so trust does not decide the result.
- KTD2. **`nixConfig` in each flake for local use, with no `accept-flake-config` anywhere in CI.** A scratch flake with `nixConfig` reached the cache under `--accept-flake-config` in a trusted store and was refused with "ignoring untrusted substituter" in an untrusted one, so local use depends on the machine (Q4).
- KTD3. **Waves.** The release-management repository first, then the home repository, then every repository that pins them. A caller's Nix jobs inside a shared workflow substitute only after the caller pins a commit that contains R1, so the pin bump belongs in the caller's one PR. Callers pinned to `@main` change on the publisher's merge and need no edit. Chosen over letting Dependabot bump pins, whose timing nothing controls. A wave label says the unit needs no producer merge to start; units inside one wave still honor their Dependencies lines (U3 waits for U2's merge).
- KTD4. **Two PRs per producer.** The Stage 2 PR is the consumer change. The Stage 3 PR adds the push workflow. A single PR would hold the five consumer changes, and the home repository's wave, behind the owner's environments.
- KTD5. **The push is its own workflow, triggered by a push to the default branch only, with `environment:` on its job.** An environment on a job that also runs for pull requests would block those runs. A reference to an environment that does not exist creates an unrestricted one, so a Stage 3 PR merges only after the owner reports the environment.
- KTD6. **A 413 stops `nix copy`, so the push job continues past it.** The contract's README documents that a compressed NAR over the 100 MB cap is refused at the edge with 413 and `nix copy` stops with an error — taking every path it had not yet attempted and every referrer of the refused path with it, since the binary-cache store refuses a path whose references are not already uploaded. One oversize path would otherwise hide every 413 behind it and leave the closure mostly unpushed under a green job. The error does not name the store path: nix reports the compressed-NAR object (`nar/<hash>.nar.xz`), and several "copying path" lines precede it even with one connection. The job therefore re-runs the copy over the remaining paths after each 413, attributing the refusal by running the unfinished paths one `nix copy` invocation at a time in dependency order, references before referrers — the invocation that fails with 413 is the refused path, and its blocked referrers follow from the dependency order — recording the refused path and its referrers each time, until a pass succeeds or only non-413 failures remain. It is a property of the path, so failing every default-branch push over it leaves the branch red permanently; a green job means every attempted path is uploaded or reported.
- KTD7. **Each producer carries its own copy of the push logic.** Each Stage 3 PR then waits only for its own environment, and no producer's PR depends on another producer's merge.
- KTD8. **Proof is a one-time mechanism proof, a per-repository inventory, a local observation and a read-only cache lookup, none of them committed.** Verbosity 2 (`-vv`) shows `downloading '…/nix-cache-info'` and `querying info about … on 'https://nix.systemfsoftware.com'` when the cache is in use; nothing shows it at default verbosity. In a scratch run, the cache answered the `nix-cache-info` request. A read-only `nix path-info --store https://nix.systemfsoftware.com <path>` observes, without grading anything, whether a specific store path a consumer's flake references exists on the cache. (pack: ci-workflows, ci-never-grades-the-repository-itself.md)
- KTD9. **Public-safe text.** PR titles, bodies and commit messages for public repositories name the cache by its URL and call its key file "the cache's published public key". They name no private repository, tracker key, branch containing a tracker key, secret store or sync, and no absolute machine path, real username or host name: local command output quoted into a PR body or commit message is rewritten to repository-relative paths or placeholders first (pack: public-repository, people-and-paths-are-placeholders.md). Stage 2 branches get neutral names.
- KTD10. **No read or write of environments, secrets, rulesets or repository settings.** Environment existence and restriction come from the owner's report.
- KTD12. **The push workflow pins its third-party actions by commit SHA.** The upload job holds the push token; a tag reference a publisher can move must not decide what runs beside it. The pin follows the org's existing shape — full commit SHA with the version in a trailing comment, as in `comment-checker`'s `actions/cache@55cc8345863c… # v6.1.0`. Stage 2 edits keep the installer steps' existing tag pins; this decision governs only the new U7 workflow.

### Assumptions

Agent bets, not confirmed with anyone:

- A1. The owner's Stage 2 expectation is KTD4's split, so a producer's consumer change merges before its environment exists.
- A2. Consumer pins at `21dfc32e99…` are a safe bump to the home merge commit: `.github` changed there in two commits, one an added input, one a package removal.
- A3. `api-extractor-effect`, pinned at `732f66a0c8…` with 21 `.github` commits of drift, may import behavior changes its CI must absorb.
- A4. A bump that makes a repository's CI fail on drift unrelated to the bump's intended content is that PR's problem to report; it is not an R5 failure.
- A5. No change here moves a publishable package's turbo build hash, because every edit is in `.github/`, `flake.nix` or `docs/`. Each repository's own changeset gate decides on its PR.
- A6. The first push of a producer uploads a whole closure and takes far longer than later ones. Not measured.
- A7. Conventional commit type `ci` fits every change; the repositories' commitlint rules apply as written.

### Cache settings (the contract the units copy)

Three settings, verbatim from the cache's contract: the cache URL as an extra substituter, the cache's public key as an extra trusted key, `fallback = true`. The key is copied from the cache's published public key file; this plan carries no copy so there is nothing to drift from it.

### Site inventory

Counts are Nix installer steps found in each repository's default branch on 2026-11-10. A unit re-counts before editing.

| Repository                                                                                             | Installer steps                                                                        | Pins to bump                                                                | Unit |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---- |
| pnpm-release-management                                                                                | changeset-check ×1, ci ×1, release ×3, sandbox ×2                                      | none                                                                        | U2   |
| systemfsoftware                                                                                        | checks-lane action ×6, sfs-deps action ×1, reusable-nix ×1                             | release-management in `changeset-check.yml`, `release.yml`                  | U3   |
| discern, effect-daemon, effect-e2e, effect-memfs, effect-readiness, hex-schema, npm-package, rx-effect | local checks-lane action ×1 each                                                       | home `@21dfc32e99…` everywhere it appears                                   | U4   |
| effect-microvm                                                                                         | local checks-lane ×1, `ci.yml` ×1                                                      | home `@21dfc32e99…` everywhere                                              | U4   |
| api-extractor-effect                                                                                   | local checks-lane ×1, `ci.yml` ×1                                                      | home `reusable-checks` `@732f66a0c8…`; release-management ×2 `@b9b4a1d48c…` | U5   |
| gritlint                                                                                               | `ci.yml` ×1, `mutants.yml` ×2                                                          | release-management ×2 `@b9b4a1d48c…`                                        | U5   |
| qmd                                                                                                    | `nix.yml` ×1 (already sets `extra_nix_config`)                                         | none                                                                        | U6   |
| are-the-types-wrong-effect                                                                             | `ci.yml` ×2                                                                            | none (`@main`)                                                              | U6   |
| omp-claude-compat                                                                                      | `ci.yml` ×1                                                                            | none (`@main`)                                                              | U6   |
| comment-checker                                                                                        | `ci.yml` ×2, Determinate installer, already sets `extra-conf`; default branch `master` | none (`@main`)                                                              | U6   |
| effect-endgame-starter-kit                                                                             | `check.yml` ×1, `deploy.yml` ×2                                                        | none                                                                        | U6   |
| frontend                                                                                               | `check.yml` ×1, `deploy.yml` ×2, `release.yml` ×1                                      | none (`@main`)                                                              | U6   |
| stryker-js-effect                                                                                      | `bench.yml` ×1, `ci.yml` ×5, `e2e.yml` ×1, `nix.yml` ×1, `released-tarballs` action ×1 | none (`@main`)                                                              | U6   |
| xstate                                                                                                 | `dev-shell` action ×1                                                                  | none (`@main`)                                                              | U6   |

Every row also gets its flake's `nixConfig`. Flake pins on the five producers do not move in this rollout; moving them is the deferred lock-convergence follow-up (Scope Boundaries).

### High-Level Technical Design

```mermaid
flowchart TB
  U1[U1 mechanism proof] --> U2[U2 release-management PR]
  U2 -->|merge SHA| U3[U3 home PR]
  U2 -->|merge SHA| U5[U5 pinned callers]
  U3 -->|merge SHA| U4[U4 home callers]
  U3 -->|merge SHA| U5
  U1 --> U6[U6 standalone consumers]
  U2 --> U7[U7 producer push, per repo]
  U3 --> U7
  U6 --> U7
  OWN[owner reports environment] --> U7
```

The producers are `systemfsoftware` (U3), `stryker-js-effect`, `xstate` and `comment-checker` (all U6), and `pnpm-release-management` (U2); no U4 repository produces outputs another flake builds. Each U7 PR starts after that repository's own Stage 2 PR merged and its owner report arrived. After that, every default-branch push on a producer publishes again; consumers whose pins trail what it pushes keep building from source (R5).

Push job per producer and system, directional only:

```text
on push to default branch only
job (environment: <Q1>, matrix: x86_64-linux, aarch64-linux)
  install Nix with the cache settings
  build the aggregate outputs in the producer's output list, then every member output the consumers' linkFarms name
  derive public key from the signing key; compare to published key; stop on mismatch
  upload the output closures with the documented copy command, compression=zstd
  on 413: the error names a NAR object, not a store path -- re-run the remaining paths one copy invocation at a time in dependency order; the invocation that 413s identifies the refused path; record it and its referrers, drop them, continue
  when no path remains: list every refused path with its referrers in the annotation and step summary
  any other upload failure: fail
```

Outputs per producer are those another repository's flake references, read on 2026-11-10, per workspace member as well as aggregate: every consumer's `sfs-deps` linkFarm picks `upstream.${member.attr}` out of `upstream.workspace-tarballs.members` (`discern` flake.nix:32-41 and the same nine lines in the other eight template repositories; `api-extractor-effect` flake.nix:87-92), so the member outputs are the paths consumers actually build and the aggregates alone do not cover them. `systemfsoftware` — `workspace-tarballs` and every member it names, plus `dprint` and `test-timings`; `stryker-js-effect` — `workspace-tarballs` and its members (`frontend` flake.nix:148 builds it); `xstate` — `workspace-tarballs` and its members; `pnpm-release-management` — `release-tools`, `sandbox`, `changeset-management` and the members its consumers' linkFarms name; `comment-checker` — `comment-checker`. U7 re-derives the list from the consuming flakes before writing the workflow. The re-derivation also compares, for each consumer that overrides any producer input or calls a producer lib with its own pkgs, the consumer's evaluated derivation paths for those outputs with the producer's own evaluation; a consumer whose paths differ cannot substitute the pushed paths and is recorded as Q6 input, not counted as covered by R12.

### Risks

| Risk                                                  | Consequence                                      | Handling                                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A site missed or misconfigured                        | The job stays green and builds from source       | Per-repository inventory of every installer step; one runner proof per installer (U1)                                                                                  |
| Pin bump imports drift                                | A PR fails for a reason unrelated to the cache   | CI on each PR; the repository's own gate; report, never patch around (A4)                                                                                              |
| Stale wildcard DNS or a hanging cache                 | Slow job, no failure                             | Contract's `fallback`; U1 proves the stale-record case against an unreachable host and a live non-cache host; slowness reported; `connect-timeout` is a named non-goal |
| Stage 3 PR merged before the environment exists       | GitHub creates an unrestricted environment       | Merge only after the owner's report (KTD5)                                                                                                                             |
| One signing key trusted by every consumer             | A poisoned push poisons all                      | Owner's later OIDC and Worker-signing steps; default-branch environment; key check (R9–R11)                                                                            |
| First push is large and some paths exceed 100 MB      | Their dependents stay uncached                   | R13 reports them by name                                                                                                                                               |
| Release jobs are not run by pull-request CI           | `release.yml` Nix steps unexercised before merge | U1 runner proof, static inventory, first default-branch run reported                                                                                                   |
| Dependabot opens competing bumps                      | Duplicate or conflicting PRs                     | Compare heads before pushing; close nothing by hand                                                                                                                    |
| First arm leg on a producer with no arm Nix job today | A non-413 failure turns that default branch red  | Accepted: the org's standard runner pair runs it (U7 step 2); the failure is that producer's own CI problem, reported, not patched around (A4)                         |

### Sources

- The cache's contract: its README and public key file (a private repository; the maker has read access) for the three settings, the push command, the 413 behavior and the retired actions.
- `.github/AGENTS.md` for the reusable workflows' pin contract; `flake.nix` and `nix/` for the home repository's outputs.
- `.github/actions/checks-lane/action.yml`, `.github/actions/sfs-deps/action.yml`, `.github/workflows/reusable-nix.yml`, `.github/workflows/changeset-check.yml`, `.github/workflows/release.yml` for the home sites.
- The Cachix and Determinate installer actions' `action.yml` and `install-nix.sh`: both write to the system configuration and trust the runner user by default.
- Each repository's `flake.lock`, `flake.nix` inputs and workflow runner labels on its default branch, read on 2026-11-10: the producer-pin spread behind Q6 and the deferred lock-convergence follow-up, the consumers' `upstream.${member.attr}` linkFarm shape behind the output list, and the `ubuntu-latest` / `ubuntu-24.04-arm` runner pair behind U7.
- `frontend`'s `flake.nix` input overrides and its `mkConsumerStore` call, the home repository's `pnpm-release-management` lib call, and the producers' root nixpkgs revisions on their default branches, read 2026-11-10: the verified divergence instances behind Q6.

---

## Implementation Units

### U1. Prove the settings on runners and in a trusted local store

- **Goal:** Establish that the exact block works under both installer actions and under `nixConfig`, before 21 repositories copy it.
- **Requirements:** R1, R2, R5, R6
- **Dependencies:** none
- **Files:** none committed. A scratch flake outside any repository; one push-triggered scratch workflow on a throwaway branch of the home repository with a neutral name, deleted afterward.
- **Approach:**
  1. Run the scratch workflow with the Cachix installer carrying the block and with the Determinate installer carrying it through `extra-conf`. Each builds a trivial derivation at `-vv` and prints the effective settings.
  2. Repeat each with the cache hostname replaced by an unreachable one, and again with it replaced by a reachable host that is not the cache — a live answerer of 404s or non-cache bodies, as a stale wildcard DNS record would be — to show `fallback = true` ends in a source build and a passing job in both cases.
  3. Locally, build the scratch flake with `--accept-flake-config` against a trusted scratch store at `-vv`.
  4. Keep the logs in session scratch outside the repository; quote excerpts in later PR bodies with machine paths, usernames and host names rewritten per R7.
- **Test expectation:** none -- throwaway proof; nothing committed (pack: ci-workflows, ci-never-grades-the-repository-itself.md).
- **Verification:** Both installers log the `nix-cache-info` download and a `querying info about … on 'https://nix.systemfsoftware.com'` line, with no "ignoring untrusted substituter". The unreachable-host and live-non-cache-host runs exit 0.

### U2. Release-management repository PR (wave 1)

- **Goal:** Every Nix job in `pnpm-release-management`, including the shared `changeset-check.yml` and `release.yml` other repositories call, carries R1; the flake carries R2.
- **Requirements:** R1, R2, R3, R5, R6, R7, R8
- **Dependencies:** U1
- **Files:** `.github/workflows/changeset-check.yml`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/sandbox.yml`, `flake.nix`
- **Approach:**
  1. Add the block to all 7 installer steps and `nixConfig` to the flake.
  2. Leave the workflows' inputs and outputs unchanged, since pinned callers use them.
  3. Record the merge commit as the pin for U3 and U5.
- **Patterns to follow:** The installer action's existing `with:` usage elsewhere in the same file.
- **Test expectation:** none -- CI configuration; its own CI and U1 are the proof.
- **Verification:** An inventory lists 7 installer steps, each carrying the block; the key matches the published one; the PR's CI is green at the head; the repository's changeset gate demands nothing for these files, or its own rule is followed.

### U3. Home repository PR (wave 1)

- **Goal:** The reusables and local actions the other repositories call carry R1, the home flake carries R2, and the home repository pins the new release-management commit.
- **Requirements:** R1, R2, R3, R6, R7, R8
- **Dependencies:** U2 merged
- **Files:** `.github/actions/checks-lane/action.yml`, `.github/actions/sfs-deps/action.yml`, `.github/workflows/reusable-nix.yml`, `.github/workflows/changeset-check.yml`, `.github/workflows/release.yml`, `.github/AGENTS.md`, `flake.nix`
- **Approach:**
  1. Commit the `.github/workflows` and `.github/actions` edits by themselves, since this is an Evaluator surface (root `AGENTS.md`, Surface Classes). No gate is added, edited or loosened.
  2. Commit `flake.nix` and one standing fact in `.github/AGENTS.md` separately: every Nix install in this repository's workflows and actions carries the cache settings.
  3. Bump both release-management pins to U2's merge commit.
  4. Keep reusable workflows' inputs backward compatible for pinned callers.
  5. Record the merge commit as the pin for U4 and U5.
- **Test expectation:** none -- CI configuration; `consumer-fixture.yml` exercises the changed reusables.
- **Verification:** `pnpm check:local` exits 0 after the last edit; the inventory lists 8 installer steps carrying the block; `consumer-fixture.yml` is green at the head; the Evaluator commit contains no other file.

### U4. Home reusable callers (wave 2): nine repositories

- **Goal:** `discern`, `effect-daemon`, `effect-e2e`, `effect-memfs`, `effect-readiness`, `hex-schema`, `npm-package`, `rx-effect` and `effect-microvm` each substitute from the cache in every Nix job, including the jobs inside the reusables they call.
- **Requirements:** R1, R2, R3, R6, R7, R8
- **Dependencies:** U3 merged
- **Files:** per repository, `.github/actions/checks-lane/action.yml`, `.github/workflows/ci.yml`, `.github/workflows/commitlint.yml`, `.github/workflows/nix.yml`, `flake.nix`; for `effect-microvm` also its own installer step in `ci.yml`.
- **Approach:**
  1. Add the block to the local `checks-lane` installer step and, for `effect-microvm`, to the `ci.yml` step.
  2. Replace every occurrence of the old home pin with U3's merge commit, in workflows and in the local action.
  3. Add `nixConfig` to the flake.
- **Patterns to follow:** U3's shape for the block; the repositories' existing pin comments.
- **Test expectation:** none -- CI configuration.
- **Verification:** The old pin appears nowhere; every installer step carries the block; key matches; the PR's CI, including the called reusables' Nix and sfs-deps jobs, is green at the head; a local `nix build --dry-run -vv --accept-flake-config` against a trusted scratch store logs queries to the cache.

### U5. Pinned callers (wave 2): `api-extractor-effect` and `gritlint`

- **Goal:** Both repositories' own Nix steps and the shared-workflow jobs they call carry R1.
- **Requirements:** R1, R2, R3, R6, R7, R8
- **Dependencies:** U2 merged; U3 merged for `api-extractor-effect`
- **Files:** `api-extractor-effect`: `.github/actions/checks-lane/action.yml`, `.github/workflows/ci.yml`, `.github/workflows/changeset-check.yml`, `.github/workflows/release.yml`, `flake.nix`. `gritlint`: `.github/workflows/ci.yml`, `.github/workflows/mutants.yml`, `.github/workflows/changeset-check.yml`, `.github/workflows/release.yml`, `flake.nix`.
- **Approach:**
  1. Add the block to each installer step; both repositories pin the installer by commit, so confirm the pinned version accepts the input.
  2. Bump the release-management pins to U2's merge commit and, for `api-extractor-effect`, the home pin to U3's.
  3. Add `nixConfig`.
- **Execution note:** `api-extractor-effect` crosses 21 `.github` commits of home drift (A3). Read the drift before bumping and let the PR's CI report anything that breaks.
- **Test expectation:** none -- CI configuration.
- **Verification:** As U4, plus no old release-management or home pin remains.

### U6. Standalone consumers (wave 1): eight repositories

- **Goal:** `qmd`, `are-the-types-wrong-effect`, `omp-claude-compat`, `comment-checker`, `effect-endgame-starter-kit`, `frontend`, `stryker-js-effect` and `xstate` each carry R1 and R2.
- **Requirements:** R1, R2, R3, R6, R7, R8
- **Dependencies:** U1. Six of them — `are-the-types-wrong-effect`, `omp-claude-compat`, `comment-checker`, `frontend`, `stryker-js-effect` and `xstate` — call release-management at `@main`, so their release-management jobs change on U2's merge with no edit here; `qmd` and `effect-endgame-starter-kit` call no shared workflow.
- **Files:** the site inventory rows for U6, plus each repository's `flake.nix`.
- **Approach:**
  1. Add the block to every installer step in the inventory. In `qmd` and `comment-checker` append it to the existing `extra_nix_config` and `extra-conf`.
  2. In `xstate`, edit the composite action that installs Nix (`dev-shell`) — its only installer site. In `stryker-js-effect`, edit the `released-tarballs` action **and** every workflow-embedded installer step: the action covers one of nine sites, and `ci.yml` ×5, `bench.yml`, `e2e.yml` and `nix.yml` carry their own.
  3. Add `nixConfig`.
- **Execution note:** `comment-checker` triggers on `master`. Leave its triggers alone; Q2 concerns only U7.
- **Test expectation:** none -- CI configuration.
- **Verification:** Every installer step in the repository carries the block — nine sites in `stryker-js-effect`; key matches; the PR's CI is green at the head; the local dry-run observation (U4) logs queries to the cache.

### U7. Producer push workflow (Stage 3): five repositories

- **Goal:** `systemfsoftware`, `stryker-js-effect`, `xstate`, `pnpm-release-management` and `comment-checker` each publish the outputs consumers build to the cache, from their default branch only, with credentials from the owner's environment.
- **Requirements:** R9, R10, R11, R12, R13, R14
- **Dependencies:** That repository's Stage 2 PR merged; the owner's report for its environment — that both secret names resolve in the environment and no same-named repository- or organization-level secret overrides them — and Q1, Q2, Q3 answered; U1
- **Files:** per producer, one new workflow under `.github/workflows/` in its own directory.
- **Approach:**
  1. Trigger on push to the default branch alone, with a minimal `contents: read` permission and no persisted checkout credentials.
  2. Run one job per system in the environment named by Q1, on named runners: `ubuntu-latest` for `x86_64-linux` and `ubuntu-24.04-arm` for `aarch64-linux` — the org's standard Nix pair, already the default `systems` input of the home repository's `reusable-nix.yml` and the matrix of `stryker-js-effect`'s `nix.yml`. The three producers that run no Nix job on arm today prove the leg on their first push run.
  3. Pin every third-party `uses:` in the new workflow to a full commit SHA with its version in a trailing comment (KTD12); existing steps elsewhere keep their pins.
  4. Build the aggregate outputs listed in the design section, then every member output the consumers' linkFarms name; confirm each name against the producer's flake and the consuming flakes before writing it. For each consumer whose flake overrides any producer input or calls a producer lib with its own pkgs, evaluate that consumer's derivation paths for the producer outputs it builds and compare them with the producer's own evaluation; record every divergent consumer in the PR description as Q6 input — the push cannot serve their derivations — rather than counting them as covered by R12.
  5. Write the signing key to a private temporary file, derive its public key and compare it with the published one before any request; never print either secret, only lengths.
  6. Upload with the documented copy command and `compression=zstd` — the README's advice: it produces the smallest NARs and keeps paths under the 100 MB cap — keeping the token out of arguments and logs. Choose the carrier that does so under GitHub's masking (Q3).
  7. Treat a 413 as a stop, not an end (KTD6): the error names a compressed-NAR object, not a store path, so after each 413 re-run the remaining paths one `nix copy` invocation at a time in dependency order (references before referrers); the invocation that fails with 413 identifies the refused store path. Record that path and the paths that depend on it, drop them from the upload set, and continue; stop only when a full pass succeeds or a non-413 failure remains. The annotation and step summary list every refused path by store path with its blocked referrers, and any non-413 failure — including a failed key check — exits non-zero.
  8. Carry the cache settings on the installer step (R1).
- **Execution note:** Prove the push logic against a local HTTP stand-in for the cache that returns 401, 413 and 422 and accepts a signed narinfo, using a freshly generated key pair. Throwaway, not committed.
- **Patterns to follow:** The Stage 2 shape of the repository's installer step.
- **Test scenarios:**
  - Matching key: a signed path uploads and the job passes.
  - Mismatched key: no request is made and the job fails before uploading.
  - 413 on one path: the path and its referrers are listed by store path; the job passes if nothing else failed.
  - 413 on two paths: both are listed with their referrers, every other path in the closure uploads, and the job passes.
  - 401 or 5xx: the job fails.
  - Trigger: no event other than a push to the default branch can start the job.
  - Token: it appears in no log line at `-vv` on any scenario above.
  - Pins: every third-party `uses:` in the workflow is a full commit SHA with a version comment (KTD12).
- **Verification:** The stand-in scenarios above behave as listed; the first real default-branch run after merge (owner's environment present) pushes and reports; the maker reports the run's URL and every 413 path with its referrers.

---

## Verification Contract

| Applies to               | Command or evidence                                                                                                                                   | Outcome                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Home repository          | `pnpm check:local` after the last edit                                                                                                                | Exit 0                                                                                            |
| Every repository         | The installer-step inventory: every `cachix/install-nix-action` and `DeterminateSystems/nix-installer-action` `uses:` in `.github/` carries the block | Zero steps without it                                                                             |
| Every repository         | The key in the diff against the cache's published public key                                                                                          | Byte-identical                                                                                    |
| Every repository         | A scan of `.github/`, `flake.nix` and `nix/` for the retired actions and the private cache repository's name                                          | No match                                                                                          |
| Every PR                 | The repository's own gate and CI at the exact head                                                                                                    | Green                                                                                             |
| Every U4–U6 PR           | A local `nix build --dry-run -vv --accept-flake-config` on a trusted scratch store                                                                    | `querying info about … on 'https://nix.systemfsoftware.com'` and no untrusted-substituter warning |
| Pin bumps                | The old pin string across the repository                                                                                                              | Not found                                                                                         |
| U7                       | The stand-in scenarios and the first default-branch run                                                                                               | As U7's verification                                                                              |
| Whole rollout, last step | The inventory, key and retired-action scans repeated on each default branch after its PR merges                                                       | All 21 clean; 5 producers' push workflows present and run                                         |

## Definition of Done

- Global: every one of the 21 repositories passes the inventory, key and retired-action checks on its default branch; every shared-workflow caller pins a commit carrying R1 or calls `@main` after U2 merged; every consumer's Nix jobs substitute from the cache where a push covers what its pinned revisions evaluate, and every miss builds from source without failing the job (R5); each PR is reported with number, head SHA and command output; the owner's questions are answered or listed as open.
- U1: the proof logs exist in scratch and their excerpts are in the first PR's body.
- U2–U6: each unit's PRs are merged through their repository's own path after a fresh reviewer's approval of the exact head; no throwaway branch or scratch file remains in any repository.
- U7: each producer's PR is merged only after the owner's report; its first default-branch run is reported; every 413 path is listed by name with the referrers its refusal blocked.
- Cleanup: no abandoned-attempt code, scratch workflow or proof branch remains.

---

## Document Review Rulings (2026-11-10)

Independent document review of this plan at `a14d6ada6b` returned two P1s, eight P2/P3 findings and one FYI; Q1–Q5 stay with the owner. Every finding is resolved in this revision; none is declined.

- **P1 — consumers pin producers at revisions the cache never served:** a producer's push uploads only its default-branch HEAD, while consumer locks record historical producer revisions (the home repository pinned at `31963d5a…` by nine templates; `pnpm-release-management` over eleven commits; `comment-checker` over four), so pinned consumers would never substitute. Resolved in the second revision by adding Stage 4; the third review's owner ruling removed Stage 4 and made moving pins the deferred lock-convergence follow-up, with the hit-rate limits recorded there. The Problem Frame now states what a producer pushes and what a consumer can therefore substitute.
- **P1 — KTD6's non-fatal 413 left the closure mostly unpushed:** the contract's README states `nix copy` stops with an error on a 413 and a refused path blocks its referrers, so a green job could hide every later 413 and leave un-attempted paths unpushed. Resolved: R13, KTD6, the push-job sketch, U7 steps 6–7 and the two-413 scenario, U7 and DoD verification wording.
- **P2 — per-member outputs missing from the push list:** consumers build `upstream.${member.attr}` per workspace member out of `upstream.workspace-tarballs.members`, not only the aggregates. Resolved: the output list and push-job sketch in the design section, U7 step 4.
- **P2 — no verification observed a consumer actually hitting a pushed path:** Resolved in the second revision by the U8 lookup; with Stage 4 removed, the plan verifies the mechanism and the queries (U1, U4–U6) and states per-consumer substitution as an expectation (Problem Frame, DoD), since a consumer whose pins trail keeps building from source by the request's own acceptance.
- **P2 — push workflow should pin `uses:` to commit SHAs (filed P1 by the security reviewer, lowered to P2):** Resolved: KTD12, U7 step 3, a test scenario. Scoped to the new U7 workflow; Stage 2 keeps existing pins.
- **P2 — aarch64 leg not runnable on `xstate`, `pnpm-release-management`, `comment-checker`:** those repositories have no aarch64 Nix runner label of their own. Resolved: U7 step 2 names the org's standard pair, `ubuntu-latest` and `ubuntu-24.04-arm`, which `reusable-nix.yml`'s default and `stryker-js-effect`'s `nix.yml` already run Nix on; their first arm push run is the first proof.
- **P2 — U6 step 2 skipped eight of `stryker-js-effect`'s nine installer steps:** editing only the `released-tarballs` action covers one of nine sites. Resolved: U6 step 2 edits the action and every workflow-embedded step; U6's verification names the nine.
- **P2 — the design diagram's U4→U7 edge is wrong:** no U4 repository is a producer. Resolved: the edge is removed and producer units are named per unit (the U8 edges added in the second revision were removed with Stage 4).
- **P3 — U6 mislabeled wave 2:** it depends only on U1. Resolved: the heading now reads wave 1.
- **P3 — "main only" wording against `comment-checker`'s `master` default:** Resolved: the Goal Capsule, Summary, KTD6, U7 and DoD say "default branch"; the environment-branch question stays open as Q2.

### Second independent review (at `dc6df4c7dc`)

Two P1s, four P2s, four P3s, three FYIs; Q1–Q5 stay with the owner. Every finding is resolved; none is declined. The third review's owner ruling later removed Stage 4, superseding the resolutions that lived there; those bullets below are marked.

- **P1 — U8 bumped only the flake lock, but the templates' pnpm lockfile and overrides pin older farm tarballs:** moving a template's core pin rebuilds the dependency farm at the producer's newer versions (`effect-cell-types` moves 12.0.2 → 12.1.1; packages the templates name were deleted upstream), so the frozen install fails and the stop rule would halt all nine PRs. Resolved then by carrying the overrides, the lockfile and the consumer's own bump procedure in U8; superseded by Stage 4's removal — the drift now never enters this rollout, and the deferred follow-up inherits the warning.
- **P1 — consumers that follow their own nixpkgs rebuild producer outputs differently, so pushed paths never match:** a consumer overriding a producer input's nixpkgs with its own builds different derivations than the producer pushes, and could pass the then-current checks while silently building from source. Resolved: divergence is decided by result (Q6); U7 step 4 compares each consumer that overrides any producer input or calls a producer lib with its own pkgs; R12 stops counting those consumers as covered; the fork — align every `follows` override on the producer input and drop the lib call, or accept source builds — is Q6 for the owner, with each option's cost stated.
- **P2 — lock convergence (up to 19 PRs) is plan-added scope and the plan never weighed pushing the revisions consumers already pin:** the second revision answered it by keeping Stage 4 as committed work; the third review put the scope question to the owner with the review's evidence, and the owner's ruling removed Stage 4 — the request's Done-when accepts a miss that builds from source. Lock convergence is the named follow-up under Scope Boundaries, carrying the hit-rate limits both reviews found. The standing arguments against the other alternative — pushing the revisions consumers already pin would rebuild eleven historical `pnpm-release-management` revisions on every default-branch push forever, and unmaintained historical revisions can stop building and turn the branch permanently red under KTD6 — still hold against it.
- **P2 — U8's two pass checks could both pass while no producer output substitutes:** a red push run (any non-413 failure, or a first arm leg) leaves HEAD unpushed, and a single path-info lookup could hit a shared nixpkgs path while every producer member output misses. Resolved then by the pushed-revision bump target (A8) and the every-referenced-path lookup; superseded by Stage 4's removal — no U8 check remains.
- **P2 — a 413 names a compressed-NAR object, so the drop-a-subtree loop could not choose what to drop:** reproduced with nix 2.34.8; the error carries `nar/<hash>.nar.xz` and several "copying path" lines precede it even with one connection. Resolved: KTD6, the push sketch and U7 step 7 attribute the refusal by re-running the unfinished paths one `nix copy` invocation at a time in dependency order, references before referrers — the failing invocation is the refused path, and its blocked referrers follow from the dependency order; the whole-closure copy stays the first attempt.
- **P2 — R15's exemption narrower than U8's actual exemptions:** resolved then by carrying the full exemption list; superseded by Stage 4's removal — R15 and its exemptions no longer exist, and the review's residual on `frontend`'s `systemfsoftware` pin is moot with them.
- **P3 — the design diagram omitted the U4 and U5 edges to U8:** added then; removed with Stage 4.
- **P3 — R14's blanket "no consumer PR waits for a producer PR" contradicted Stage 4:** R14 was scoped then; with Stage 4 removed the blanket sentence is simply true and R14 is one line.
- **P3 — the home push list named `repo-checks`, deleted in #821:** removed; the list reads `workspace-tarballs` and every member it names, plus `dprint` and `test-timings`.
- **P3 — `compression=zstd` missing from the upload:** U7 step 6 and the push sketch carry it, per the README's advice, before any 413 handling is reached.
- **FYI — a missing environment secret falls back silently to a same-named repository- or organization-level secret:** the owner's per-producer report now also states that both secret names resolve in the environment with no same-named override above it (U7 Dependencies); the maker still reads no secret or setting (KTD10).
- **FYI — R3 covered only commit-pinned callers:** R3 now also covers callers at `@main` after the workflow's publisher has merged the change that carries R1.
- **FYI — wave labels vs KTD3's ordering:** KTD3 now defines a wave label as meaning the unit needs no producer merge to start, with Dependencies lines still honored inside a wave (U3 waits for U2's merge).
- **Residual — the arm leg on `xstate`, `pnpm-release-management` and `comment-checker` is first proven by their first default-branch push, and a non-413 failure there turns that branch red:** accepted, now a named risk row; the failure is that producer's own CI problem, reported, not patched around (A4).

### Third independent review (at `9b672226fe`)

One P1, four P2s, six P3s, two FYIs, one residual risk and one deferred question; Q1–Q5 stay with the owner. The review's deferred question — whether lock convergence belongs to this request — went to the owner with the review's evidence, and the owner's ruling removed Stage 4. That removal is the resolution of every finding whose subject was Stage 4; none is declined.

- **Owner ruling — lock convergence (Stage 4) removed:** the request's Done-when asks three things of producers and consumers — consumers substitute from the cache with `fallback = true`, so a miss builds from source and never fails; nothing references the retired actions; producers push the outputs they build on their default branches, with the key check, the environment and the 413 report. No clause asks to move consumer pins. Removed: R15, KTD11, U8, A8, the diagram's Stage 4 edges, the Goal Capsule's Stage 4 stop conditions and profile line, the lock-bump risk row, the Verification Contract's U8 rows and the DoD's U8 bullet. Recorded: the deferred follow-up under Scope Boundaries carries the hit-rate limits the reviews found (pins on historical revisions no push served; divergent `follows` overrides and producer-lib evaluations build derivations no push serves). The plan states what producers push and what a consumer can therefore expect to substitute (Summary, Problem Frame, Means, DoD).
- **P1 — U8 bumped producer inputs that build nothing, and two bumps break evaluation** (the home repository reads `comment-checker` only for `nix/release-hashes.json`, which its default branch no longer carries; `stryker-js-effect`'s `systemfsoftware` input exists only for the deleted `repo-checks`): loses its subject with U8 gone — no bump happens in this rollout; the deferred follow-up inherits the warning.
- **P2 — Q6's divergence test and first remedy covered only nixpkgs follows** (`frontend`'s `stryker-js-effect` input also follows its other producer inputs, and `frontend` builds the home repository's member tarballs through `systemfsoftware.lib.mkConsumerStore` with its own pkgs): resolved: Q6 defines divergence by result — the consumer's evaluated derivation path differs from the producer's — and the comparison runs for every consumer that overrides any producer input or calls a producer lib with its own pkgs (U7 step 4, R12); the first option now reads "align every `follows` override on the producer input and stop building producer outputs through such a lib call", with its cost stated.
- **P2 — the plan file named a private tracker key although committed to a public repository:** resolved: both occurrences (the old KTD11 and the second-round ruling above) replaced with the fact they stood for; the plan names no tracker key (KTD9, pack: public-repository, names-are-public-or-placeholders.md).
- **P2 — Stage 4 was plan-added scope the owner had not been asked about:** resolved by the owner ruling above; recorded as the deferred follow-up, not an exception.
- **P3 — A5's file-scope assumption contradicted U8's lockfile and override edits:** moot with U8 gone — every edit is again in `.github/`, `flake.nix` or `docs/`; A5 stands unchanged.
- **P3 — U6 claimed all eight repositories call release-management at `@main`; two call no shared workflow** (`qmd`, `effect-endgame-starter-kit`): resolved: U6's Dependencies names the six that do and states the two that call none.
- **P3 — A8 treated an in-flight push as an expected bump target:** moot with A8 deleted.
- **P3 — the Goal Capsule sized Stage 4 at up to 19 PRs; the population was 20:** moot with the Stage 4 profile line removed; the 20-repository count lives in the deferred follow-up.
- **P3 — quoted local command output could leak machine paths into public PR bodies** (R7 cited only the names rule; KTD9 banned names but not paths): resolved: R7 and KTD9 also carry the public-repository paths rule — absolute machine paths, usernames and host names become repository-relative paths or placeholders before any output enters a public PR title, body or commit message (pack: public-repository, people-and-paths-are-placeholders.md); U1's excerpt quoting points at it.
- **P3 — U8's narinfo check had no outcome for a path the producer's push may leave refused under R13:** moot with U8 gone; a consumer that references a refused path misses and builds from source under R5, and R13's report is the producer-side record.
- **FYI — a divergent consumer's U8 PR could land before the owner ruled on Q6:** moot with U8 gone; Q6 remains an owner question and no unit waits on it. The review's observation that the home repository itself evaluates producer outputs through a producer lib call with its own pkgs is verified against this repository's `flake.nix` and carried in Q6.
- **FYI — the home `sfs-deps` action skips its installer when Nix is already present on the runner:** observed, no change: no hosted-runner path is affected — on hosted runners the step runs; a runner with preinstalled Nix keeps its own settings, which is today's behavior.
- **Residual — R5 was proven only against an unreachable hostname, while a stale wildcard record can be a live host answering 404s, a certificate mismatch or a non-cache body:** weighed in U1: approach step 2 now also runs the block against a reachable host that is not the cache, before 21 repositories copy it; the risk row names both legs. A mismatched certificate is not separately exercised; the live-host leg covers the answering-host shape the scenario names.
- **Deferred question — whether the owner wants lock convergence inside this request:** answered by the owner ruling above; not added to Q1–Q5.
