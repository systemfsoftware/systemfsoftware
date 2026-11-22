# Cell Architecture

File kinds, handles and scopes, and cell composition in packages built on @systemfsoftware/effect-cell-types. Work that adds or changes a cell, workflow, blueprint, handle or file kind must honor it.

The library is public: source and docs at https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-cell-types (npm: `@systemfsoftware/effect-cell-types`).

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: cell-architecture, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
