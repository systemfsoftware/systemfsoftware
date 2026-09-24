---
"@systemfsoftware/api-extractor": minor
---

Analyzer warnings (such as `ae-forgotten-export`) now appear inside generated API reports exactly where `@microsoft/api-extractor` writes them, and run summaries report the same error and warning counts. The engine pins `typescript` 5.9.3 as a regular dependency (the version `@microsoft/api-extractor` itself bundles), so generated reports do not drift when the consuming workspace upgrades TypeScript.
