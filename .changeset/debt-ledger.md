---
"@systemfsoftware/debt-ledger": minor
---

Add `@systemfsoftware/debt-ledger`: one model for inline suppressions (lint, Effect diagnostics,
TypeScript, Stryker, coverage, formatter), Rust `allow`/`expect`/`ignore` attributes, skipped tests,
TODO-family markers, effective config severities and declared opt-ins, rendered to `debt.md` and
`debt.json` deterministically. The `debt-ledger build|check` CLI writes both files from one model and
fails on any undeclared entry, any stale declaration, byte drift, or an empty input root.
