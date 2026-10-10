# Mutation baseline reasons - effect-microsandbox

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded unjudged.

## Justified

| id                 | file:line                       | mutator -> replacement                                                       | reason                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `df3764cc9f79c412` | `src/MicroVMError.schema.ts:86` | MethodExpression -> `fragments.some(fragment => message.includes(fragment))` | `mentions` is the oracle of this file's in-source properties and nothing outside the `import.meta.vitest` block calls it; `every` -> `some` only weakens that oracle, so no shipped behaviour and no test of the public surface can observe it |

## Debt

| id | file:line | mutator -> replacement | reason |
| -- | --------- | ---------------------- | ------ |
