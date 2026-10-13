---
title: Decisions inside the sandwich must be pure Workflow values with cyclomatic complexity 1
applies_when:
  - authoring a domain decision or business workflow
  - passing a decider to Sandwich.decide
  - reviewing logic inside *.workflow.ts
  - adding or reviewing a status, phase or step field that code moves between named states
  - a run, approval or wait gate, a deploy promotion, an OAuth or other connect flow, an onboarding flow or a multi-step wizard
  - reaching for a state-machine library to decide what happens next
tags: [cell, workflow, pure-core, cyclomatic-complexity, match-exhaustive, lifecycle, state-machine]
---

The `decide` phase of a sandwich must receive a `Workflow` instantiated with `Workflow.make`. For decisions that cannot fail, declare `error: Schema.Never`. The slot requires the nominal `WorkflowBrand`; passing an unwrapped anonymous function fails type-checking.

A workflow is a total, single-path expression: Cyclomatic Complexity = 1. Branching must be expressed as exhaustive dispatch over a closed tagged union (`Match.value(cmd).pipe(...)` terminating in `Match.exhaustive`). Iteration must be expressed as `map`, `filter`, or `fold`, never imperative loops.

Control flow keywords (`if`, `else`, `switch`, ternary `?:`, `for`, `while`) are forbidden in decision bodies. Decisions must not perform I/O, read clocks (`Date.now`), call random generators, or yield Effect services. If a decision needs current time, the time must be gathered in `read` and passed in the command schema.

```ts
// WRONG: imperative control flow with complexity > 1, bare unbranded function
export const decideDiscount = (cmd: OrderCmd) => {
  if (cmd.isVip) {
    return cmd.total > 100 ? Result.succeed(new High()) : Result.succeed(new Low())
  }
  return Result.succeed(new None())
}

// RIGHT: Workflow.make with schemas, complexity = 1 via Match.exhaustive
export const decideDiscount = Workflow.make({
  command: OrderCommand,
  decision: DiscountDecision,
  error: Schema.Never,
  decide: (cmd): Result.Result<High | Low | None, never> =>
    Match.value(cmd.tier).pipe(
      Match.tag('VIP', () =>
        Match.value(cmd.isOverThreshold).pipe(
          Match.when(true, () => Result.succeed(new High())),
          Match.when(false, () => Result.succeed(new Low())),
          Match.exhaustive,
        )),
      Match.tag('Standard', () => Result.succeed(new None())),
      Match.exhaustive,
    ),
})
```

## Lifecycles are decisions

A lifecycle counts when code decides a value's next named state from its current state and an event, and the value is rendered, persisted or sent across a process boundary. Run, approval and wait gates, OAuth connect, onboarding flows, deploy promotion and multi-step wizards count. Five cases do not:

- the progress or outcome of one read or command, which is its `AsyncResult`;
- a decision's outcome union, which has no next state;
- a UI-local value that no code branches on to compute its next value, such as an open/closed flag;
- a library's internal bookkeeping that is never rendered, persisted or sent, such as effect-atom's node phase;
- a protocol or process lifecycle that makes no business choice, such as a connection, a request in flight or a supervised child's protocol state, which a shell machine holds (`shell-machines-follow-events.md`); whether a lifecycle is protocol or business stays with review.

Branching on a state to render it is display, not a transition. A supervisor's child status counts when its states are exported, persisted or shown to a user, or when its transitions encode policy (restart, backoff, give-up); private bookkeeping owned by one function does not. Review reaches such code when a diff next changes it; nothing is swept.

A counted lifecycle is advanced by a decision, never by a state machine:

- **The state is a closed tagged union.** One variant per state, each carrying only its own fields, and the current state arrives inside the command (`compound-packs/schema-laws/tagged-unions-over-state-by-presence.md`). The decide body dispatches over state and command with `Match` and closes every dispatch with `Match.exhaustive`.
- **Every illegal state × command pair is a typed refusal.** One refusal variant per distinct reason, whose fields name the state and command tags as closed literals. A replay the business accepts is a named success variant. A decide body never returns its input state unchanged as success, so a silent no-op cannot pass for a decision; an evolve step that applies a decision another decide body already named (applying a `Stale` decision returns the state it was given) projects that named decision and is not a no-op.
- **No state-machine-family import is reachable from a decide body**, not directly, not through a module `const` or class the body references, and not through a schema file the workflow imports. The family is any specifier equal to `xstate` or `@systemfsoftware/xstate`, or starting with `xstate/`, `@xstate/`, `@systemfsoftware/xstate/` or `@systemfsoftware/xstate-`. That includes the fork's `/fsm` entry: a table's `transition` returns the input snapshot both for an event no state handles and for a declared stay, so a decider built on it merges every illegal pair into one refusal and cannot express a legal stay. Machines live in the shell (`shell-machines-follow-events.md`). The rules match specifiers, so a machine-typed value exported by a package outside the family is the one route left to review (the fourth residual below).
- **A durable lifecycle's source of truth is the stored state variant the decision returned.** A lifecycle is durable when its state is persisted, when it waits for a human, a provider callback or a redirect, or when it spans a deploy. A replay success names no new state, so the stored value stays as it was. Crash recovery is a command the shell sends to the same decision, never a direct state write and never a recovery owned by the transport or store.
- **The shell stores the new state before running effects**, and a replay success runs no irreversible effect a second time (`store-serializable-unit-of-work.md`).

```ts
// WRONG: the decision steps a machine table. An illegal pair and a legal stay
// both come back as the input snapshot, so no refusal can say which pair it was.
import { createFSM } from '@systemfsoftware/xstate/fsm'

const review = createFSM({
  initial: 'submitted',
  states: {
    submitted: { on: { APPROVE: 'approved', REJECT: 'rejected' } },
    approved: {},
    rejected: {},
  },
})

export const decideReview = Workflow.make({
  command: ReviewOrder,
  decision: ReviewSnapshot,
  error: Schema.Never,
  decide: (cmd) => Result.succeed(review.transition(cmd.snapshot, { type: cmd.action })[0]),
})

// RIGHT: state × command dispatch. Each illegal pair is its own refusal, and an
// accepted replay is a named success.
export const decideReview = Workflow.make({
  command: ReviewOrder,
  decision: ReviewDecision,
  error: ReviewRefusal,
  decide: (cmd): Result.Result<Approved | Rejected | AlreadyApproved, ReviewRefusal> =>
    Match.value(cmd.state).pipe(
      Match.tag('Submitted', () =>
        Match.value(cmd.action).pipe(
          Match.tag('Approve', () => Result.succeed(Approved.make({ orderId: cmd.orderId }))),
          Match.tag('Reject', ({ reason }) => Result.succeed(Rejected.make({ orderId: cmd.orderId, reason }))),
          Match.exhaustive,
        )),
      Match.tag('Approved', () =>
        Match.value(cmd.action).pipe(
          Match.tag('Approve', () => Result.succeed(AlreadyApproved.make({ orderId: cmd.orderId }))),
          Match.tag('Reject', () => Result.fail(RejectAfterApproval.make({ state: 'Approved', action: 'Reject' }))),
          Match.exhaustive,
        )),
      Match.tag('Rejected', () => Result.fail(ReviewClosed.make({ state: 'Rejected', action: cmd.action._tag }))),
      Match.exhaustive,
    ),
})
```

Unnamed incidents, all observed on 2026-10-10:

- an agent-run lifecycle was a hand-rolled string union whose transitions were spread over a SQL insert, a reassigned local and a raw-SQL startup recovery sweep;
- a next state was chosen by reading a shared mutable object;
- database writes and event mirroring were interleaved with transitions;
- a durable lifecycle had no decider, and recovery rewrote its state in raw SQL.

Five residuals stay with review, because no one-file rule can see them:

- a single branch that the `src` complexity ceiling of 2 admits in service code, because the ceiling counts branches, not whether one carries a business choice;
- a choice carried by a data lookup not keyed by `_tag`, because a lookup by any other key is indistinguishable from reading configuration;
- a decide body that hands its state × command dispatch to a schema-file operation, because schema files hold the sanctioned pure projections and evolves over unions, and a one-file rule cannot tell a projection from a delegated choice;
- a machine-typed value reached through a non-family `@systemfsoftware/*` package that a schema file imports, because the lint host resolves specifiers, not types;
- an event type in a machine's event union that no state's `on` table names, because the fork types every `on` key as optional and comparing states with one another cannot reach the event union.

Gate: `type-checker`, `make-body-purity`, `workflow-match-exhaustive`, `workflow-decides-through-match`, `schema-file-imports-pure-modules-only`, `review` — the chain's `decide` method accepts only a `WorkflowBrand`-branded workflow, so a bare function fails compilation; `make-body-purity` refuses control flow in the body beyond one converging first-statement guard, and an I/O import, a state-machine-family binding, module-level state, a mutable local, an I/O global or an unbound name that the body references directly, through a same-file helper function it calls, through a function member of a module record it touches, or inside the initializer of a module `const` or the body of a module class it references; `workflow-match-exhaustive` refuses, in a `Match.value(...).pipe(...)` dispatch in the body, in a same-file function or class the body references transitively or in a record method it calls, a `Match.tag` dispatch not ended by `Match.exhaustive` and a `Match.orElse` unless the dispatch is an object-literal `Match.when` record with no tag arm; `workflow-decides-through-match` refuses, in the body, in every same-file function or class it references transitively and in every record method it calls, a success that wraps the matched value unchanged and a member read keyed by a `_tag` value; `schema-file-imports-pure-modules-only` refuses a state-machine-family value import, dynamic import, `require()` (including `import ... = require(...)`) or re-export in a schema file. Review owns everything else this rule states: what a schema-file operation the body calls does inside its own body, the five residuals above, whether a value counts as a lifecycle, and that the shell stores the union before running effects and runs no irreversible effect twice for a replay.
