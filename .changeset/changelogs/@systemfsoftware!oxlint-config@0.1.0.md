## 0.1.0

### Major Changes

- Two rules are removed: `no-escaping-module-state` and `no-effect-service`. Both are gone from the shared base config, so a project extending it needs no change; a project naming either rule directly must delete that entry, and a project relying on either for enforcement should know neither was enforcing much.

  `no-escaping-module-state` refused a module-scope `Map`, `Set`, `Ref`, `Deferred`, `Queue` or semaphore. It read one file's syntax, so it decided the question only for the spelling it happened to see: the same primitive reached a consumer unreported through an object or array literal, a class static field, a `globalThis` assignment, a factory return, a destructured or computed member, or an immediately-invoked function. Its type-annotation arm was keyed on a closed list of type names, which meant every primitive absent from the list — the STM and concurrent families among them — passed, and every future one would need adding by hand. It also refused the shape its own message prescribed, reporting a module-private binding that was never exported at all.

  `no-effect-service` refused `Effect.Service`. Effect v4 exports no `Service` from the `Effect` module, so every use of it is already a type error naming the exact expression and offering the replacement — the rule restated a compiler diagnostic, and restated it only for a direct member access on a named import, missing a local alias, a computed key, a destructure, a namespace import, a cast, a re-export and a default import.

  Declare a service as `class X extends Context.Service<X, Shape>()('id')`, adding a `make` option when the module owns its single construction. Build a coordination primitive inside the function that yields the surface and export the operations rather than the interior — `withLock(key, effect)`, `joinInFlight(key, effect)`, `read()` — so a caller depends on behaviour and swapping the interior or adding backpressure breaks nobody.

- The core regime keys on the `Workflow.make` boundary; the complement gains a complexity ceiling.

  - `workflow-match-exhaustive` no longer reads the filename: the gate is the make callee boundary
    (import binding + member `make` + argument containment, module-scope references followed,
    shadow-correct). Identical dispatch outside a make body produces no diagnostic.
  - New `make-body-purity`: references inside make bodies resolve only to parameters, const locals,
    and audited-pure imports; control flow is banned with the one first-statement converging guard;
    unclassifiable references report honestly as unresolvable rather than passing. Test files are
    exempt — fixtures exercise decisions without the production regime binding them.
  - New `no-domain-branching-density` in core: per-function McCabe CC outside make bodies, ceiling
    17 — the lowest measured value the tree passes with zero waivers (max measured 17; the 15
    functions over 10 are the recorded extraction backlog, not retrofit targets).
  - Both make-boundary rules fix classifier defects their first workspace run exposed: builtin
    globals with empty defs take the named-global triage, and `as const` type subtrees leave the
    value-reference walk.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/oxlint-plugin@2.0.0
  - @systemfsoftware/oxlint-plugin-effect-dmmf@3.0.0
  - @systemfsoftware/oxlint-plugin-effect-schema@3.0.0
  - @systemfsoftware/oxlint-plugin-effect-workflow@3.0.0
  - @systemfsoftware/oxlint-plugin-test-placement@3.0.0
