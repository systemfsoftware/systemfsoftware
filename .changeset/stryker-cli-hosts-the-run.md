---
"@systemfsoftware/stryker-js-cli": major
---

The command is now the whole mutation host: running a mutation test no longer requires the engine, instrumenter or html reporter packages to be installed, because they ship inside this one. The `stryker` command and its arguments are unchanged, and the package still declares no peer dependency.

One configuration change: the base preset moved. A config that set `"extends": "@systemfsoftware/stryker-js-engine/config/base"` must now set `"extends": "@systemfsoftware/stryker-js-cli/config"`.

Two things a consumer can observe:

- The verdict line's `schemaVersion` is `1.2`. It gains an optional `evaluators` field: an object keyed by evaluator name, each entry `{ exitClass, message? }`. When no evaluator returned a verdict, the field is absent.
- Evaluator messages are written to standard error, one line each, prefixed with the evaluator's name.
- The `html` reporter, the builtin reporters and the instrumenter remain available exactly as configured; `.html` and `.svelte` mutation now require their own plugin packages.

`@systemfsoftware/stryker-js-engine`, `@systemfsoftware/stryker-js-instrumenter` and `@systemfsoftware/stryker-js-html-reporter` are no longer published.
