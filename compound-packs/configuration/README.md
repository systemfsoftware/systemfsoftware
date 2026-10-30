# Configuration

How an application declares each environment variable as one described Config in `src/config.ts`, keeps secrets redacted, hands a feature's settings to its code through a `<Feature>Config` in context, models a feature that can be switched off, and how tests supply settings. Work that adds or reads a setting must honor it. Configuration values themselves carry no test and no gate.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: configuration, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
