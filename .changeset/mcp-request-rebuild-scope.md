---
"@systemfsoftware/effect-contract": patch
---

The MCP surface keeps protocol HTTP statuses on `tools/call` for tools that are not contract capabilities. A `-32021` missing-client-capability error now answers HTTP 400 instead of 200.
