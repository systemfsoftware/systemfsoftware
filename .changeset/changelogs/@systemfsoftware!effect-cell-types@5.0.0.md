## 5.0.0

### Major Changes

- A phase can no longer require a service. `Phases` drops `readContext` and
  `writeContext`, and a read or write phase must return an effect whose context is
  `never`.

  Those two members were a claim about what a phase needed that nothing
  recomputed. Whenever the surrounding stage was generic over `Phases`, the
  compiler could not see through the type parameter to what the phase body
  actually reached for, so declaring `never` for a body requiring four services
  was accepted. The description then compiled clean and the missing service
  surfaced only wherever it was finally applied, or nowhere at all.

  Services now arrive the same way a phase's other inputs already do: as
  parameters. Resolve them where you build the description, take them as an
  argument, and provide them to the phase's own effect with
  `Effect.provideContext`. Both mistakes that used to pass now fail — claiming
  less than the body needs leaves the phase's context wider than `never`, which
  the phase type rejects, and claiming more than it needs widens the requirement
  of whoever builds the description, which surfaces where that builder is run.

  `apply` therefore derives a context of `never` for every description, and a
  caller can no longer be handed a requirement it never agreed to.

- The wire surface is now the seven symbols it always claimed to be: the mark,
  the minted types, `mint`, `Fields` and `wire`. Fifteen convenience wrappers
  around the schema library are gone. A member you built with a wrapper decodes
  to exactly what it decoded to before; only the spelling changed.

  To migrate, wrap the schema library member in `mint` where you used a wrapper:

  - `string`, `number`, `boolean`, `integer` → `mint(S.String)`,
    `mint(S.Finite)`, `mint(S.Boolean)`, `mint(S.Int)`
  - `literal(...v)` → `mint(S.Literals([...v]))`; `union(...m)` →
    `mint(S.Union([...m]))`; `tuple(...t)` → `mint(S.Tuple([...t]))`
  - `nullOr(m)` / `undefinedOr(m)` / `nullishOr(m)` / `array(m)` /
    `optional(m)` / `record(k, v)` / `suspend(t)` → the same letter under
    `mint`, e.g. `mint(S.NullOr(m))`, `mint(S.Array(m))`, `mint(S.Record(k, v))`
  - `refine(m, predicate)` → `mint(S.refine(predicate)(m))`

### Minor Changes

- A write phase now receives what its own layer's read gathered, as a second
  argument after the encoded output.

  This is for the common shape where a write persists or reports on what the read
  found while the decision in between narrowed to what it needed. Until now such a
  write had no channel for that value, so the layer had to keep it in a mutable
  binding beside the description — assigned during the read, read back during the
  write — and then guard at runtime against a value that was in fact always there.
  The argument replaces that binding and the guard with it.

  Writes that do not want the value are unchanged: a write declaring a single
  parameter still satisfies the phase type, so nothing you have already written
  needs to move.
