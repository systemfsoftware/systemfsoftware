# @systemfsoftware/oxlint-plugin-effect-executor

Oxlint rules enforcing the `*.executor.ts` cell — the imperative shell that
wraps exactly one pure workflow in the impure/pure/impure sandwich.

An executor reads raw inputs, decodes them to domain types through `*.acl.ts`,
hands them to a pure workflow, encodes the decision back through the ACL, and
writes it. It holds one consumer-owned `Context.Tag`, constructs no escaping
state, binds no `Layer`, and decides nothing.

## Install

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-executor
```

```ts
import plugin from '@systemfsoftware/oxlint-plugin-effect-executor'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-executor'],
  rules: { ...plugin.configs.recommended.rules },
})
```

## Rules

| Rule                           | What it catches                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `executor-owns-context-tag`    | `Context.Tag` / `Context.GenericTag` / `Effect.Tag` declared in a `*.workflow.ts`, `*.handler.ts`, `*.store.ts`, or `*.acl.ts`                 |
| `executor-deps-tag-name`       | A Tag not named `<PascalFilename>ExecutorDeps`, a Tag identifier string that differs from its class name, or more than one Tag in one executor |
| `executor-deps-borrowed-types` | A hand-written method signature in the Deps shape instead of `Provider['Type']['method']`                                                      |
| `executor-no-domain-branch`    | `Match.value` over a value derived from an ACL or store call, or an `if`/ternary/`switch` reading `_tag` on one                                |
| `executor-no-io-in-filling`    | A suspended effect (`yield*`, `await`) or a store/adapter call inside the workflow call's arguments                                            |
| `executor-no-escaping-state`   | A module-level `let`/`var`, or a module-level `Map`/`Set`/`WeakMap`/`WeakSet`                                                                  |
| `executor-no-layer-binding`    | `Layer.*`, `Effect.provide*`, or a `Layer` value import inside the executor                                                                    |

Every rule is inert outside its target filename suffix, so the plugin is safe
to enable across a whole workspace.

## How values are classified

There is no type information. A value's provenance comes from the import edge:
a binding imported from `./order.acl.js` is an ACL binding, one from
`./order.store.js` is a store binding, one from `./confirm-order.workflow.js`
is a decision. `executor-no-domain-branch` propagates that provenance one hop
at a time through `const` declarations, so `decodeOrder(row)` taints `order`,
and `order.state` taints `state`.

This is why **translation stays legal**. Dispatching over the decision a
workflow returned is the executor's job:

```ts
// allowed — the operand came from the workflow
const decision = confirmOrder(new ConfirmOrderCommand({ order }))
const response = Match.value(decision).pipe(
  Match.tag('Confirmed', toCreated),
  Match.tag('Rejected', toConflict),
  Match.exhaustive,
)

// reported — the operand came out of the ACL, so the shell is deciding
const order = decodeOrder(row)
const next = Match.value(order).pipe() /* ... */
```

## What this plugin deliberately does not check

Four invariants of the cell stay review-gated. The first was attacked with real
rules that were built, run against every executor in the workspace, and
rejected on the evidence; the rest were rejected at design time.

- **I/O sandwich ordering.** A composite operation legitimately calls two
  workflows, and the architecture explicitly permits keeping a genuinely
  sequential process openly in the shell. Three statement-order rules fired on
  both. The subset that survived that test is `executor-no-io-in-filling`.
- **Read completeness.** Proving the read phase fetched everything the decision
  needs requires the workflow's whole input surface.
- **Data-integrity vs domain branching.** Whether an existence check on a
  branded optional is integrity or a verdict in disguise is a domain judgment.
- **Anti-pattern file names.** Family-wide, and owned by the shared plugin's
  naming rule rather than by twelve per-cell copies.

## Development

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-executor test
pnpm --filter @systemfsoftware/oxlint-plugin-effect-executor mutation
```

Mutation score is gated at 100%.
