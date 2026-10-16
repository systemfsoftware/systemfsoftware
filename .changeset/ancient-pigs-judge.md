---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

Add a `no-inline-suppression` bin. It exits non-zero when a scanned file has a comment that opens with `oxlint-disable`, `oxlint-disable-line`, `oxlint-disable-next-line`, `eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line`, `@ts-expect-error`, `@ts-ignore` or `@ts-nocheck`, and prints the location of each such comment as `file:line:column`. With no arguments it scans the git-tracked TypeScript and JavaScript files (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`) under the working directory; it reads no configuration, and no comment inside a scanned file can exempt it. Run it beside oxlint, for example `"lint": "oxlint . && no-inline-suppression"`.
