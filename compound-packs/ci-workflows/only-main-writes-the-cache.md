---
title: Only push to main writes CI cache; other runs restore read-only
applies_when:
  - adding or changing an actions/cache step, a cache action input or cache-mode
  - adding a binary substituter push or a remote build-cache write
  - giving a job or an agent sandbox a cache credential
tags: [ci, cache, main, substituter, read-only]
---

Only jobs triggered by a push to `main` write to a cache: an Actions cache, a binary substituter, or a remote build cache.

All other runs (pull requests, merge-queue batches, scheduled, or dispatched runs) restore read-only. Use `actions/cache/restore` or `cache-mode: read`, never `actions/cache` or `actions/cache/save`. Never give an agent sandbox a cache write credential.

Decision test: Check every step or credential in the diff that can write to a cache (`actions/cache`, `actions/cache/save`, a substituter push, or a write-scoped remote cache token). Reject the diff if the enclosing job runs on any event other than a push to `main`, or if it grants cache write access to an agent sandbox.

Defect prevented: A cache saved by a pull request is scoped to its merge ref (`refs/pull/.../merge`) and cannot be restored by `main` or other PRs, wasting time and storage. In addition, code unmerged to `main` can write a cache that serves subsequent runs a result `main` never produced.

```yaml
# WRONG: in a job a pull request runs, saves on a miss
- uses: actions/cache@<sha>
  with:
    path: .build-cache
    key: build-${{ hashFiles('pnpm-lock.yaml') }}
```

```yaml
# RIGHT: in a job a pull request runs
- uses: actions/cache/restore@<sha>
  with:
    path: .build-cache
    key: build-${{ hashFiles('pnpm-lock.yaml') }}
```

Source: GitHub, "Dependency caching reference": "When a cache is created by a workflow run triggered on a pull request, the cache is created for the merge ref (`refs/pull/.../merge`). Because of this, the cache will have a limited scope and can only be restored by re-runs of the pull request. It cannot be restored by the base branch or other pull requests targeting that base branch." The same page: "Use the `cache-mode` workflow key to grant jobs the least amount of cache access they need", and it calls writing "a malicious cache that a later, more privileged workflow restores and trusts" cache poisoning (https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching).

Gate: judge
