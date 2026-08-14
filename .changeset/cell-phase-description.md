---
"@systemfsoftware/effect-cell-types": minor
---

Add `Cell` — an I/O sandwich whose phase order is carried by types.

`Cell.Phases` names the five stages of one sandwich, and each chaining constructor returns a type carrying the required member the next constructor's parameter demands, so a wrong order omits that member and fails to compile. The diagnostic is the instruction: the member's name is a sentence, so composing `decode` before `read` reports `Property 'call read(command) before decode(raw)' is missing in type 'DecideDone<Bag>' but required in type 'ReadDone<Bag>'`.

The stages are siblings rather than a hierarchy. Under a hierarchy a later stage is assignable to an earlier stage's parameter and an inversion still compiles; as siblings, every inversion is a missing member. The constructors are dual, data-last overload first, so a description reads in the order it runs when written in `pipe`.

Both kinds of `Left` are carried by the phase types rather than chosen by the interpreter. A `decode` `Left` is fatal — nothing consumes it, so its only route is the derived error channel and no write runs. A `decide` `Left` is an outcome: `EncodePhase` receives the whole `Either`, so it cannot be unwrapped and both branches reach the write.

`Cell.apply` is the interpreter — the one place a description becomes effects. It folds the phases in declared order and derives the error channel from the phases it was handed.
