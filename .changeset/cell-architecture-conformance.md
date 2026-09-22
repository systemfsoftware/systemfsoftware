---
"@systemfsoftware/api-extractor": minor
---

The package's internals now follow the repo's cell architecture: the run pipeline is a typed `Sandwich` cell with a pure planning workflow, verbosity and config merging are branded pure decision workflows, the message router fails with a typed `MessageRuleError` instead of throwing on invalid message reporting tables, and `ExtractorMessage` is now exported from the package root. `resolveVerbosity` is now a pure decision workflow taking a `ResolveVerbosity` command and returning a tagged decision instead of a plain function over a request record.
