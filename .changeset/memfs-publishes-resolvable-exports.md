---
'@systemfsoftware/effect-memfs': patch
---

The published package no longer advertises an export target it does not ship. Its exports map
carried a `@systemfsoftware/source` condition pointing at `./src/index.ts`, while the package
contains only `dist/`. Plain Node never selects that condition, so imports worked; a consumer
whose TypeScript configuration or bundler enables it resolved to a file that was not there
