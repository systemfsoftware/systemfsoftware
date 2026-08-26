## 2.0.0

### Major Changes

- effect is now a required peer dependency. Install it alongside these packages. They previously bundled their own copy, which meant two Effect instances in one process and services that could not find each other across the boundary.

- Five entry points that were never API are gone. Each existed because another
  package in this project found the code convenient, not because it was a surface
  anyone should depend on.

  - The engine's version and its engine range now come from the package's own
    entry point.
  - The failure identities you catch come from that same entry point rather than a
    separate one.
  - `toRelativeNormalizedFileName` comes from there too.
  - A timer, and a barrel of plugin internals, are no longer reachable. Report's
    `makeEmptyTimer` is gone with them; a progress tally now carries the instant
    the run started rather than a timer object.

  What is left is documented: an entry point is a name you may import and we may
  not move without a major, and everything else is internal whatever file it sits
  in.

- Reporters are constructed by a factory and provided as a layer.

  The exported reporter classes are gone. Replace each `new` with the matching
  factory — `makeClearTextReporter`, `makeHtmlReporter`, `makeJsonReporter`,
  `makeProgressBarReporter`, `makeProgressStreamReporter`.

  Each factory takes the reporter's own options rather than an injected container,
  and each operation returns an `Effect`. If you registered a reporter as a plugin,
  declare it with `declarePlugin` and hand over a layer that provides `Reporter`.

  `drawClearTextScoreTable` is now exported for anyone rendering the score table
  outside a reporter.

### Patch Changes

- Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.

- Updated dependencies:
  - @systemfsoftware/stryker-js-mutation-run@5.0.0
  - @systemfsoftware/stryker-js-plugin-api@3.0.0
