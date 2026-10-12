---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": minor
---

make-body-purity accepts `createFSM` and `setup` from `@systemfsoftware/xstate/fsm`, so a decision can step a machine with its own `transition` or `initialTransition`. When a decision steps a module-scope machine `const` built by those factories, its config is judged like the decision body. The fork's actor-runtime exports (root `transition`, `initialTransition`, `getMicrosteps`, `getInitialMicrosteps`, `createActor`, `Actor`, `createEmptyActor`, `createSystem`, `createMachine`, `createMachineFromConfig`, `createEmptyActor` from `/actors`, `createDurable` from `/durable`) now report `actorRuntimeReference` instead of `unsealedImportReference`, also through a module alias. A module-scope machine built by root `createMachine`, `setup(...).createMachine` or `createMachineFromConfig` and stepped by a decision is now refused as `actorRuntimeReference`; it used to pass with its config unread.
