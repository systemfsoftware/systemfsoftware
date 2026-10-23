---
"@systemfsoftware/effect-e2e": patch
---

Add the replay cache's pure core: the cache key context and its SHA-256 digest, unique() slot templating, the trace-1 entry, the replay decision, and the end-of-attempt recording settlement. Nothing new is exported from the package entry; the package now depends on @noble/hashes.
