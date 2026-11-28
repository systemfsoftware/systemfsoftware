# Testing

Prescriptive rules for what behaviour tests specify, how scenarios, assertions, adapters, fakes and contract suites are built, where an integration test's I/O runs (the lightest real engine the test needs—an in-process embedded engine, the platform's local runtime, or a scoped KVM microVM—never in containers or on the host), how failing tests and surviving mutants are resolved, and why configuration gets no test or gate.

Rules are top-level `.md` files with `title` and `applies_when`, cited as `(pack: testing, <file>.md)`. Subfolders are storage ignored by discovery.
