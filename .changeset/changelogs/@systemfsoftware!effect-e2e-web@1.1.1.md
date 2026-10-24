# @systemfsoftware/effect-e2e-web@1.1.1

No adapter change: the package depends on the `@systemfsoftware/effect-e2e` release that adds `ai-trace.json`. None: the adapter only rebuilds against `@systemfsoftware/effect-e2e`; its packed tarball is byte-identical (pack-and-compare on both revisions). The README now covers installing the package from the systemfsoftware flake tarball with its `effect` and `playwright` peers and the Chromium install, and how a suite's `runner.ts` passes `layer` to `makeRunner`.
