---
title: A failing generated schema law is fixed in the codec, never by narrowing the arbitrary, removing the export or replacing the law
applies_when:
  - a generated round-trip, encode-stability or recursion law fails
  - writing a transformation or composition that changes a value's representation
tags: [schema, codec, generated-laws, round-trip]
---

A failing round-trip, encode-stability or recursion law is fixed in the schema's codec (a lossy encode, a transformation with swapped sides, a composition whose Type and Encoded do not line up).

Never narrow a schema's arbitrary so it stops producing the failing value.

Never stop exporting a schema, or move it out of the scanned src/ directory, to remove its generated law.

Never hand-write a replacement or looser test for a schema whose generated law fails.

Gate: judge
