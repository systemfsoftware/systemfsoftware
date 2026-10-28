---
title: Only a push to main writes a CI cache, and every other run restores read-only
applies_when:
  - adding or changing an actions/cache step, a cache action input or cache-mode
  - adding a binary substituter push or a remote build-cache write
  - giving a job or an agent sandbox a cache credential
tags: [ci, cache, main, substituter, read-only]
---

Only a job that a push to main runs writes a cache that a later run restores: an actions cache, a binary substituter, a remote build cache.

Every other job (a pull request's own run, a merge-queue batch, a scheduled or dispatched run) restores read-only. It uses `actions/cache/restore` or runs under `cache-mode: read`, never `actions/cache` or `actions/cache/save`. It holds only a read credential for a remote build cache, and it never pushes to a substituter.

An agent sandbox is never given a credential that writes a build cache.

Decision test: for each step the diff adds or changes that can write a cache (`actions/cache`, `actions/cache/save`, a substituter push, a remote-cache token with write access), list the events that reach its job. The diff fails when any of them is not a push to main, or when it hands a cache write credential to an agent sandbox.

Defect prevented: a cache a pull request saves is scoped to that pull request's merge ref, so no other run restores it. The save costs time and storage for nothing. A cache written from code main has not accepted can serve a later run a result main never produced.

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
