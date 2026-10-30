# Integration Testing

Where an integration test's IO may run (in a container, never on the host), what it may never start (a child process), and the smells that mark a fake integration test. Work that writes or reviews an integration test must honor it.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: integration-testing, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
