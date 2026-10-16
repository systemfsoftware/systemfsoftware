---
title: Turbo decides which tasks run, which packages a change touched and which results are reused; anything beside it is on a closed list and says why
applies_when:
  - changing a task's `inputs`, `outputs`, `cache`, `env` or `dependsOn`, or the `globalDependencies`, in `turbo.json`
  - adding or changing a CI or release step that decides which turbo tasks or packages run, or that restores, saves or serves turbo's cache
  - adding or changing a script, action or tool setting that classifies changed files, lists affected or touched packages, records which task hashes passed, or skips work on any signal other than turbo's
  - working on a slow build, cache misses, CI task scope or the task graph in a repository with turbo
tags: [turbo, ci, caching, affected, task-graph, inputs, workflows]
---

Turbo hashes every task from its declared inputs and its dependencies' hashes, so it already answers three questions a CI job asks: which tasks this range of commits affects, which packages it touched, and which results are already known. A job that answers them a second way, from a path list, a fixed package list or a hash record of its own, drifts from turbo's answer and runs work turbo would skip.

That drift has cost whole heavy runs. In this repository on 2026-10-09, the Mutation planner packed every package carrying a `mutation` script, and runs 37952058012 and 37980363240 each ran 21 mutation jobs, 337 and 340 job-minutes, on two commits that only vendored files under `repos/` (`d204dfb27c`, `e8dc041ba0`); for both, `turbo query affectedTasks(base: "<c>^", head: "<c>", tasks: ["mutation"])` returns 0 tasks. In the public stryker-js-effect on 2026-10-10, a mutation workflow keyed on a hand-kept `paths-ignore` list and a fixed four-project corpus ran 46 jobs, 183 job-minutes, for `ee2c4cfb03` (run 38044574382), a commit turbo says affects one root task and no task of any corpus package.

## Rule

In a repository with turbo, which tasks a CI or release job runs, which packages a change touched and which results are reused are decided by turbo; code beside turbo that does any of those is allowed only for the closed list below, each with a comment naming the item.

- **Selection:** `turbo run --affected`, `--filter=...[<base>]`, `turbo query affectedTasks` or `affectedPackages`, or turbo's dry run, on a checkout holding the history the base reaches (`fetch-depth: 0`), since turbo counts every package as changed on a checkout too shallow to reach it. A job that runs a fixed list of packages, or skips on a path list, does not decide what is affected.
- **What changed:** by default turbo's affected selection is per package: a change anywhere in a package selects all of its tasks. When an edit should not run a task (a docs or README edit, say), `turbo.json` sets `futureFlags.affectedUsingTaskInputs` and the task's `inputs` exclude that edit; a path classifier is not the remedy. A gate deciding which packages changed (a release or changeset gate) reads a turbo task hash, never a list of the paths a package owns; which task's hash is that gate's own decision (systemfsoftware keys its changeset gate on `#build`: https://github.com/systemfsoftware/systemfsoftware/blob/763fd6639979ec955dcb004e6d4d97e1cb49f9eb/docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md).
- **Reuse:** turbo's own cache, never a record of passed hashes kept beside it. A public repository carries `.turbo/cache` through the host CI's cache with no credential or cloud account, written on main and restored by pull requests. A host cache key is written once and a later save under it is skipped, not merged (systemfsoftware's record of two lanes racing on one key: https://github.com/systemfsoftware/systemfsoftware/blob/763fd6639979ec955dcb004e6d4d97e1cb49f9eb/docs/solutions/integration-issues/parallel-lanes-race-on-one-immutable-cache-key.md), so parallel jobs never save under a shared key: each saves under its own, or one job after them merges their cache directories into a single save, rather than a record kept beside the cache. A pull request restores what main cached, so a task whose outputs or logs can carry a credential is `cache: false`. A private or fleet repository may use turbo's remote cache, which a pull request reads and never writes (`--cache=local:rw,remote:r`). Where systemfsoftware's `ci-wall-clock` is enrolled, the public/private boundary is its `flake-outputs-build-once-on-main`.
- **Evidence:** a change made for build speed, cache misses, task scope or the task graph shows, where it is reviewed, the `turbo query` output for the range it changes (`affectedTasks` or `affectedPackages`, and `boundaries` where a dependency is at issue); a statement that turbo was consulted is not evidence.
- **Closed list,** each item named in a comment where the code sits:
  - artifacts no turbo task produces, such as Nix store paths;
  - a tool's own record finer than a task, such as a mutation tool's incremental report, which turbo can only cache whole; it is carried, never used to decide what runs;
  - packing tasks into jobs by measured duration and splitting a package into shards: turbo 2.11.5's `turbo run --help` offers `--concurrency` and no shard or distribution option, so the measured history and the packing are outside turbo;
  - finding the base commit, which turbo cannot know CI judged green.

```yaml
# WRONG: systemfsoftware/stryker-js-effect ee2c4cfb03:.github/workflows/mutation.yml:3-9,33-36,361-366
# A hand-kept paths-ignore list and a fixed corpus decide what runs. At ee2c4cfb03 (docs,
# workflows and scripts/change-lane.ts) this ran 46 jobs, 183 job-minutes (run 38044574382);
# turbo affects one root task there and no task of any corpus package.
on:
  push:
    branches: [main]
    paths-ignore:
      - "**/*.md"
      - ".changeset/**"
      - "docs/**"
# ...
env:
  TARGET_SECONDS: 200
  MAX_SHARDS: 20
  PROJECTS: packages/stryker-js,packages/stryker-js-typescript-checker,packages/stryker-js-vitest-runner,test/e2e-core
# ...
  kill-matrix:
    name: Kill matrix
    if: ${{ (github.event_name == 'push' && github.event.head_commit.author.username != 'github-actions[bot]') || github.event.inputs.lane == 'kill-matrix' }}
    permissions:
      contents: read
    uses: ./.github/workflows/kill-matrix.yml

# WRONG: systemfsoftware/systemfsoftware 8d07118079:.github/workflows/reusable-mutation.yml:117-118
# The planner packs "every package that has the --task script" (scripts/tools/test-timings.ts:6-7);
# nothing asks turbo first. Runs 37952058012 and 37980363240: 21 jobs each, 0 affected tasks.
          test-timings plan --task mutation --target "$TARGET" --max-jobs "$MAX_JOBS" --max-seconds "$MAX_SECONDS" \
            --unknown-seconds "$TARGET" --record .timings/previous/mutation-timings.json 2>&1 | tee "$RUNNER_TEMP/sfs-logs/plan.log"

# RIGHT: neutral shape, no citation. Turbo names the affected mutation tasks; the job packs
# only those and plans nothing when turbo selects nothing. In this shape turbo is a root
# devDependency at a pinned version, so the frozen install provides it; jq ships on the runner.
  plan:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
      actions: read # the base lookup lists this workflow's runs
    outputs:
      tasks: ${{ steps.affected.outputs.tasks }}
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - id: checkout
        uses: actions/checkout@v7
        with:
          fetch-depth: 0
          filter: tree:0
      - id: node
        uses: actions/setup-node@v6
        with:
          node-version: 24
      - id: install
        run: corepack pnpm install --frozen-lockfile
      - id: base
        env:
          GH_TOKEN: ${{ github.token }}
          WORKFLOW: ${{ github.workflow_ref }}
        run: |
          # Closed list: the base commit. Turbo cannot know which commit this lane judged green.
          # Any trigger counts, so a dispatch-only lane finds its own last green run. No base
          # plans every task, the fallback ci-wall-clock's pr-gate-runs-only-what-the-diff-affects
          # prescribes; `why` records which case it was, so a failed lookup is visible.
          file="${WORKFLOW%@*}"; file="${file##*/}"
          if ! base="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$file/runs?branch=main&status=success&per_page=1" \
              --jq '.workflow_runs[0].head_sha // empty')"; then
            base="" why="lookup failed"
          elif [ -z "$base" ]; then
            why="no green run on main"
          elif ! git merge-base --is-ancestor "$base" HEAD; then
            base="" why="last green run is not an ancestor"
          else
            why="last green run"
          fi
          { echo "sha=$base"; echo "why=$why"; } >> "$GITHUB_OUTPUT"
      - id: affected
        env:
          BASE: ${{ steps.base.outputs.sha }}
          WHY: ${{ steps.base.outputs.why }}
        run: |
          # Turbo's dry run selects: with a base, only the tasks a change since it affects. The
          # reproduce below runs the same command. A failing turbo fails the step at the assignment.
          args=()
          if [ -n "$BASE" ]; then
            export TURBO_SCM_BASE="$BASE" TURBO_SCM_HEAD="$GITHUB_SHA"; args=(--affected)
          fi
          out="$(corepack pnpm exec turbo run mutation "${args[@]}" --dry=json)"
          tasks="$(jq -c '[.tasks[] | select((.taskId | endswith("#mutation")) and .command != "<NONEXISTENT>") | .taskId]' <<< "$out")"
          echo "base: ${BASE:-none} ($WHY), $(jq length <<< "$tasks") affected mutation task(s)" >> "$GITHUB_STEP_SUMMARY"
          echo "tasks=$tasks" >> "$GITHUB_OUTPUT"
      # Closed list: packing by measured duration. The planner reads only the tasks above.
      # A summary meeting ci-wall-clock's failures-name-the-gate-and-location. systemfsoftware's
      # own failure-summary gives a listed step whose outcome is `cancelled` the `timed-out` code
      # (its action.yml:43-49), so a step the backstop cancels is named.
      - id: summary
        if: failure() || cancelled()
        uses: ./.github/actions/failure-summary
        with:
          job: plan
          reasons: |
            install install-failed
            affected plan-failed
          steps: ${{ toJSON(steps) }}
          reproduce: ${{ steps.base.outputs.sha && format('TURBO_SCM_BASE={0} TURBO_SCM_HEAD={1} corepack pnpm exec turbo run mutation --affected --dry=json', steps.base.outputs.sha, github.sha) || 'corepack pnpm exec turbo run mutation --dry=json' }}
      - id: wall-time
        if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
```

Grounds: Turborepo, `turbo run` reference (https://turborepo.com/docs/reference/run): `--affected` is by default "equivalent to `--filter=...[main...HEAD]`"; "If the checkout is too shallow, then all packages will be considered changed."; and "You can override the default base and head with their respective System Environment Variables" (`TURBO_SCM_BASE`, `TURBO_SCM_HEAD`). Turborepo, "Caching" (https://turborepo.com/docs/crafting-your-repository/caching): results are stored "in the `.turbo/cache` directory". Turborepo, "Support policy" (https://turborepo.com/docs/support-policy): "`--remote-cache-read-only`: Use `--cache=local:rw,remote:r` instead.". GitHub, "Dependency caching reference" (https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching): a cache "created by a workflow run triggered on a pull request ... can only be restored by re-runs of the pull request", so a pull request cannot write what main reads. The affected-task counts above come from `turbo query` (turbo 2.11.5) run in each repository at the cited commits. Turborepo, `futureFlags` reference (https://turborepo.com/docs/reference/configuration): "Without this flag, `--affected` operates at the package level: if any file in a package changed, all tasks in that package are selected. With this flag, `--affected` operates at the task level: a task is only selected if the changed files match its inputs configuration." In stryker-js-effect, which does not set the flag, the docs-only commit `1b3e60fc` selects `//#typecheck:node` with reason `TaskAllChanged`, although that task's `inputs` are `tsconfig.node.json`, `commitlint.config.ts` and `.lintstagedrc.js`; the fix for a docs edit that runs a task is the flag plus the task's `inputs`, not a path list.

Gate: `review`. Does the diff add or change a way of deciding which tasks run, which packages a change touched or which results are reused that is not turbo (a path list or classifier, a fixed package list, a record of passed hashes, a skip or cache gate), outside the closed list or without the comment naming its item? Does a cache step let a pull request write a cache main reads, let two jobs save under one cache key, put a remote-cache credential in a public repository, or cache a task whose outputs or logs can carry a credential? Does a selection run on a checkout too shallow to reach its base? Does a change made for build speed, cache misses or task scope show its `turbo query` output?
