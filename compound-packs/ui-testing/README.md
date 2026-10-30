# UI Testing

How a UI's behaviour is proven by Storybook stories run in a real browser: what a journey specifies and how it reads, where a story's I/O comes from, how its state stays its own, and how stories query and size. Work that writes or reviews a story must honor it.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: ui-testing, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
