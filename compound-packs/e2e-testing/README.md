# End-to-End Testing

Where an end-to-end test lives (a package of its own), what it drives (the artifacts the system ships, under one supervisor behind readiness probes), and how it is written: agent goals pinned by locator checks, run-unique data per test, and waits on state. Every example is effect-e2e's API, held to the bar the `e2e` runner's own skill sets. Work that adds a test needing real processes must honor it.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: e2e-testing, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
