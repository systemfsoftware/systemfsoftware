---
title: Commit-message, changeset and PR-title checks run their pinned tool directly
applies_when:
  - adding or editing a commit-message, changeset or PR-title check job
  - adding a producer job, a `needs:` or a workspace install to such a job
  - entering a dev shell in such a job
tags: [ci, checks, commit-message, changeset, pr-title, lightweight]
---

A commit-message, changeset or PR-title check reads a few lines of text with one tool. Everything it carries before that tool is wait time on the fastest answer a pull request can get. In the public effect-endgame-starter-kit, commitlint entered the Nix dev shell for 632 seconds before a 10-second lint step (run 37919809374). This repo's commitlint needs a tarball producer job and a workspace install first: in run 38105406935 the producer took 19 seconds and the lint job 33 more, 13 of them installing the workspace. The producer is the `sfs-deps` action, whose cold call took 219 seconds in run 38096023335.

## Rule

A commit-message, changeset or PR-title check runs its pinned tool directly, with no workspace install, dev shell or producer job before it.

- No workspace install (`pnpm install`, `npm install`, `yarn install`) before the check.
- No dev shell (`nix develop`, a dev-shell action, a command wrapped in one).
- No `needs:` on another job, such as a producer job.
- The tool comes from one pinned fetch and runs as fetched.

```yaml
# WRONG: systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/reusable-commitlint.yml:27-31,59-64,82-85
# A producer job, then `needs: sfs-deps`, then a workspace install, all to lint commit messages.
  sfs-deps:
    name: sfs-deps · tarballs the lockfile names
    if: github.event_name == 'pull_request' && github.actor != 'dependabot[bot]'
    runs-on: ${{ fromJSON(inputs.runs-on) }}
    timeout-minutes: 60
  # ...
  commitlint:
    name: lint PR commits
    needs: sfs-deps
    if: github.event_name == 'pull_request' && github.actor != 'dependabot[bot]'
    runs-on: ${{ fromJSON(inputs.runs-on) }}
    timeout-minutes: 5
      # ...
      - id: install
        uses: $/.github/actions/install-deps
        with:
          working-directory: ${{ inputs.working-directory }}

# WRONG: systemfsoftware/effect-endgame-starter-kit 375e468:.github/workflows/commitlint.yml:21-22
# 632 s in the dev shell, then a 10 s lint (run 37919809374).
      - uses: ./.github/actions/dev-shell
      - run: nix develop --command sandbox -- pnpm exec commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose

# RIGHT: neutral shape built from the install-free job of this repo's changeset check
# (`changeset-check.yml:18-32` at 02bf9653b1, 17 s in run 38105407053) with the 60-minute
# backstop and the wall-time summary that one-stuck-job-backstop requires.
  packed-manifest:
    name: changeset · a packed-manifest change needs an intent
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: denoland/setup-deno@v2
      - name: Every package whose packed package.json moved is released by a pending intent
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
        run: >-
          deno run --config=scripts/deno.jsonc --lock=scripts/deno.lock --frozen --allow-read --allow-env --allow-run=git
          scripts/tools/repo-checks/cli.ts packed-manifest --base "$BASE_SHA"
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
```

The cited job is the install-free shape this rule asks for; its own `timeout-minutes: 5` and missing wall-time summary are condemned by `one-stuck-job-backstop`, so the RIGHT above carries both.

Gate: `review`. Does a commit-message, changeset or PR-title job in the diff install the workspace, enter a dev shell, or `needs:` another job before running its tool?
