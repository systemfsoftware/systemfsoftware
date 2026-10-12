---
title: A flake artifact CI uses is built once on main, only when its inputs change, keyed on its input hash, and restored read-only everywhere else
applies_when:
  - a workflow builds, caches or restores a flake output
  - a workflow's `permissions`, `cache-mode` or cloud credentials change
  - runner substituter configuration changes
tags: [ci, flake, caching, substituter, main, read-only]
---

An artifact built again by every run costs its build time once per run instead of once per input change. In this repo a cold `.sfs-deps` key costs 3m39s to miss, build, verify and save (run 38096023335). The `sfs-deps` action saves its result on a miss from any event, pull requests included (`.github/actions/sfs-deps/action.yml:94-95`), and a caller that runs several reusables in one run builds once per call on a cold cache (#735). A pull request's save does not help the next pull request: GitHub scopes it to that pull request's merge ref.

## Rule

A flake artifact CI uses is built once on main, only when its inputs change, keyed on its input hash (for example the `flake.lock` narHash or the drvPath), written from main only, and restored read-only by every pull-request job, which never rebuilds an artifact main already built for the same inputs. A pull-request job builds it without saving only in the two cases `setup-under-a-minute` allows: its diff changes the artifact's inputs, or the restore of main's key misses.

- **Public repos:** CI carries no credentials and no cloud wiring: no OIDC role, no S3, no fleet substituter. The artifact lives in the host CI's own cache or artifacts. Main writes it; a pull-request job restores it through a restore-only form (`actions/cache/restore`, or `cache-mode: read`).
- **Private repos on the fleet's runners:** an in-region S3 substituter, pushed to from main only, read by pull-request jobs. The artifact never travels through `actions/cache` alone. The runners trust only the substituter's signing key, and only main pushes. Signing and the push credential belong to the runner or its infrastructure, never to a key file in the workflow.

```yaml
# WRONG: systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/sfs-deps/action.yml:94-98
# Saves on a miss from any event, pull requests included; each reusable that calls the
# action pays the cold build (3m39s in run 38096023335).
    - if: steps.key.outputs.key != '' && steps.probe.outputs.cache-hit != 'true'
      uses: actions/cache/save@v6
      with:
        path: ${{ inputs.working-directory }}/.sfs-deps
        key: ${{ steps.key.outputs.key }}

# RIGHT: neutral shape, public repo. The key is the artifact's derivation; there are no
# restore-keys, because a prefix match restores an artifact built from other inputs.
  artifact:                       # push to main only: builds on a miss and saves
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v7
      - uses: cachix/install-nix-action@v31
      - id: key
        run: echo "key=artifact-$(basename "$(nix eval --raw .#artifact.drvPath)")" >> "$GITHUB_OUTPUT"
      - id: restore
        uses: actions/cache/restore@v6
        with:
          path: artifact
          key: ${{ steps.key.outputs.key }}
      - if: steps.restore.outputs.cache-hit != 'true'
        run: cp -rL "$(nix build --no-link --print-out-paths .#artifact)" artifact
      - if: steps.restore.outputs.cache-hit != 'true'
        uses: actions/cache/save@v6
        with:
          path: artifact
          key: ${{ steps.key.outputs.key }}
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
  check:                          # pull request: restores main's key, never saves
    if: github.event_name == 'pull_request'
    cache-mode: read
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v7
      - uses: cachix/install-nix-action@v31
      - id: key
        run: echo "key=artifact-$(basename "$(nix eval --raw .#artifact.drvPath)")" >> "$GITHUB_OUTPUT"
      - id: restore
        uses: actions/cache/restore@v6
        with:
          path: artifact
          key: ${{ steps.key.outputs.key }}
      # A miss means the diff changed the inputs or main's entry was evicted: build, never save.
      - if: steps.restore.outputs.cache-hit != 'true'
        run: cp -rL "$(nix build --no-link --print-out-paths .#artifact)" artifact
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"

# RIGHT: neutral shape, private repo on the fleet's runners. The runner's Nix config
# names the substituter and its trusted public key; the main runner also holds the
# signing key and the push credential. The workflow carries neither.
#   push to main:
      - run: nix copy --to "$SUBSTITUTER" "$(nix build --no-link --print-out-paths .#artifact)"
#   pull request:
      - run: nix build --no-link .#artifact
        # A path the substituter has, signed by the trusted key, is substituted. A path it
        # lacks builds locally. A path whose signature the runner does not trust is
        # refused and builds locally.
```

Grounds: GitHub, "Dependency caching reference", section "Restrictions for accessing a cache" (https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching): "Workflow runs can restore caches created in either the current branch or the default branch (usually `main`). If a workflow run is triggered for a pull request, it can also restore caches created in the base branch", and "When a cache is created by a workflow run triggered on a pull request, the cache is created for the merge ref (`refs/pull/.../merge`). Because of this, the cache will have a limited scope and can only be restored by re-runs of the pull request." The same page, section "Controlling cache access with `cache-mode`", gives `read` as restore caches "Yes" and save caches "No", says "You can set `cache-mode` at the workflow level, at the job level, or both", and advises "explicitly declaring `cache-mode: read` on the job" while a push-triggered workflow maintains the cache. #735's body: "A caller that runs several of these reusables in one run can build once per call on a cold cache."

Gate: `review`. (1) Does a pull-request job build an artifact main already built for the same inputs, outside the two cases above? (2) Does a public repo's workflow name a credential or a cloud role (`id-token: write`, a cloud login action, an S3 or substituter secret)? (3) Does a pull-request job write the artifact through an `actions/cache/save` step, a substituter push, or a job without `cache-mode: read` (set at job or workflow level) whose steps save? (4) In a private fleet repo, does the artifact travel through `actions/cache` alone, or does the workflow carry a signing key?
