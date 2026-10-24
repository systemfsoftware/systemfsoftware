---
title: A public repository never names a private repository, package or product, cites a private tracker id or holds a local filesystem path
applies_when:
  - writing fixtures, test data, examples or docs from real material
  - committing a data file, a log or a model reply to a public repository
tags: [public-repository, privacy, fixtures, paths]
---

No committed code, test, fixture, example, doc, plan, pack or data file names a private repository, a private package or an unreleased product.
No committed code, test, fixture, example, doc, plan, pack or data file names a real person or holds a real person's email address or handle; people in examples and test data are placeholders (alice, bob, test).
No committed code, test, fixture, example, doc, plan, pack or data file cites a ticket, issue or pull-request number or a CI run id; it states the fact itself.
No committed file holds a path from a real machine (a home directory, a mount point, a checkout or worktree location); a path to a repository file is relative to the repository root.
An absolute path in tests and examples is a synthetic placeholder (/home/test, /srv/app), never one copied from a real machine.
Email addresses and domains in code, tests and examples use reserved example domains (example.com, example.org, .test).
Material taken from a private repository (a config, a log, an error, a model reply) is rewritten to these rules before it is committed.
The review judge decides whether a name, path or number is private or real; an uncertain case escalates and never passes.

```
WRONG
const site = { email: 'e2e@internal-product.io', root: '/home/dev/src/billing-private' }
```

```
RIGHT
const site = { email: 'e2e@example.com', root: 'fixtures/site' }
```

Gate: judge
