---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": minor
---

make-body-purity accepts `createFSM` and `setup` from `@systemfsoftware/xstate/fsm`, so a decision can build a machine and step it with its own `transition` or `initialTransition`. When a decision steps a module-scope machine built by those factories, every reference in the machine's config is judged like the decision body. The fork's actor-runtime exports (root `transition`, `initialTransition`, `getMicrosteps`, `getInitialMicrosteps`, `createActor`, `Actor`, `createEmptyActor`, `createSystem`, `createEmptyActor` from `/actors`, `createDurable` from `/durable`) now report `actorRuntimeReference` instead of `unsealedImportReference`. A decision that steps a module-scope machine built by root `createMachine`, `setup(...).createMachine` or `createMachineFromConfig` is now refused as `actorRuntimeReference`; it used to pass with its config unread.
