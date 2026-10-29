---
title: A public repository cites no tracker id, run, thread or link that a signed-out reader cannot open
applies_when:
  - referring to a ticket, issue, pull request, CI run, chat thread or agent session in code, docs, plans, packs or comments
  - writing a commit message or a pull request's title and body
  - recording why a change was made or where a decision came from
tags: [public-repository, privacy, tracker-ids, links]
---

A committed file, a commit message and a pull request's title and body cite an issue, pull request, ticket, CI run, chat thread or session only when a signed-out reader can open it: this repository's own issues and pull requests, or a public upstream's. A private tracker key (a team prefix and number), another private repository's issue or pull request, a private CI run, a chat or meeting link and an agent session link are replaced by the fact they stood for.

Decision test: for each id, number or link the diff adds that points at a record, the reviewer opens it while signed out. One that does not open, or whose prefix belongs to no public project the reviewer can find, fails; the fix states the fact the id stood for.

Defect: a private tracker's workspace key, numbering and structure are published, and the reference tells a public reader nothing.

```
WRONG
// keep the retry at three, per ABC-412 and https://chat.<private-zone>/thread/88
```

```
RIGHT
// three retries: a fourth adds latency without recovering any more refused writes
```

Source: GitHub's "Removing sensitive data from a repository" says commits stay accessible in forks, clones and cached views after a force-push, so a leaked reference cannot be recalled.

The review judge decides; an uncertain case escalates and never passes.

Gate: judge
