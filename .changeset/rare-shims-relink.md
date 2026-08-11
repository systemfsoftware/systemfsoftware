---
"@systemfsoftware/arethetypeswrong-cli": patch
"@systemfsoftware/stryker-js-cli": patch
---

Build the `bin` target during install. Both CLIs point `bin` at gitignored build output, which pnpm's two bin-link passes skip when it is absent, leaving a fresh clone without the command and never retrying. A `prepare` script now builds the target between the passes; `arethetypeswrong-cli` drops its committed `bin/attw.mjs` launcher in favour of the same pattern.
