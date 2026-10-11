---
title: No lint, typecheck or test job enters a Nix dev shell
applies_when:
  - adding or editing a lint, typecheck or test job in .github/workflows
  - adding a dev-shell action or a `nix develop` step to such a job
  - wrapping a verdict step in `nix develop --command`
tags: [ci, dev-shell, lint, typecheck, test, nix]
---

A dev shell is the environment a person develops in. A verdict job that enters one waits for all of it before its first check. In the public effect-endgame-starter-kit's pull-request run 37919809442, every `check` lane spent 559 to 714 seconds in its dev-shell step, then ran a gate of 9 to 262 seconds: typecheck waited 559 seconds for 9 seconds of work, lint 671 seconds for 12.

## Rule

No lint, typecheck or test job enters a Nix dev shell.

- No dev-shell action in the job.
- No `nix develop` step, and no verdict step wrapped in `nix develop --command`.
- The job fetches its pinned tools and installs the workspace frozen (`setup-under-a-minute`).

```yaml
# WRONG: systemfsoftware/effect-endgame-starter-kit 375e468:.github/workflows/ci.yml:40-59
# Dev-shell step 559-714 s per lane, gate 9-262 s (run 37919809442).
    runs-on: ${{ matrix.runs-on }}
    timeout-minutes: 45
    env:
      CI: "true"
      OXLINT_FORMAT: github
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: ./.github/actions/dev-shell
      - name: Turbo cache
        uses: actions/cache@v6
        with:
          path: .turbo/cache
          key: turbo-${{ runner.os }}-dist-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-dist-
            turbo-${{ runner.os }}-
      - name: Gate
        run: nix develop --command ${{ matrix.gate }}

# RIGHT: systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/install-deps/action.yml:17-30
# A pinned Node runtime and a frozen pnpm install, with no Nix: 17 s in run 38113391870.
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

Gate: `review`. Does any lint, typecheck or test job in the diff use a dev-shell action, run `nix develop`, or wrap a step in it?
