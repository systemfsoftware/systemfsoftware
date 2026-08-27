# An Exported Schema Nothing Decodes Still Costs Its Whole Obligation Tree

Decision: a schema is exported because a consumer decodes with it, never because a type was
convenient to derive. Where only the type is wanted, keep the schema value unexported and derive
from the smallest base that carries the discriminant.

## The argument

1. The obligation scan walks every refinement reachable from an **exported** schema. It is the
   mechanism behind `schema-refutations.test.ts`: for each weakened arm it draws candidates and
   asks which the real schema rejects.
2. Reachability is transitive through composition. A union arm typed `options: StrykerOptionsSchema`
   puts every refinement in that sixty-field tree inside the scan's reach.
3. The scan's cost per arm is not a constant. For each arm it samples the weakened schema twice at
   the witness budget and decodes every draw against both the weakened and the real schema —
   512 draws and 1024 decodes of whatever the schema describes.
4. So exporting one schema whose arm reaches a large tree multiplies that tree's refinement count
   by the per-arm cost, and it does so whether or not anything ever decodes with the export.

The last clause is the whole point. Cost is paid for reachability, not for use.

## What it looked like

`CliRequest` was `S.Union([RunRequestSchema, LlmsRequestSchema])`, exported from a `.schema.ts`
module. Two facts about it:

- Nothing decoded it. Every use in `Cli.ts` was a type position; the CLI builds requests as object
  literals from flags Effect's CLI parser has already typed, and reads them back out of a `Ref` in
  the same process.
- Its `.Type` was discarded at the point of declaration and hand-patched:
  `Omit<typeof RunRequestSchema.Type, 'options'> & { options: PartialStrykerOptions }`.

That second fact was the tell. The patch existed because the schema said `options:
StrykerOptionsSchema` — the fully resolved option set — while the value carries only the partial
overlay a command line names. A declaration whose derived type has to be corrected at every use is
not describing the data.

## The measurement

Deleting the export and deriving the types from two unexported `S.TaggedStruct` bases:

|        | obligation scan                                                | package suite |
| ------ | -------------------------------------------------------------- | ------------- |
| before | 15,008 ms (exceeded the runner's limit, reported as a timeout) | 19.5 s        |
| after  | 890 ms                                                         | 2.75 s        |

Seventeen times, from removing a codec that had no callers.

## Two wrong diagnoses to skip

**It is not the test runner.** The first response to a scan that overruns its limit is to raise the
limit. That converts a measurement into a silence: the scan still walks the same tree, and the
number that would have told you the schema was wrong is now inside the budget. Raising a timeout to
accommodate a cost is the same move as widening a threshold to accommodate a failure.

**It is not a missing `arbitrary` annotation.** The obvious second theory is the rejection trap —
an unannotated `S.check(S.isPattern(...))` degrading to filter-then-validate, so the witness hunt
burns its budget discarding non-matching draws. That theory is false for Effect v4's built-in
checks: `SchemaAST.isPattern` attaches `arbitrary: { constraint: { patterns: [regExp.source] } }` to
the filter itself, and the ordered checks contribute bounds the same way. Adding annotations beside
a built-in check duplicates what the library already did. The trap is real only for a hand-written
`makeFilter` predicate, which carries no constraint.

## The smell

Reach for this when a schema module shows any of:

- an exported schema whose `.Type` is immediately `Omit`-ed, intersected, or otherwise corrected;
- an export whose only consumers are type positions — `lsp references` distinguishes this in one
  call;
- a refutation or law suite whose runtime is dominated by one schema.

The remedy is the same in each case. Keep the base unexported, derive the type from it, and let the
scan see only what a consumer can actually decode.
