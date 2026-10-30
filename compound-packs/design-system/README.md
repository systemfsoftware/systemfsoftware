# Design System

How an app builds and styles UI with the Astryx design system (`@astryxdesign/core`) through Tailwind: which element to render, which value to style it with, where a style may be written, what every root loads, how a brand is themed, and how navigation is expressed. Work that builds or restyles UI must honor it.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: design-system, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
