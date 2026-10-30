# Cell Architecture

File kinds, adapter names, layer naming and wiring, instance state, handles and scopes, and cell composition in packages built on `@systemfsoftware/effect-cell-types`. Work that adds or changes a service, adapter, cell, workflow, blueprint or handle must honor it.

The library is public: source and docs at https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-cell-types (npm: `@systemfsoftware/effect-cell-types`). The layer and wiring rules apply to any Effect 4 code in a repository that declares this pack.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: cell-architecture, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
