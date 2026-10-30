---
title: A public repository names no real person, holds no real person's email address or handle, and holds no filesystem path from a real machine
applies_when:
  - writing test data, fixtures, examples, docs, plans or packs that mention a person
  - writing a path into code, a test, a fixture, a config, a doc, a plan or a pack
  - committing a log, an error, a stack trace, a transcript or a model reply that may carry names, addresses or paths
  - writing a commit message or a pull request's title and body
tags: [public-repository, privacy, people, emails, paths]
---

Write people in code, tests, fixtures, examples, docs, plans, packs, commit messages and pull request text as placeholders (alice, bob, carol) or roles (the operator, the reviewer, the owner), with email addresses on a reserved domain (`alice@example.com`). A real person's name, email, handle or phone number appears only where a license or attribution requires it: a copyright line, a NOTICE entry, or a file vendored unchanged from a public upstream. That includes the author's or a reviewer's own name in prose.

Write a path to a file in this repository relative to the repository root. An absolute path in a test, example or doc is a synthetic placeholder (`/home/test`, `/srv/app`, `/tmp/example`) or a standard location every machine has (`/usr/bin/env`). Never commit a path naming a real user's home, a mount point, a checkout, a worktree or a private repository.

```
WRONG  Run the fixture from /home/<user>/Projects/<private-repo>.worktrees/fix-retry/fixtures/site.
RIGHT  Run the fixture from fixtures/site.   const user = { name: 'Alice', email: 'alice@example.com' }
```
