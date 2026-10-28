---
title: A public repository names no real person and holds no real person's email address or handle
applies_when:
  - writing test data, fixtures, examples, docs, plans or packs that mention a person
  - writing a commit message or a pull request's title and body
  - committing a log, a transcript or a model reply that may carry names or addresses
tags: [public-repository, privacy, people, emails]
---

People in code, tests, fixtures, examples, docs, plans, packs, commit messages and pull request titles and bodies are placeholders (alice, bob, carol) or roles (the operator, the reviewer, the owner). Their email addresses use a reserved domain (alice@example.com, bob@shop.test). A real person's name, email address, handle or phone number appears only where a license or attribution requires it: a copyright line, a NOTICE entry, or a file vendored unchanged from a public upstream.

Decision test: for each person's name, email address, handle or phone number the diff adds, the reviewer sees a placeholder name, a role, an address on a reserved domain, or a line a license or upstream attribution requires. Anything else fails, including the author's or a reviewer's own name in prose.

Defect: a real person's identity or contact address is published, and stays readable in forks and clones after it is removed.

```
WRONG
const user = { name: '<a real colleague name>', email: '<their work address>' }
// asked for by @<their handle> in the planning call
```

```
RIGHT
const user = { name: 'Alice', email: 'alice@example.com' }
// a shopper asks to change the delivery address after checkout
```

Source: RFC 2606 reserves example.com, example.net and example.org for documentation; GitHub's "Removing sensitive data from a repository" says data cannot be removed from other users' clones of a repository.

The review judge decides; an uncertain case escalates and never passes.

Gate: judge
