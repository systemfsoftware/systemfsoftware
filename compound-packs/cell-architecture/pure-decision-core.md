---
title: Pure decision core functions must be single-path total expressions with cyclomatic complexity 1
applies_when:
  - authoring or changing a domain decision function or workflow
  - writing business logic that evaluates commands and produces decisions or errors
  - reviewing code in *.workflow.ts or pure decision files
  - choosing control flow constructs (if/else, switch, ternary vs Match.exhaustive)
tags: [cell-architecture, pure-core, cyclomatic-complexity, match-exhaustive, expression]
---

# Pure decision core functions must be single-path total expressions (Cyclomatic Complexity 1)

Every domain decision must be authored as a pure function — data in, a value or typed error out — executed as a single-path expression with Cyclomatic Complexity = 1 (`CONSTITUTION.md` CONST-P1, CONST-P2).

Choice must be modeled as exhaustive dispatch over a closed tagged type (via `Match.value(cmd).pipe(...)` or `Match.type<Cmd>().pipe(...)` terminating in `Match.exhaustive`), and iteration must be expressed as functional transformations (`map`, `filter`, `fold`), never imperative procedures.

## Doctrine & Constraints

- **No imperative branching in the core**: `if/else`, `switch`, ternary `?:`, and logical operators (`&&`, `||`) used for control flow are strictly forbidden in decision bodies.
- **No loops**: `for`, `while`, and `do...while` are forbidden; repetition belongs in `map`/`fold` expressions or in the shell.
- **No unhandled variants**: Every branch of a tagged union must be handled explicitly. Wildcards, `Match.orElse`, or fallback catch-alls on closed unions hide unhandled states and defeat exhaustive compiler verification.
- **No side-effects or async handles**: A decision core never executes I/O, reads clocks (`Date.now`), calls random generators, throws exceptions, or returns eager promises or Effect handles. If it needs the runtime, move the boundary.

## Calibration Examples

- **wrong**:
  ```ts
  // Procedural branching with if/else and ternary: complexity > 1
  export function decideDiscount(customer: Customer, cart: Cart): DiscountDecision {
    if (customer.isVip) {
      return cart.total > 100 ? new HighDiscount() : new LowDiscount()
    } else {
      return new NoDiscount()
    }
  }
  ```
- **right**:
  ```ts
  // Single-path expression via Match.exhaustive: complexity = 1
  export const decideDiscount = (customer: Customer, cart: Cart): DiscountDecision =>
    Match.value(customer.status).pipe(
      Match.tag('VIP', () =>
        Match.value(cart.isEligibleForHighDiscount).pipe(
          Match.when(true, () => new HighDiscount()),
          Match.when(false, () => new LowDiscount()),
          Match.exhaustive,
        )),
      Match.tag('Standard', () => new NoDiscount()),
      Match.exhaustive,
    )
  ```

## Verification & Gate

- `lint`: Static analysis via oxlint `complexity` rule (`max 1` in `*.workflow.ts`) rejects any decision with cyclomatic complexity > 1.
- `type-checker`: `Match.exhaustive` ensures that adding a variant to the input tagged union causes a compile-time failure until handled.
