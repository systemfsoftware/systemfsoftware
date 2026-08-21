## 2.0.0

### Major Changes

- Removes `ban-classes`. Drop the entry from your config if you set it.

  The rule rejected every class declaration outside an allow-list of Effect constructors, which put `Context.Service` keys and hand-written adapters permanently in violation — reachable only by naming each one in a `whitelist` option.

- Two rules are removed: `no-escaping-module-state` and `no-effect-service`. Both are gone from the shared base config, so a project extending it needs no change; a project naming either rule directly must delete that entry, and a project relying on either for enforcement should know neither was enforcing much.

  `no-escaping-module-state` refused a module-scope `Map`, `Set`, `Ref`, `Deferred`, `Queue` or semaphore. It read one file's syntax, so it decided the question only for the spelling it happened to see: the same primitive reached a consumer unreported through an object or array literal, a class static field, a `globalThis` assignment, a factory return, a destructured or computed member, or an immediately-invoked function. Its type-annotation arm was keyed on a closed list of type names, which meant every primitive absent from the list — the STM and concurrent families among them — passed, and every future one would need adding by hand. It also refused the shape its own message prescribed, reporting a module-private binding that was never exported at all.

  `no-effect-service` refused `Effect.Service`. Effect v4 exports no `Service` from the `Effect` module, so every use of it is already a type error naming the exact expression and offering the replacement — the rule restated a compiler diagnostic, and restated it only for a direct member access on a named import, missing a local alias, a computed key, a destructure, a namespace import, a cast, a re-export and a default import.

  Declare a service as `class X extends Context.Service<X, Shape>()('id')`, adding a `make` option when the module owns its single construction. Build a coordination primitive inside the function that yields the surface and export the operations rather than the interior — `withLock(key, effect)`, `joinInFlight(key, effect)`, `read()` — so a caller depends on behaviour and swapping the interior or adding backpressure breaks nobody.

### Minor Changes

- The plugin now recommends its own rules. `configs.recommended` lists every rule it ships at
  `error`, so a configuration can spread it instead of transcribing the rule names:

  ```ts
  import house from '@systemfsoftware/oxlint-plugin'

  export default {
    plugins: ['@systemfsoftware/oxlint-plugin'],
    rules: { ...house.configs.recommended.rules },
  }
  ```

  A hand-written list drifts silently — a rule added here never reaches a configuration that
  spelled its predecessors out, and a renamed rule is reported as unknown at most once. Every
  sibling plugin in this family already published this shape

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

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Rescope three rules that over-rejected legitimate files.

  Each was a measured false positive, not a theoretical one — all three fired on files written in the
  course of shipping `Workflow.make`:

  - `cell-suffix-required` rejected `src/Workflow.ts`, a PascalCase contract module whose basename names
    no cell because it _is_ the package's published contract. It now exempts that shape.
  - `no-manual-tag-member`, `no-direct-tag-access`, and `ban-data-taggederror` rejected `**/*.tst.ts`
    type-test fixtures, which must contain no runtime values and therefore cannot use
    `S.TaggedStruct`. The fix each rule suggested was impossible in the file it was suggesting it for.

  This is the cost the cell-taxonomy derivation already prices: a depth-0 rule cannot miss its target, but
  its predicate is a proxy for the property actually wanted, so it over-rejects — and that cost is meant
  to be priced per rule rather than waved away. Three rules, three over-rejections, all rescoped by
  narrowing the predicate; none was deleted and no config was weakened.
