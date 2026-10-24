---
title: Only a push to main writes a CI cache, and every other run restores read-only
applies_when:
  - adding or changing an actions/cache step, a cache action input or a substituter push
  - giving a job or an agent sandbox a cache credential
tags: [ci, cache, main, substituter]
---

Only a push to main writes a CI cache or a binary substituter that a later run restores.

Pull-request, merge-queue and scheduled jobs restore read-only (actions/cache/restore, never actions/cache or actions/cache/save) and never save or push to a substituter.

An agent sandbox is never given a credential that writes a build cache.

Examples pin the action by commit SHA: WRONG `- uses: actions/cache@<sha>` in a pull_request job; RIGHT `- uses: actions/cache/restore@<sha>`.

```WRONG
# in a pull_request job: saves on a miss
- uses: actions/cache@<sha>
```

```RIGHT
# in a pull_request job
- uses: actions/cache/restore@<sha>
```

Gate: judge
