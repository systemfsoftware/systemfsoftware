---
"@systemfsoftware/stryker-js-html-reporter": major
---

`makeHtmlReporter` no longer takes `fs` or `path`; pass only `options`. The reporter declares its `FileSystem` and `Path` requirements on the effect's service channel instead — provide them at your composition root.
