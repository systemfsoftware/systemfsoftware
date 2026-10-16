## 0.1.0

### Minor Changes

- Publish initial release of `@systemfsoftware/tsdown-config`: `./quiet-build` (a `quietBuild` tsdown config fragment that keeps every actionable warning), `./eager-entry-budget` (an `eagerEntryBudget({ maxBytes })` rolldown plugin that fails a build whose `index.js` entry statically pulls more than the budget or leaves `effect` external) and the `api-extractor-quiet` bin. Every entry is plain JavaScript with type declarations and loads from `node_modules` under Node 24. `tsdown` `^0.23.0` and `@microsoft/api-extractor` `^7.59.1` are optional peers.
