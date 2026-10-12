---
title: No CI job or test has the repo's own docs, plans or layout as its subject
applies_when:
  - adding a CI job, check or test, or changing what one validates
  - adding a step or an action to a lane that reads the repo's own docs, plans or file layout
  - deciding whether a tooling repo's check of its own tool is a product test
tags: [ci, workflows, testing, scope, tooling, docs]
---

A job whose subject is the repo itself spends every run grading something no user receives. This repo's `gate:repo` built an upstream-test grader package and ran its selftest on every run, and the static lane fetched upstream family refs for it, while no tracked file declared a family manifest: #727 records that "the package graded nothing and only ran its own selftest in `gate:repo`". `gate:upstream` ran a `guard:upstream` task that no package defined, so its only work was test tasks other gates already ran. #727 (`17bc8afeaf`) deleted the grader package, its selftest, the family-ref fetch and `gate:upstream`; the `repo-checks` run that starts `gate:repo` stayed.

In a tooling repo, a test of the tool the repo ships is a product test, even when it runs in this repo's lanes.

## Rule

No CI job or test has the repo's own docs, plans or layout as its subject. A check of a tool the repo ships, run against a planted violation, tests that product and is allowed.

```yaml
# WRONG: systemfsoftware/systemfsoftware 04b03ab26b:package.json:19,21
# A task no package defined, and the upstream-manifest selftest after `&&`: a grader of the
# repo's own tests run on every gate. The `repo-checks` run before it is out of this excerpt's
# claim; whether its `single-plan` check (root `AGENTS.md` REPO-D2) is a docs grader is open
# for the root.
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

# RIGHT: systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/checks-lane/action.yml:55-58,60-68
# repo-checks is a flake package this repo ships (flake.nix:86-89). The lane requires each
# check to exit 1 on a planted violation: a test of the shipped tool. The excerpt leaves out
# :59, where the lane builds the tool on every run; `flake-outputs-build-once-on-main`
# condemns that build, and `$bin` here is the copy main built.
    - name: Each repo check fails on a planted violation
      if: inputs.lane == 'static'
      shell: bash -e {0}
      run: |
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
