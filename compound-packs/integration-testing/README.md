# Integration Testing

Where integration test I/O must run (in KVM microVMs booted per scope via `@systemfsoftware/effect-microsandbox`, never in containers or on the host), what host operations are forbidden, and when a test belongs in `e2e-testing` or must be deleted.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: integration-testing, <file>.md)`. Rule text is evidence `ce-plan` and `ce-code-review` quote. Subfolders are storage the resolver ignores.
