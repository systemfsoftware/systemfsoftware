## 8.2.0

### Minor Changes

- Build a cell as a typed continuation chain: `Sandwich.read` takes the read effect and each step exposes only the phase that may follow, so a misordered chain fails to compile with a missing-method error naming the lawful next steps. Pure fillings (`decode`, `encode`) accept only `Sandwich.pure` thunks, and every finished cell carries a recorded `phases` tuple naming the steps it runs. The record-spec authoring surface is retired: build chains with `Sandwich.read` instead.
