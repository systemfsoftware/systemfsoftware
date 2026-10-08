---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

Add a `no-inline-suppression` bin. It exits non-zero when a scanned file has a comment that opens with `oxlint-disable`, `oxlint-disable-line`, `oxlint-disable-next-line`, the matching `eslint-disable` forms, or `@ts-expect-error`, and prints each finding as `file:line:column`. With no arguments it scans the git-tracked TypeScript and JavaScript files under the working directory; it reads no configuration, and no comment inside a scanned file can exempt it. Run it beside oxlint, for example `"lint": "oxlint . && no-inline-suppression"`.
