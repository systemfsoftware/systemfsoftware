---
'@systemfsoftware/omp-claude-compat': minor
---

Hook wire schemas now name the fields they decode: decision, permission, matcher, timeout, and edit-payload values decode as distinct branded types, and the tool-input translation round-trips both edit shapes without letting explicit `undefined` leak into hook payloads. Hook authors see no protocol change; the translation rejects fewer valid payloads and keeps rejecting malformed ones.
