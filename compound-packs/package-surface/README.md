# Package Surface

What a package exposes to its consumers: one name from one entry, subpaths that exist for consumers, and the version bump a surface change takes. Work that adds, renames, moves or removes an export or subpath of a package must honor it.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: package-surface, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
