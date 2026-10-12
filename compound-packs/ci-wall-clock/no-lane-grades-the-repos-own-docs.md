---
title: No CI job or test has the repo's own docs, plans or layout as its subject
applies_when:
  - adding a CI job, check or test, or changing what one validates
  - adding a step or an action to a lane that reads the repo's own docs, plans or file layout
  - deciding whether a tooling repo's check of its own tool is a product test
tags: [ci, workflows, testing, scope, tooling, docs]
---

A job whose subject is the repo itself spends every run grading something no user receives. This repo's `gate:repo` built an upstream-test grader package and ran its selftest on every run, and the static lane fetched upstream family refs for it, while no tracked file declared a family manifest: #727 records that "the package graded nothing and only ran its own selftest in `gate:repo`". `gate:upstream` ran a `guard:upstream` task that no package defined, so its only work was test tasks other gates already ran. #727 (`17bc8afeaf`) deleted all of it.

In a tooling repo, a test of the tool the repo ships is a product test, even when it runs in this repo's lanes.

## Rule

No CI job or test has the repo's own docs, plans or layout as its subject. A check of a tool the repo ships, run against a planted violation, tests that product and is allowed.

```yaml
# WRONG: systemfsoftware/systemfsoftware 04b03ab26b:package.json:19,21
# A task no package defined, and a grader of the repo's own tests run on every gate.
    "gate:upstream": "turbo --concurrency=${TURBO_CONCURRENCY:-50%} guard:upstream",
    "gate:repo": "nix run --no-write-lock-file .#repo-checks -- subtrees release-age project-membership single-plan --plans docs/plans --base origin/main && pnpm --filter @systemfsoftware/upstream-manifest build && node packages/upstream-manifest/dist/cli.mjs --selftest",

# WRONG: systemfsoftware/systemfsoftware 04b03ab26b:.github/actions/checks-lane/action.yml:51-61
# The static lane fetched refs declared by files the repo did not track.
    - name: Fetch the declared upstream family refs
      if: inputs.lane == 'static'
      shell: bash -e {0}
      run: |
        command -v jq >/dev/null || { echo "jq is required to read upstream-family.json source refs" >&2; exit 1; }
        refs="$(git ls-files | grep -E '(^|/)upstream-family.json$' | grep -v '^repos/' | xargs -r -n1 jq -r '.source.ref' | sort -u)"
        while IFS= read -r ref; do
          if [ -n "$ref" ]; then
            git fetch --no-tags --depth=1 origin "$ref"
          fi
        done <<< "$refs"

# RIGHT: systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/checks-lane/action.yml:55-68
# repo-checks is a flake package this repo ships (flake.nix:86-89). The lane builds it and
# requires each check to exit 1 on a planted violation: a test of the shipped tool.
    - name: Each repo check fails on a planted violation
      if: inputs.lane == 'static'
      shell: bash -e {0}
      run: |
        bin="$(nix build --no-link --print-out-paths .#repo-checks)/bin/repo-checks"
        orig="$(git rev-parse HEAD)"
        commit() { git -c user.name=plant -c user.email=plant@localhost commit -q --no-verify -m "$1"; }
        restore() { git reset -q --hard "$orig"; }
        expect_violation() {
          status=0
          "$bin" "$@" || status=$?
          test "$status" -eq 1 || { echo "::error::repo-checks $* must exit 1 on its planted violation, got $status" >&2; exit 1; }
          restore
        }
```

Tests of a shipped tool test its published surface (`CONSTITUTION.md` CONST-T8).

Gate: `review`. Does the diff add a CI job or test whose subject is the repo's own docs, plans or layout rather than a product's or a shipped tool's behaviour?
