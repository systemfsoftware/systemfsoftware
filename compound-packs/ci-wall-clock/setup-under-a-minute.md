---
title: A pull-request job reaches its first verdict step within 60 seconds
applies_when:
  - adding or changing a job a pull request triggers in `.github/workflows`
  - adding or changing a composite action under `.github/actions` that a pull-request job runs before its first verdict step
  - adding steps before a pull-request job's first verdict step
  - adding or changing a build step in a pull-request job or the reusable workflow it calls
tags: [ci, workflows, actions, setup, pr-jobs, wall-clock, build]
---

Every second a pull-request job spends before its verdict is a second the author waits for an answer the job could already give. This repo's Changeset Check calls a shared changeset job whose verdict step takes 2 seconds; in run 38105407053 that job spent 119 of its 160 seconds in a `nix build` of the release tools it fetches at its own revision, before any check ran. The same run's packed-manifest job, which fetches one pinned tool and runs it, finished in 17 seconds.

## Rule

A pull-request job reaches its first verdict step within 60 seconds: only checkout, one pinned tool fetch, a cache or substituter restore and a frozen install come before it, never a source build or a workspace bootstrap. A pull-request job may build an artifact without saving it in two cases only: its diff changes that artifact's inputs, or the restore of main's key misses (for example, after eviction). `flake-outputs-build-once-on-main` relies on these two cases.

The 60 seconds is measured from the run's job steps (each step's `started_at` and `completed_at` in the Actions jobs API, written to the step summary under `one-stuck-job-backstop`). Review checks the shape that produces it: what the diff puts before the first verdict step.

```yaml
# WRONG: systemfsoftware/pnpm-release-management 8cd6e83009:.github/workflows/changeset-check.yml:63-73
# A source build before the verdict: 119 s of a 160 s job in run 38105407053.
      - uses: cachix/install-nix-action@v31
        if: runner.environment == 'github-hosted'

      - name: Build the release tools at this workflow's own revision
        env:
          WORKFLOW_REPOSITORY: ${{ job.workflow_repository }}
          WORKFLOW_SHA: ${{ job.workflow_sha }}
        run: |
          tools=$(nix build --no-link --print-out-paths \
            "github:${WORKFLOW_REPOSITORY:?job.workflow_repository is empty}/${WORKFLOW_SHA:?job.workflow_sha is empty}#release-tools")
          echo "RELEASE_TOOLS=$tools/bin" >> "$GITHUB_ENV"

# RIGHT: systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/install-deps/action.yml:17-30
# A pinned runtime fetch and a frozen install: 17 s in run 38113391870. The citation
# shows only the setup shape; the job that ran it is condemned by
# `pr-gate-runs-only-what-the-diff-affects`.
    - uses: $/.github/actions/setup-node-runtime
      with:
        working-directory: ${{ inputs.working-directory }}
    - name: Install dependencies
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      env:
        FROZEN: ${{ inputs.frozen-lockfile }}
      run: |
        if [ "$FROZEN" = "true" ]; then
          corepack pnpm install --frozen-lockfile
        else
          corepack pnpm install
        fi
```

Gate: `review`. Does any pull-request job in the diff run a source build, a workspace bootstrap, or anything else beyond checkout, one pinned tool fetch, a restore and a frozen install, before its first verdict step? Building an artifact without saving it passes only when the diff changes that artifact's inputs or the restore of main's key misses.
