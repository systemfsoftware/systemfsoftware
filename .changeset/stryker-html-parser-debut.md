---
"@systemfsoftware/stryker-js-html-parser": minor
---

New package: adds `.html` mutation support. It parses a document with `angular-html-parser` (its own dependency, installed only if you add this plugin) and hands the scripts it finds to the instrumenter.

To use it, add `@systemfsoftware/stryker-js-html-parser` to `plugins` and include `.html` files in `mutate`. Without a parser for an extension you list, a run fails with a configuration error naming the extension instead of skipping the file.
