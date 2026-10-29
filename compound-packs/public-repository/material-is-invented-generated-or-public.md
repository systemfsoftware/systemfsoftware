---
title: Examples, fixtures and recorded data in a public repository are invented, generated here or public, never taken from a private repository
applies_when:
  - writing an example in a doc, a plan or a pack
  - adding a fixture, a recorded reply, a log, a capture or a data file
  - turning a problem met in a private repository into a public rule, test or doc
tags: [public-repository, privacy, fixtures, examples, provenance]
---

Every example, fixture, recorded reply, log, capture and data file in a public repository is one of three things: written fresh about a generic subject (an inventory service, a notes app, a payments adapter for a third-party API), produced by a script in this repository, or copied from a public source. Nothing is taken from a private repository or a private system's output, even with its names, paths and ids replaced: renaming leaves its domain, schema, prompts and flows readable.

Decision test: for each example or data file the diff adds, the reviewer can tell from the diff and the pull request's body which of the three it is: the generic subject is visible in the text, the generating script is in this repository, or the public source is linked and opens signed out. One that is none of the three, or whose subject is a specific product domain the reviewer cannot trace to this repository or a public source, fails.

Defect: a private system's design, data or prompts are published under renamed identifiers.

```
WRONG
A recorded reply copied from the staging agent, with the customer's name swapped for "Alice":
{ "plan": "rebalance the client's three portfolios toward the in-house fund", ... }
```

```
RIGHT
A reply written for the test about an inventory service:
{ "item": "blue mug", "inStock": 3 }
```

Source: GitHub's "Removing sensitive data from a repository" says commits stay accessible in forks, clones and cached views after a force-push.

The review judge decides; an uncertain case escalates and never passes.

Gate: judge
