## 5.0.0

### Major Changes

- Settings parsing now enforces size limits the domain always implied: at most eight settings sources per merge, at most three matcher blocks per hook group, and at most three hooks per matcher block. Files beyond those limits are rejected instead of accepted.

- The hook verdict is now a branded tagged union: Block carries the exit code and stdout alongside its reason, Allow carries the updated input, Warning carries the message with its code and stdout; the admit and settings decisions are plain functions in their owning modules

- The coverage schemas HookCoverageSchema and HookCoverageRowSchema are no longer exported; declare the shape locally if you imported them. SettingsSource is now the schema-derived source type, so the optional pluginRoot field is typed string | undefined.

### Patch Changes

- The arbitraries derived for several schema filters now construct their valid values directly instead of drawing many samples and discarding them. Filtered schemas such as the worker-call guard, the edit-entry guards, and the restart-cap check generate matching values on the first draws, so property suites that use them finish faster. Every value still satisfies the same filter as before.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@6.0.0
