---
title: A public repository holds no filesystem path from a real machine
applies_when:
  - writing a path into code, a test, a fixture, a config, a doc, a plan or a pack
  - committing a log, an error, a stack trace or a tool's output
  - writing a commit message or a pull request's title and body
tags: [public-repository, privacy, paths]
---

A path to a file in this repository is written relative to the repository root. An absolute path in a test, an example or a doc is a synthetic placeholder (/home/test, /srv/app, /tmp/example) or a standard location every machine of that kind has (/usr/bin/env, /etc/hosts). A path naming a real user's home, a mount point, a checkout, a worktree or a private repository is never committed, in a file, a commit message or a pull request's title and body.

Decision test: for each absolute or home-relative (~) path the diff adds, the reviewer sees a synthetic placeholder or a standard system location. A path carrying a real user name, a disk or mount name, a project folder or a private repository's name fails.

Defect: a user name, disk layout and the names of private checkouts are published.

```
WRONG
Run the fixture from /home/<user>/Projects/<private-repo>.worktrees/fix-retry/fixtures/site.
```

```
RIGHT
Run the fixture from fixtures/site.
const env = { HOME: '/home/test' }
```

Source: GitHub's "Removing sensitive data from a repository" says data cannot be removed from other users' clones of a repository.

The review judge decides; an uncertain case escalates and never passes.

Gate: judge
