---
title: A turbo cache that is never warm has its causes in the key, not the storage
date: "2026-08-08"
last_updated: "2026-08-10"
category: performance-issues
module: systemfsoftware
problem_type: performance_issue
component: tooling
symptoms:
  - "`pnpm check` reports `Cached: 0 cached, 89 total` on two back-to-back runs with no edits between them"
  - "The full gate costs roughly 3m40s to 12min on every invocation, warm tree or not"
  - "The same task hashes differently depending on whether an agent, a human, or CI invoked it"
  - "Running one shared package's lint changes an unrelated package's lint hash with no source edit"
  - "All 45 `lint` tasks miss on every run while `build`, `test`, `typecheck`, `attw`, and `api:check` each hit 100%, two days after the cache was declared fixed"
root_cause: config_error
resolution_type: config_change
severity: high
related_components:
  - turbo.json
  - package.json
  - .gitignore
  - packages/oxlint-config
  - packages/tsconfig
tags:
  - turbo
  - build-cache
  - cache-invalidation
  - input-hash
  - monorepo
  - pnpm
  - dprint
  - gitignore
---

# A turbo cache that is never warm has its causes in the key, not the storage

## Problem

The repo's single verification gate, `pnpm check`, reported `Cached: 0 cached, 89 total` on **every** run — including two consecutive runs with zero edits between them — and cost roughly 12 minutes each time. A healthy turbo monorepo hits cache on the second run. This one was permanently cold, and not from one bug: **three independent causes** were stacked in the lint and typecheck cache keys, with a fourth that briefly looked like a cause and was not.

## Symptoms

- `pnpm check` printed `Cached: 0 cached, 89 total` with zero hits on identical consecutive runs.
- Wall time per run: roughly 3m40s to 12min.
- The tell that this was not merely a slow build: zero hits across 89 tasks on an unchanged tree. A slow build still writes cache entries and warms. `0 cached` every run means every task's **key** moved between runs — turbo was re-running 89 tasks it had just run rather than restoring their verdicts.
- Task hashes differed by entry point: an agent run, a human run, and a CI run of the same command produced three different hashes.

## What Didn't Work

Three dead ends, all worth recording — because one of them _appeared to falsify the correct hypothesis_.

1. **"The cache directory is missing."** `node_modules/.cache/turbo` did not exist, which looked like the answer. It was not: turbo 2.x writes to `.turbo/cache`, which held 65,745 entries at 3.5 GB. The cache was healthy. Every task was missing its _key_, not its storage.

2. **"Something is rewriting the config files between runs."** A 30-second persistence probe — write a marker, `stat` the file every 5s — showed the shared config files stable, with no watcher running. The reverts observed earlier came from concurrent subagents editing the tree, not from a daemon. Ruling this out mattered: it forced the investigation onto turbo's own key composition.

3. **A double-run experiment appeared to falsify the input-invalidation hypothesis.** Runs B and C came back `FULL TURBO` (4.6s against 4m53s), which looked like proof that the inputs were not self-invalidating. The experiment was **invalid**. It ran with `--filter @systemfsoftware/effect-memfs`, which pruned the task graph to that package and its dependencies — and the pruning excluded `oxlint-config`'s own `lint` task, the very task whose run rewrites the volatile files that every dependent's lint key hashes. The filtered run never ran the invalidating task, so nothing rewrote the state, so the dependents' keys stayed still and the next run hit. Re-running unfiltered reproduced the miss immediately.

   **The reusable lesson:** a `--filter`-narrowed experiment cannot falsify a _cross-package_ invalidation hypothesis, because the filter removes the task that does the invalidating. To test whether task A's state invalidates tasks B through N, the run must include A. Scoping A out makes the mechanism unobservable and the negative result meaningless.

## Solution

Three fixes, landed together in `f3c9982155`, each removing one independent source of key churn. "Before" excerpts come from the commit diff; "after" excerpts are the live tree. That commit sits on the unmerged branch `feat/oxlint-plugin-tree-lint-baseline`, so the SHA may be rewritten by a squash or rebase merge — search the subject line rather than the hash if it does not resolve.

### Fix 1 — stop the key from varying by entry point

turbo's task hash includes the task's CLI args and the values of env vars declared in the task's `env` list. The root `lint` script passed `AGENT`-dependent oxlint args, and `AGENT` was declared in the lint task's `env`, so identical work hashed three ways:

| Invocation                             | Task hash          |
| -------------------------------------- | ------------------ |
| `pnpm lint` (`AGENT` set)              | `acae4b2d37410ba0` |
| `pnpm lint` (`AGENT` unset)            | different          |
| `pnpm check:ci` (`-- --format=github`) | `e5a3cef10baff315` |

Agent runs, human runs, and CI could never share an entry.

Before — root `lint` script:

```json
"lint": "pnpm format:check && turbo --concurrency=${TURBO_CONCURRENCY:-50%} lint ${AGENT:+-- --format=unix}",
```

After — `package.json:10`:

```json
"lint": "pnpm format:check && turbo --concurrency=${TURBO_CONCURRENCY:-50%} lint",
```

Before — lint `env` in `turbo.json`: `["NODE_ENV", "AGENT", "GITHUB_ACTIONS"]`. After — `turbo.json:123-126`, with `AGENT` removed:

```json
"env": [
  "NODE_ENV",
  "GITHUB_ACTIONS"
],
```

Proof: after the fix, `AGENT=1` and `AGENT` unset both yield lint hash `42bfc1139ca51517`, verified with `turbo lint --filter <pkg> --dry=json` under both env states.

Two qualifications, both verified against the tree. First, `lint` and `lint:ci` still differ — `lint:ci` passes `-- --format=github` (`package.json:11`) — so the human-versus-CI partition survives deliberately, keyed on `GITHUB_ACTIONS` (`turbo.json:125`). Only the agent-versus-human partition, the one poisoning the cache, is gone. Second, individual package lint scripts still branch on `AGENT`, for example `packages/effect-cell-types/package.json:43`:

```json
"lint": "oxlint . ${AGENT:+--format=unix --quiet}",
```

Dropping `AGENT` from the key despite that branch is safe, because `--format=unix --quiet` changes output presentation only, never the pass/fail verdict. The `AGENT`-dependent command form cannot produce a different cached answer, so pinning it into the key bought nothing and cost every hit.

### Fix 2 — negate volatile tool state out of shared-config input globs

`turbo.json` listed `$TURBO_ROOT$/packages/oxlint-config/**` and `$TURBO_ROOT$/packages/tsconfig/**` as `inputs` for every package's `lint` and `typecheck`. Those globs are unfiltered, so they swept in turbo's own per-task logs (`packages/oxlint-config/.turbo/turbo-lint.log`) and tsc's incremental state (`tsconfig.tsbuildinfo`, `tsconfig.node.tsbuildinfo`). Running `oxlint-config`'s own lint rewrote those files, invalidating the lint key of all 48 dependents. Every full run rewrote them, so the next run always missed.

After `f3c9982155` — **superseded, see Fix 4.** That commit negated the two kinds of
tool-written state it had observed:

```json
"$TURBO_ROOT$/packages/oxlint-config/**",
"!$TURBO_ROOT$/packages/oxlint-config/.turbo/**",
"!$TURBO_ROOT$/packages/oxlint-config/**/*.tsbuildinfo",
"$TURBO_ROOT$/packages/tsconfig/**",
"!$TURBO_ROOT$/packages/tsconfig/.turbo/**",
"!$TURBO_ROOT$/packages/tsconfig/**/*.tsbuildinfo"
```

The same negations went onto `typecheck`. This held for two days and then failed again: the
negation list named the volatile state that existed when it was written, and `coverage/` was
not on it. Fix 4 replaces the pattern rather than extending the list.

Proof: running only `oxlint-config`'s own lint flipped `effect-memfs#lint` from `f8072d86ba85f654` to `9264090e4456eb30` with no source edit in between.

### Fix 3 — a failing gate chained in front of turbo caches nothing

An untracked `research/` scratch tree held unformatted files, so `pnpm format:check` (`dprint check`, `package.json:14`) failed on every run. The root script chains it ahead of lint — `"lint": "pnpm format:check && turbo ... lint"` (`package.json:10`) — so lint never reached turbo, and turbo does not cache a failed run. Adding `research` to `.gitignore:21` fixed it, because dprint respects gitignore.

### Fix 4 — hash source, never generated output (2026-08-10)

Two days after Fix 2, `pnpm check` was slow again — 436s — and the shape of the miss named
the culprit before any file was read: **all 45 `lint` tasks missed on every run** while
`build` hit 46/46, `test` 43/43, `typecheck` 48/48, `attw` 36/36, and `api:check` 33/33. A
cache that healthy everywhere else is not a broken cache. It is one task with a moving key.

The moving file was `packages/oxlint-config/coverage/**`, written by that package's own
`test` task (`test.outputs: ["coverage/**"]`) and swept in by the unfiltered
`$TURBO_ROOT$/packages/oxlint-config/**` input Fix 2 left in place. `lint` does not
`dependsOn` `test`, so whether coverage existed at the moment a `lint` task hashed was a
scheduling race. The run summaries show it directly: the same
`@systemfsoftware/rx-effect#lint` task carried **42 inputs** in one run and **64** in the
next, the 22 extra files all under `../oxlint-config/coverage/`, with **zero changed hashes
among the inputs the two runs shared**. Nothing was edited; the input _set_ grew.

`coverage/` is gitignored (`.gitignore:4`). That is precisely what made the Fix 2 negation
list look complete, and it rests on a false premise: **an explicit turbo `inputs` glob does
not respect `.gitignore`.** Only `$TURBO_DEFAULT$` does. Every `$TURBO_ROOT$/…/**` entry
hashes ignored files too, so "gitignored output cannot be in the key" is wrong for exactly
the globs where it matters.

The same root cause had a second instance. `//#check:no-hand-rolled-jsonc` declared
`$TURBO_ROOT$/packages/**/*.{ts,mts,cts,js,mjs,cjs}` and hashed **421 generated files** out
of 1599 inputs — including `dist/` bundles whose filenames are content-hashed
(`Cause-BrqBsgxk.js`), so the contents _and the file set_ moved on every build. Its own
script already prunes them: `scripts/guard-no-hand-rolled-jsonc.mjs` hands `globSync` an
`EXCLUDED` list of `node_modules`, `dist`, `repos`, `coverage`, `reports`, `.stryker-tmp`,
`.worktrees`, and `.git`. The task was hashing a strict superset of what the script reads.

The fix inverts the shared-config globs to an allowlist, and mirrors the script's own
exclusions for the root guard:

```json
"$TURBO_ROOT$/packages/oxlint-config/src/**",
"$TURBO_ROOT$/packages/oxlint-config/package.json",
"$TURBO_ROOT$/packages/tsconfig/*.json",
"$TURBO_ROOT$/packages/tsconfig/bundler/**",
"$TURBO_ROOT$/packages/tsconfig/tsc/**"
```

`oxlint-config` is `private: true` and its `exports` point at `./src/*.ts` directly, so
`src/**` plus `package.json` is its entire consumable surface — nothing generated can
re-enter. `tsconfig` is config-only, so its JSON files are the whole surface.

Proof, and why a plain double-run does not establish it: `lint` has to be re-hashed _after_
something rewrites coverage, or the race never fires. Populate, force the rewrite, re-run:

```
turbo run lint //#check:no-hand-rolled-jsonc                     # populate
turbo run test --filter=@systemfsoftware/oxlint-config --force   # rewrite coverage/
turbo run lint //#check:no-hand-rolled-jsonc                     # 92 cached, 92 total, FULL TURBO
```

Before Fix 4 the equivalent third run (`turbo run lint`, 91 tasks) returned `46 cached` —
the 46 being exactly the `build` tasks, with all 45 `lint` tasks missing again.

The guard admits a sharper proof, because its defect was a count rather than a race: its
resolved input set went from 1599 files carrying 421 generated ones to **1178 carrying
zero** — the same total minus the same set. `turbo run <task> --dry=json` prints the
resolved input map, so a claim about what a task hashes is checkable in one second without
running the task, and is worth checking before believing any negation list.

### Fix 5 — delete the task rather than groom its globs (2026-08-10)

`//#format:check` ran `dprint check` through turbo. It declared six unbounded globs across
`packages/`, `scripts/`, `omp/`, `docs/`, and `.github/`, and hashed **2205 files, 443 of
them generated**, for a command that formats **1700** and honours `.gitignore` itself — so
`dist/`, `coverage/`, and `reports/` were hashed by turbo and then skipped by the tool that
was about to read them.

The task was `"cache": false`, so that hash had **no reader at all**. Unlike Fixes 2 and 4
nothing was mis-invalidated and no hit was lost; the entire cost was overhead paid on every
run to compute a key nothing consults.

The first attempt applied Fix 4's method and mirrored the same five negations, taking the
resolved set to **1762 files carrying zero generated ones** — the same total minus the same
set — and the task from **19s to 4.3s** against `dprint check`'s own **969ms**. That was
grooming a surface that should not exist: the negation list would have to grow for every
future `.next/` or `.venv/`, forever, to keep accurate a hash nobody reads.

So the task was deleted, and `check:ci` now opens with `pnpm format:check` outside turbo.
Three checks make that a subtraction rather than a regression:

- **No coverage is lost.** No package declares a `format:check` script — 0 of 49 scanned —
  so the turbo target only ever resolved to the root wrapper.
- **Every other caller already bypassed turbo.** `lint:ci` invokes `pnpm format:check`
  directly and `precommit` reaches dprint through lint-staged. The turbo wrapper was the
  outlier, not the convention.
- **Failures still cannot mask.** It is sequenced `s=0; pnpm format:check || s=1; turbo … ||
  s=1; exit $s` — the collect-every-failure idiom `lint:ci` already used, not the `&&` chain
  this doc warns about below. Verified across all eight outcome combinations: the exit status
  is 0 only when every step passes, and a dprint failure never stops turbo from running.

Be honest about the wall clock: this buys **nothing**. `//#format:check` ran in parallel with
262 other tasks, so its 4.3s was already hidden behind the 612s contract lane, and running
dprint serially costs roughly 1s more. What it buys is one fewer surface to maintain, and one
fewer `inputs` list a future reader could mistake for load-bearing — or flip to
`cache: true` and inherit a catastrophically incomplete key from.

The reading to carry: `cache: false` disables reuse, not hashing. `--dry=json` reports the
resolved input map for an uncacheable task exactly as for a cacheable one — but the better
question is why a sub-second, inherently uncacheable command was a turbo task at all.
**Subtract the surface before tuning it.**

### Fix 6 — pin the container image; a pin is not a licence to cache (2026-08-10)

Both `test:contract` lanes named their image as a moving tag, `node:22-alpine`. It is now a
pinned constant at `packages/stryker-js/cli/__tests__/global-setup.ts:22` and at
`packages/arethetypeswrong/cli/__tests__/global-setup.ts:22`. A tag is a **volatile input** in this repo's
sense: the lane's verdict can change with no repo change, and nothing in the key moves when
it does. Both are now pinned to the tag's manifest-list digest.

Which digest is the trap. `podman image inspect node:22-alpine --format '{{.Digest}}'`
returns `sha256:76789712…`, the **linux/amd64 platform manifest**. The manifest list is
`sha256:c610fcdf…` and carries 10 platforms including `linux/arm64/v8`; pinning the platform
digest silently breaks every non-amd64 runner. Only the registry answers authoritatively:

```
curl -sI -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/vnd.oci.image.index.v1+json' \
  https://registry-1.docker.io/v2/library/node/manifests/22-alpine | grep -i docker-content-digest
```

`podman manifest inspect … | sha256sum` does **not** reproduce it — podman re-serialises the
index, so that hash is a different value than the one the registry serves.

**The pin does not make the lane cacheable, and the reason previously recorded for `cache:
false` was too narrow.** That reason was that the container image is absent from the key.
The image is now in the key, and the lane still must not cache. The container runs `npm
install <tarballs>` with no lockfile (`packages/stryker-js/cli/__tests__/global-setup.ts:161-173`), and pnpm rewrites
`catalog:` to a floating range at pack time — the published
`@systemfsoftware/oxlint-plugin-cell-taxonomy` carries `"@oxlint/plugins": "^1.74.0"`, and
the CLI's own `effect` and `semver` resolve through `^3.22.1` and `^7.7.0`. External
dependencies therefore resolve from the live registry at run time. That is deliberate:
`CONCEPTS.md` defines the contract lane as installing the package exactly as it would be
published, into a clean container, so the unlocked install _is_ the test. A registry cannot
enter a cache key, so a cached green here would be a stale pass — the failure this repo
rates worse than a slow run.

Verified with the pin in place: both lanes green, `48 successful, 48 total`, exit 0, 381s
wall, the stryker lane 24/24 scenarios in 196s.

## Why This Works

turbo composes a task's cache key from the task **definition** (`inputs`, `env`, `outputs`, `dependsOn`, command string), the task's **CLI args**, and the **resolved hashes** of every file matched by `inputs`, plus the lockfile, root `package.json`, and `globalDependencies`. Each fix removes one source of movement:

- **Fix 1** removed two contributors whose values varied by entry point while the answer did not. The `${AGENT:+...}` conditional made the executed command differ between agent and human runs under one task definition, and `AGENT` in `env` made the hash read a variable with no bearing on the verdict. `GITHUB_ACTIONS` stays hashed because human and CI runs _should_ be allowed to differ.
- **Fix 2** removed from the hashed file set a class of files that a normal run _rewrites_. turbo writes per-task logs into each package's `.turbo/`, and tsc writes `*.tsbuildinfo`. Leaving them inside another package's `inputs` glob makes a dependent's key depend on the shared package's own side effects — a self-poisoning key. The negations exclude tool-written state while keeping the authored config (`oxlint.config.ts`, `tsconfig.json`) in the hash, which is the part that should invalidate. **Fix 2 was right about the mechanism and wrong about the method:** it enumerated the volatile state visible that day, which is a blacklist, and a blacklist over generated output is correct only until a tool writes somewhere new. `coverage/` arrived and the key moved again.
- **Fix 4** inverts the method. An allowlist of the consumable surface cannot admit a future `coverage/`, `dist/`, or `reports/` by default, so the class of bug closes rather than the instance. The second instance it closed — a root guard hashing 421 generated files its own script refuses to read — shows the same inversion applies wherever a task's `inputs` and its script's traversal are maintained separately.
- **Fix 3** was never a key problem. turbo caches successes only, and the chain short-circuited before turbo ran at all, so part of the "cold cache" was simply that nothing ever finished long enough to be cached.

Measured:

- Before: `Cached: 0 cached, 89 total`, 3m40s to 12min.
- After Fix 2 alone: 45 of 89 cached.
- After Fixes 1-3: `Cached: 89 cached, 89 total`, `>>> FULL TURBO`, 3.85s.
- Recurrence on 2026-08-10, graph now 263 tasks: `pnpm check` 436s at `212 cached, 263 total`, `lint` at 0 hits / 45 misses, 934s of lint CPU.
- After Fix 4: `260 cached, 263 total`, `lint` at 45 hits / 0 misses, reproduced on two consecutive full runs. The three uncached tasks were exactly the three the config then marked `cache: false` — two `test:contract` and `//#format:check` — so every cacheable task in the gate hits. Fix 5 later removed the third from turbo altogether, leaving the two contract lanes.
- Wall time after Fix 4 measured 352s, 503s, and 531s across three runs at that same hit rate — so quote the hit rate, never the wall. The two `test:contract` targets alone take **612s**, at 575s and 488s in parallel, and their per-task cost has been observed to swing four-fold, 112s to 575s, on container time alone.
- After Fixes 5-6, graph now 262 tasks: two consecutive full runs at `260 cached, 262 total`, 238s then 207s, the only misses being the two `cache: false` contract lanes. In the second, turbo reported a 200s graph of which `stryker-js-cli#test:contract` was **183s** and `arethetypeswrong-cli#test:contract` **63s** in parallel, with every other task restored in 0s — so the lane was ~92% of the critical path. Against the 575s and 488s recorded above for those same two lanes, container cost swung **3.1x and 7.7x with no code change**, which is the sharpest argument in this doc for quoting the hit rate and never the wall. The 669s run immediately before them carried only `46 cached` after a cache eviction; that 669s-to-207s gap is cache warmth, not a fix effect, and no fix in this doc should be credited with it.
- **The cacheable half of this gate is ~17s, and an earlier revision of this list said 113s.** turbo's run summary timestamps every task, so subtracting the graph's own start time separates the pre-task phase from task execution. In the steady-state run the first task started **16.3s** in, all 260 restores summed to **3.3s**, and the whole non-contract half spanned **16.9s** — 16.3s plus the 183s stryker lane accounts for the 200s graph exactly. The 113s came from one run whose pre-task phase alone took **90.4s**, taken immediately after a cache eviction; nothing reproduces it, and every run since sits near 16s. Quoting it as the steady-state cost of the cacheable half is the precise error the bullet above warns about, committed while writing the warning. Read the pre-task phase off the summary; never infer it by subtracting known task times from the wall.
- **That pre-task phase is input hashing, and on this host it is a filesystem cost, not a turbo one.** `--dry=json` over the same task list resolves **18,058 input entries** and takes **21-22s** with nothing executed, reproducible. `turbo daemon` does not reduce it — 20.8s, 21.4s, 25.4s with the daemon running against 22.4s, 22.5s without. The repo lives on a **virtio-fs** shared mount, where `stat` costs **700.2 us/file** against **1.8 us/file** on the VM's own btrfs disk, a 389x gap; 18,058 entries at 700 us is 12.6s of `stat` before any directory walk or content read. For scale, turborepo's own benchmark in [vercel/turborepo#11955](https://github.com/vercel/turborepo/pull/11955) hashes a **630-package** repo in **1.6s**, against our 22s for 49. So the lever is the mount, not `turbo.json` — and the same latency explains both the 90.4s outlier above and the four-fold container swings.
- **Do not reach for a turbo upgrade or literal input paths for this.** Every merged hashing optimisation — [#11887](https://github.com/vercel/turborepo/pull/11887), [#11902](https://github.com/vercel/turborepo/pull/11902), [#11955](https://github.com/vercel/turborepo/pull/11955), [#12199](https://github.com/vercel/turborepo/pull/12199), [#13273](https://github.com/vercel/turborepo/pull/13273) — is already in the 2.10.5 we run, which shipped 2026-07-13, after the last of them merged 2026-07-06. And #11955, the one that converts literal `inputs` paths from a glob walk to a single `stat`, is measured by its own author at **1.02x, within system noise** on wall clock; it saves CPU, not time. Both are dead ends worth not re-walking.
- So the contract lane is 85-92% of this gate's wall clock across measurements, and it is `cache: false` by deliberate design rather than by omission. **A warm cache was never going to make this gate fast, and that is not a defect in either one.** What the cache fix bought is 934s of lint CPU that no longer runs and 45 tasks that no longer re-execute on an unchanged tree; what it cannot buy is wall time inside two uncacheable container tests. Diagnosing "the gate is slow" therefore has to name which half is slow first, or the cache takes the blame for the lane's cost — which is exactly the wrong turn this doc's own recurrence began with.

## Prevention

- **Never glob a package directory as a turbo `input`; list its consumable surface instead.** `$TURBO_ROOT$/packages/<name>/**` cannot be made safe by negation, because an explicit `inputs` glob ignores `.gitignore` — only `$TURBO_DEFAULT$` respects it. Every future `coverage/`, `dist/`, `reports/`, or `.stryker-tmp/` silently re-enters the key and the negation list has to be extended again; this repo paid for that twice on the same glob, two days apart. Name the surface instead: `src/**` plus `package.json` for a source-exporting package, the config files for a config package. _Mechanisable:_ a JSON check over `turbo.json` rejecting any `inputs` entry that is a package directory root followed by `/**`.
- **A task's declared `inputs` must mirror what its command actually reads.** `//#check:no-hand-rolled-jsonc` pruned `dist`, `coverage`, `reports`, `.stryker-tmp`, and `.worktrees` inside the script while its turbo `inputs` hashed all of them — 421 generated files, so the task could never hit. When a script carries its own ignore list, that list _is_ the input contract, and drifting from it costs the whole task's cache while looking correct. _Mechanisable:_ assert each root guard's `inputs` negations cover the skip list in the script it runs.
- **Keep CLI args identical across entry points that must share a cache; split entry points on an env var instead.** Args and declared `env` vars are part of the key, so varying them per entry point partitions the cache into disjoint sets. Where one entry point genuinely must differ, key it on a variable every run sets deterministically (`GITHUB_ACTIONS`), never on one that only some runs happen to have set (`AGENT`). _Mechanisable:_ assert root `lint*` scripts differ in args only where an `env`-declared variable also differs.
- **Never `&&`-chain a gate in front of a turbo run.** A permanently-red early step reads exactly like a permanently-cold cache. Either run the gate as its own turbo task, or sequence it with `|| s=1` and a collected exit status, as `check:ci` and `lint:ci` both now do for `dprint`. What matters is that an early failure cannot stop the graph behind it.
- **Prove the cache is the problem before rebuilding anything.** Confirm the real cache location for the turbo major version in use, confirm key churn with `turbo <task> --dry=json` across two runs, and never use a scoped `--filter` to test a cross-package invalidation — the filter removes the invalidating task and hands back a false negative.
- **A `cache: false` task still pays for its `inputs` — so ask why it is a task.** Turning caching off stops reuse, not hashing, so an over-broad glob on an uncacheable task is pure overhead with no miss rate to reveal it: `//#format:check` hashed 2205 files, 443 generated, to decide nothing, costing 18s beyond the 969ms its command needed. Tightening those globs to 1762 files was grooming; deleting the task was the fix. Before tuning an uncacheable task's inputs, establish that the command belongs in turbo at all. _Mechanisable:_ reject any `cache: false` task whose `inputs` resolve to more files than its command reads.
- **Pin a container image by its manifest-list digest, and never read a pin as permission to cache.** A moving tag lets a lane's verdict change with no repo change; the platform digest that `podman image inspect` hands you pins one architecture and breaks the rest. Pinning closes the image hole only — a lane that installs from the live registry stays uncacheable however much of it is pinned, because the remaining input is not a file. _Mechanisable:_ assert every image reference in a `__tests__/` setup carries an `@sha256:` digest.

## Related Issues

- [`../tooling-decisions/turbo-cache-requires-complete-input-hash.md`](../tooling-decisions/turbo-cache-requires-complete-input-hash.md) — the same `turbo.json` cache-key surface in the **opposite failure direction**, and the direct antecedent of this bug. That doc covers an _incomplete_ key producing false-green hits while turning the `typecheck` cache on; this one covers an _over-broad and volatile_ key producing permanent misses. They are two clauses of one doctrine: the key must move exactly when the answer can change, and never otherwise. Note that its worked examples are stale against the tree — it shows the lint `env` as `[NODE_ENV, AGENT, GITHUB_ACTIONS]` (now `[NODE_ENV, GITHUB_ACTIONS]`) and shows the `oxlint-config` and `tsconfig` input globs in their original unfiltered form, which Fix 2 negated and Fix 4 then replaced with source allowlists.
- [`../build-errors/turbo-build-cycle-from-self-hosted-devdeps.md`](../build-errors/turbo-build-cycle-from-self-hosted-devdeps.md) — the same root `turbo.json` surface on the graph side (a `dependsOn` cycle) rather than the key side. Reinforces that turbo task definitions are a correctness surface for the gate, not just a performance knob.
- [`../architecture-patterns/provenance-ritual-gates.md`](../architecture-patterns/provenance-ritual-gates.md) — the gate-provenance family. Its `guard-no-hand-rolled-jsonc.mjs` is the script whose `EXCLUDED` list Fix 4 mirrors into `turbo.json`, and the source of the script-versus-task input contract in Prevention.
- [`../build-errors/stale-api-report-outlives-toolchain.md`](../build-errors/stale-api-report-outlives-toolchain.md) — the stale-pass direction of the same doctrine: a cached verdict outliving the toolchain that produced it, where this doc covers verdicts that can never be reused at all.
- Fix commit: `f3c9982155` — `build(global): make the lint cache actually hit`.
- Fixes 4, 5, and 6: on branch `turbo-fix`, unmerged as of this writing — the `coverage/` allowlist and root-guard negations, the removal of `//#format:check` from turbo, and the two contract-lane digest pins. Cite the PR rather than a bare SHA once it opens; branch commits here get rewritten.
