---
title: Examples, fixtures and recorded data in a public repository are invented, generated here or public, never taken from a private repository
applies_when:
  - writing an example in a doc, a plan or a pack
  - adding a fixture, a recorded reply, a log, a capture or a data file
  - turning a problem met in a private repository into a public rule, test or doc
tags: [public-repository, privacy, fixtures, examples, provenance]
---

Make every example, fixture, recorded reply, log, capture and data file in a public repository one of three things: written fresh about a generic subject (an inventory service, a notes app, a payments adapter for a third-party API), produced by a script in this repository, or copied from a public source that opens signed out. Never take any from a private repository or a private system's output, even with names, paths and ids replaced: renaming leaves its domain, schema, prompts and flows readable.

```
WRONG  a recorded reply copied from the staging agent with the customer's name swapped for "Alice"
RIGHT  a reply written for the test about an inventory service: { "item": "blue mug", "inStock": 3 }
```
