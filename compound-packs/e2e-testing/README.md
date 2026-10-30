# End-to-End Testing

Where an end-to-end test lives (a package of its own) and what it drives (the real processes the system ships as). Work that adds a test needing real processes must honor it.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: e2e-testing, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
