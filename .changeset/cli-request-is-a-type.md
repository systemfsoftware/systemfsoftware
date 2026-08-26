---
'@systemfsoftware/stryker-js-cli': major
---

`CliRequest` is a type, not a schema. It described a value the CLI builds in
memory and hands to its own dispatcher, so nothing ever decoded it, and its
declared `options` were the fully resolved option set rather than the partial
overlay a command line actually carries. Import it with `import type`; if you
were decoding with it, decode the options you have against the language
package's `Schema` export instead.

Captured console output renders objects differently. In machine mode the CLI
captures what a run writes to the console, and an object now appears as
`{"a":1}` where it previously appeared as `{ a: 1 }`. Strings, numbers and
format specifiers such as `%s` and `%d` are unchanged.
