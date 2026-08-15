# Cell Constraints With No Owner

Thirteen operator-layer rule files, one per cell suffix, were removed on the ground that a
file outside the clone can never own a repository rule. They are archived at
`/root/.omp/agent/architect-cell-rules.tar.gz`. Most of what they carried is owned elsewhere —
by a lint rule, by a compiler diagnostic, or by a named review call in the plugin leaf that
implements the cell. The constraints below are the residue: named in the archive, enforced by
nothing now, and each needing an owner or an explicit decision to drop it.

The distinction that matters per rule is whether the thing it read is a relation between units
or a fact interior to one. An edge is what a static analyser reads most reliably; an interior
fact is what it reads worst, and it fails at the first indirection.

## No owner

| #  | Constraint                                                          | Where it lived            | Why nothing carries it                                                                                                                                                                                                                                               |
| -- | ------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1 | the `*.schema.ts` import column                                     | `architect-schema.md`     | `CELL_IMPORT_TABLE` has no `.schema.ts` key — verified, the table keys `.middleware.ts` and `.adapter.ts` but not this one                                                                                                                                           |
| O2 | the `*.acl.ts` import column                                        | `architect-acl.md`        | same table, no `.acl.ts` key                                                                                                                                                                                                                                         |
| O3 | a workflow decider may not throw, and may not read ambient impurity | `architect-workflow.md`   | the rules were deleted under an authorship-gate licence that a later commit revoked, and the channel markers do not reach it — `Inhabited<D, E>` constrains the decision and error channels only, so a decider that throws or reads the clock satisfies it untouched |
| O4 | a handler may not call `next()`                                     | `architect-handler.md`    | no rule in `effect-handler` reads it                                                                                                                                                                                                                                 |
| O5 | a handler may not use try/catch                                     | `architect-handler.md`    | no rule reads it; `tryCatchInEffectGen` catches the generator case only                                                                                                                                                                                              |
| O7 | a middleware may not hold module-scope state                        | `architect-middleware.md` | the sibling cells are linted for this and middleware is not                                                                                                                                                                                                          |

`O6` — a kernel may not declare an `async` function — is **not** an orphan. It is enforced
repo-wide by `asyncFunction: "error"` in the Effect language-service policy, which every
package inherits through the shared tsconfig. It is the case where the compiler already
carried the constraint the rule restated.

## What an owner looks like

O1 and O2 are edge constraints, but the existing columns cannot express them. The table's
`forbidValue` arm fires on a runtime binding, and the leak these two exist to stop is
type-only — a domain declaration written as an indexed access on a vendor type. Measured in a
consumer of this apparatus, a schema cell declares `type ChainEvents = TxFinalized['events']`
and gives it a codec of `S.declare((input): input is ChainEvents => Array.isArray(input))`.
Nothing in the sibling anti-corruption layer can repair that, because the domain type _is_ the
foreign type and no translation is expressible; the four shipped ACL rules all pass.

So the column these two need forbids a **type** import whose specifier resolves outside the
workspace, which no arm of the table currently carries. The predicate is still an edge fact and
still decidable — the specifier either resolves to a workspace member or it does not — so the
class is right and only the arm is missing. Adding it is a new published rule and a
costly-to-reverse choice, so it is researched and recorded before it is written, never
defaulted into.

The governing discriminator is not who wrote the producer but where the bytes have been: a
value that crossed a process, machine, runtime, disk, or serialisation boundary since this
process established its invariants is foreign, including a file this program wrote an hour ago
and a row from its own database. In a structurally typed language the decoded value earns no
new nominal type on its own, so an alias over the inferred type accepts a mutated object, a
hand-built lookalike, or a cast — and the guarantee is ported only by branding the decoded
output, so downstream code cannot manufacture the type without the codec having run.

O3, O4, O5 and O7 are interior. Each is decidable at depth zero — a `throw` statement, a call
to `next`, a `try` block, a module-level initializer — and undecidable one indirection out,
behind a wrapper call. A rule for one of these is worth having at exactly the depth it can
read, with a message that claims no more than its predicate decides; the failure mode to avoid
is a message asserting the semantic property while the predicate matches a spelling.

O3 additionally cannot move into the description types as they stand. The markers are about
the channels, so the type has no place to say "and the body performs no I/O" — the phase
record's `kind` field states purity as data rather than constraining it.

## Residue

Four plugin leaves still contain a dangling reference to "the skill" as the owner of a
constraint. Two of them sit in leaves whose spec citations were otherwise removed.
