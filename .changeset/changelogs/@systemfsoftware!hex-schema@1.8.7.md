## 1.8.7

### Patch Changes

- Re-released against @systemfsoftware/stryker-js without the removed --llms manifest. The Run stream no longer carries a manifest terminal event, and the RunEvent / RunTerminalEvent unions no longer include the manifest arm, so any exhaustive consumer of those types must drop that case.

- Rebuilds against updated workspace dependencies, including the new
  `@systemfsoftware/stryker-js` reporter protocol major.
