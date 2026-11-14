---
title: A blobless mutation checkout cannot diff a deleted file in a private repository
date: 2026-11-14
category: build-errors
tags: [mutation, checkout, partial-clone, pnpm]
---

# A blobless mutation checkout cannot diff a deleted file in a private repository

## Problem

The diff-mode mutation job crashed before testing anything:

```
ERR_PNPM_FILTER_CHANGED
fatal: could not read Username for 'https://github.com': No such device or address
fatal: could not fetch <blob> from promisor remote
```

## Cause

`reusable-mutation.yml` checked out with `filter: blob:none` and `persist-credentials: false`. The job selects packages with `pnpm list --filter ...[<base>]`, which runs `git diff` between the base and the head. When the change deletes a file, git's rename detection reads the deleted file's blob. A blobless clone has to fetch that blob from its remote. In a private repository no credentials are left to fetch it with, so the diff fails. A change that only adds or edits files never needs a base-side blob, which is why the job passed until a change deleted a file.

## Fix

The checkout is blobless only for a public repository, where the lazy fetch works without credentials. This is the same rule `reusable-ci.yml` already uses.

## Lesson

A partial clone defers some reads to the network. When the job drops its credentials, those deferred reads fail, and only the inputs that trigger them show it.
