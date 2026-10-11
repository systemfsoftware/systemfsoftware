---
title: A release reads the commit's recorded verdicts and promotes what they proved, never rebuilding or retesting it
applies_when:
  - adding or changing a release, deploy, tag or publish job
  - adding a `needs:`, a build step or a test step to a release workflow
  - adding a scripted check that runs against a deployed stage
tags: [ci, release, promotion, verdicts, staging]
---

A release that rebuilds and retests ships something main never judged and waits on suites main already ran. In the public effect-endgame-starter-kit, the production deploy `needs: [ci, plan, mutation]` and deploys from the checked-out source (`nix develop --command pnpm run deploy`, which runs `alchemy deploy`), so a release waits on mutation shards whose jobs carry `timeout-minutes: 75` and then ships no artifact a verdict recorded (`.github/workflows/release-gate.yml:40,79-97`). The shared release workflow this repo calls builds `.#workspace-tarballs` again inside the release job (`pnpm-release-management` `.github/workflows/release.yml:55-57,124`). A private product repo also runs a scripted check against its deployed staging stage after each deploy (org CI audit, 2026-10-11).

## Rule

A release reads lane L's own check runs on the exact commit it releases and fails closed when they are missing. It never reruns tests, never `needs:` a test job, and nothing scripted runs against a deployed stage.

- **Deployed product:** promotes the digest staging recorded. It builds nothing.
- **Library** (git tags plus GitHub Releases, with the flake as the channel): tags the main commit whose recorded postsubmit verdicts are green, and publishes flake outputs that substitute from the cache (`flake-outputs-build-once-on-main`); it never rebuilds them.

```yaml
# WRONG: systemfsoftware/effect-endgame-starter-kit 375e468:.github/workflows/release-gate.yml:79-97
# Waits on the test lanes, then deploys from source in the dev shell, not a recorded artifact.
  deploy:
    name: deploy · production
    needs: [ci, plan, mutation]
    if: ${{ !github.event.repository.is_template }}
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      ALCHEMY_STAGE: prod
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      SITE_DOMAIN: ${{ vars.SITE_DOMAIN }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: ./.github/actions/cloudflare-secrets
      - uses: ./.github/actions/dev-shell
      - name: Deploy production
        run: nix develop --command pnpm run deploy

# WRONG: systemfsoftware/pnpm-release-management 8cd6e83009:.github/workflows/release.yml:55-57
# Defined in the plan job and reused at :124 in the release job: the release rebuilds
# the tarballs it publishes.
      - &workspace-tarballs
        name: Pack the workspace through the caller's flake
        run: echo "TARBALLS=$(nix build --no-link --print-out-paths .#workspace-tarballs)" >> "$GITHUB_ENV"

# RIGHT: neutral shape, library release. It starts when lane L's run on a main push
# completes, reads L's check runs on that exact commit (the API returns the latest attempt
# of each), fails closed when they are missing or not all green, and builds nothing.
on:
  workflow_run:
    workflows: [Mutation]
    types: [completed]
    branches: [main]
jobs:
  release:
    if: github.event.workflow_run.event == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: write
      checks: read
    steps:
      - name: Lane L's recorded verdicts on this commit are green
        env:
          GH_TOKEN: ${{ github.token }}
          LANE: mutation
          SHA: ${{ github.event.workflow_run.head_sha }}
        run: |
          runs="$(gh api "repos/$GITHUB_REPOSITORY/commits/$SHA/check-runs?check_name=$LANE" --jq '.check_runs')"
          test "$(jq length <<<"$runs")" -gt 0 || { echo "::error::no recorded $LANE verdict on $SHA"; exit 1; }
          jq -e 'all(.[]; .conclusion == "success")' <<<"$runs" > /dev/null || { echo "::error::$LANE is not green on $SHA"; exit 1; }
      # Tag $SHA and publish the flake outputs, substituted from the cache.
#
# Deployed product, same shape: read the recorded verdicts, then promote the digest
# staging recorded for this commit. No build step, no test job in `needs:`.
```

Grounds: _Software Engineering at Google_ ch. 23, "Release candidate testing" (https://abseil.io/resources/swe-book/html/ch23.html), argues the other way: "There are several reasons why it's important to run a comprehensive, automated test suite against an RC, even if it is the same suite that CB just ran against the code on post-submit". Its reasons are a sanity check that "nothing strange happened when the code was cut and recompiled in the RC", auditability, cherry picks and emergency pushes. Promoting the recorded build removes each one: nothing is cut or recompiled, the verdicts are attached to the commit the release names, and a cherry pick or emergency fix is a new main commit with its own verdicts.

Gate: `review`. Does the release read verdicts from anything but lane L's own check runs on the exact commit it releases, or proceed when they are missing? Does it rebuild from source, rerun tests, or `needs:` a test job? Does a deployed release promote anything but the digest staging recorded? Does anything scripted run against a deployed stage?
