# A Label-Routed Rule Cannot Fail On The Case It Targets

Decision: retire the role-suffix taxonomy. Route static analysis on keys the build derives, and
aim mutation and property testing at a boundary a manifest enforces.

## The argument

1. A filename suffix is an author's assertion about a file's contents.
2. A rule routed by that assertion runs only on files that carry it.
3. So the rule never runs on the violation it exists to catch: an author whose module holds an
   Effect runtime import simply does not write `.kernel.ts`, and `kernel-no-effect-runtime` stays
   silent. The rule has full precision against nothing.
4. A check that can only agree is not a check. Routing a rule on the property it is checking is
   circular in exactly the way a gate passed by stuffing its own keyword is circular.

The conclusion does not depend on how many rules key on a suffix, how many files carry one, or
what any config currently globs. A label-routed rule with a thousand callers has the same defect
as one with none.

## What can route soundly

A key is sound when the author cannot silently opt out of it. Three are available, all derived
rather than asserted:

| key                                   | who derives it                      | how opting out shows up                |
| ------------------------------------- | ----------------------------------- | -------------------------------------- |
| a return type                         | the type checker, from the term     | the module stops compiling             |
| an import edge, or a whole-graph fact | the module graph                    | the edge is in the graph               |
| membership of a package               | the manifest and project references | a new dependency appears in a manifest |

A suffix is none of these. It is a comment in the filename.

The last two rows are wider than they first look, and the width is load-bearing. A key may be a fact
about the _whole_ graph rather than one file — "how many exported Layers provide this port" is
derivable, and no per-file inspection can see it. Restricting the class to single-file edges makes
several genuinely derivable rules look label-only.

## Demonstration

Two files, byte-identical content, differing only in suffix, each holding
`Effect.runSync(Effect.sync(() => Date.now()))`:

| file                | `kernel-no-effect-runtime` | `no-date-now-in-effect` |
| ------------------- | -------------------------- | ----------------------- |
| `probe.kernel.ts`   | fires                      | fires                   |
| `probe.executor.ts` | silent                     | fires                   |

The purity rule evaporates on rename. The rule that held selects on an import edge —
`packages/oxlint-plugins/core/src/rules/no-date-now-in-effect.ts:45-52` sets a flag from
`ImportDeclaration` and gates on it, touching the filename only to exclude tests. One repo, one
runner, two selection strategies, and only one survives a rename.

`executor-requires-deps-tag` states the escape in its own message: "or rename the file to the cell it
actually is."

The replacement boundary was checked the same way. A package whose manifest does not declare `effect`
cannot import it: `TS2307: Cannot find module 'effect'`, from the type checker, at the first import.
The suffix boundary is invisible when crossed; the manifest boundary is a type error.

## Purity is already carried

`CONSTITUTION.md` II.6 judges pure-versus-effectful by return type alone and forbids inferring it
from a folder or a package. A `kernel` suffix is a second, weaker statement of a fact the type
already carries: `Effect<A, E, R>` in the signature settles it, and a rename cannot.

Two labels for one fact are one thing with two names, and the redundant one is deleted. The suffix
is the redundant one, because it is the one that can lie.

## The mutation glob has the same defect

A narrow glob is a label-routed check wearing different clothes. `mutate: ["src/**/*.workflow.ts"]`
says: a decision that moves out of a workflow-named file stops being measured, and nothing reports
that it stopped. Rename the file and the measurement evaporates, exactly as the lint rule did.

So the aiming question is the same question, and it has the same answer: aim at a boundary that
cannot be left by renaming.

That is measured, not argued. `packages/effect-daemon-spec` aims at
`src/**/*.workflow.ts` plus `src/**/*.schema.ts` — one workflow file out of forty-two source files —
and reports **score 100, 12 killed, 0 survived**. Widened to the package with tests and declarations
excluded, the same suite over the same code reports **score 74.2, 67 killed, 42 survived**.

The forty-two survivors the narrow glob was not looking at sit in `daemon-metrics.kernel.ts`,
`intensity-window.kernel.ts`, `restart-decision.kernel.ts`, three `supervision-*.state.ts` files and
`mod.ts`. They are pure decisions, which is what the instrument is for.

The package's own `stryker.config.json` mutate globs leave `*.kernel.ts` out of the mutated scope — `effect-daemon-spec` mutates `src/**/*.workflow.ts` and `src/**/*.schema.ts`, not `*.kernel.ts` — on the ground that kernels are observed instead by colocated K-law property tests, and `requireTestContribution` names that ground: a `*.kernel.property.test.ts` that kills no mutant nothing else kills fails the run. The widened run tested that
ground and it failed twice over: the kernel files hold survivors, and `requireTestContribution`
reported that deleting `src/internal/__tests__/restart-decision.kernel.property.test.ts` would leave
every mutant just as dead. The named substitute observer contributes nothing that another test does
not already contribute.

The widened run also produced 54 timeouts, almost all in `supervisor-body.executor.ts`. That is the
precondition failing where it should: mutating a module that performs I/O yields a mutant that hangs
rather than one that dies, so the timeouts mark the effectful boundary empirically instead of by
label. Aiming wide does not merely find more — it reports where aiming stops being meaningful.

Both instruments have a precondition — behaviour is a total function of its input — so aiming is
genuinely necessary and the suffix was the wrong answer to a real question. Globs name paths, so the
key must be path-shaped. Two path-shaped keys are sound, and both were demonstrated:

- a package that declares no I/O dependency: the import is `TS2307: Cannot find module`.
- a package whose tsconfig sets `types: []`: a builtin import is `TS2591: Cannot find name 'node:fs'`.

Together those make a boundary that _cannot_ perform I/O, with violation reported by the type checker
rather than by a rule that has to be pointed at the right file first.

## Why the pure boundary is not a new package

The tempting move is to extract every pure decision into one such package and aim the instruments at
it. That is the folder split under another name: it relocates code by purity, which II.6 forbids
inferring and which the FCIS ruling rejects because folder geometry satisfies the diagram rather than
the dependency graph, and destroys change-locality. A feature's decision, its schema and its I/O end
up in three packages.

The boundary is worth having where a package is _already_ pure for its own reasons. It is not worth
manufacturing by moving code.

What replaces the narrow glob is simpler: aim at the whole package. No rename escapes it, there is no
silent complement, and the score becomes a claim about the package rather than about a naming
convention. Impurity inside stays rare and declared, because the purity rules below hold everywhere
rather than only where a filename invited them.

## The shape that results

- Modules named for their subject, one concern each, no role marker. Purity read off the signature.
- The purity rules made uniform. `no-effect-runtime`, `no-ambient-impurity` and `no-throw` are things
  to want of every module; routing them by suffix left every other module free to do the thing.
- Mutation and property testing aimed at whole packages, so nothing is unmeasured by omission.
- Per-role rules re-keyed onto the derivation they were always about, not deleted wholesale. A rule
  whose property is real keeps working once its selector is; a rule with no property to re-key had
  nothing to lose.

Thirteen labels and the rule surface routed on them collapse to the type system, the module graph,
and two manifest facts.

## Candidates, and why the losers lost

- **Keep the suffixes, add rules.** Loses to (3): more unfalsifiable rules is more precision
  against nothing.
- **Keep the suffixes, compile the cells so a role becomes a type.** The type half is right and is
  the same derivation as the table above. It loses as a _tree-wide_ mechanism because an
  expression language cannot reproduce an imperative body byte-for-byte — a module that
  accumulates into a mutable local through a `for` loop has no expression form, so compiled
  authorship cannot cover the population it would have to govern.
- **Folder split, `pure/` beside `shell/`.** Loses to II.6 directly: it re-encodes purity in
  placement, which is the same category error as the suffix with a different separator.

## The falsification, and what it changed

The test was run rather than assumed: three reviewers were asked to find one rule whose property is
expressible neither as a type nor as a graph fact, and which genuinely must not apply to every
module. Two found none across twenty-two rules. The third produced three, argued in full, and all
three re-keyed:

- **`store-no-driver-construction`** — "no driver import here" is the FCIS import direction. Keyed on
  the manifest, a driver import is `TS2307` rather than a lint report.
- **`adapter-single-layer-export`** — the unit is the **port**, not the file. Keyed per-port over the
  graph, a composition root binding many different ports passes, while one file exporting three
  Layers for a single port is caught. The suffix rule permits that file, and has a passing test
  asserting it should.
- **`handler-match-tag-or-else`** — "handler versus workflow" was a proxy. The real criterion is
  whether the module **owns** the matched union: own it and `exhaustive` is safe, import it and a
  variant added elsewhere breaks this build remotely. Keyed that way it also catches the workflow
  exhaustively matching a foreign union, which the suffix rule cannot see.

Each re-keying fires on a case the suffix version structurally cannot reach. That is the finding: the
suffix was not the load-bearing part, it was the weaker instrument standing where the real key
belonged. It also amends the ruling — the third reviewer's objection would have stood under a narrow
reading of class (ii), so package membership and whole-graph facts are inside it by construction.

Status: the manifest re-keying is demonstrated. The per-port and owned-union re-keyings are
derivations with their mechanism named; each needs a rule written before it is a gate.

## The recurrence, and the one label that does hold

The failure returned in the session that abolished the dotted suffixes, and it returned by the hand of
the agent applying this document. `behaviour-exercises-use-case` demanded that a `*.integration.test.ts`
import a module whose basename ended in `Executor`, `Handler`, `Adapter`, `Store` or `Middleware`,
which is this document's defect with the label moved from the dotted position into the module name.
The renaming pass that put role words into 21 shell module names is good documentation and was
mistaken for evidence.

A probe settled it in one run: a pure kernel, `ZzPureAdapter.ts`, holding one total function and no
import at all, reached by a behaviour test that touched nothing else. The rule stayed **silent**. The
gate certified "this test drives a use case through the I/O sandwich" on the strength of five letters
the author typed, and no step recomputed whether the module did any I/O — `CHK1` exactly, in a rule
written to enforce this document.

Which side of the sandwich an imported module sits on is not decidable from the importing file: one
file carries no cross-file and no type information. So the rule was narrowed to the part that is —
whether the file reaches the package under test at all — and the role word was demoted to what it
honestly is, a note to the reader. Every behaviour test that had satisfied the old form by naming a
role-suffixed module still passes, because each reaches package code; a test reaching nothing but its
runner was silently accepted before and is now reported.

The same session found the one nearby label that **does** hold, and it holds because it is not a
label. `Policy<Xi> = <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | Xi, R>` forbids a domain
decision by parametricity: with `A` universally quantified there is no way to construct or inspect an
`A`, so no branch on domain content can be written. Probed, the compiler rejects the attempt at the
offending member access — `TS2339: Property 'kind' does not exist on type 'A'` — with no rule
installed and no filename consulted. The limit is `REPO-A4`: nothing forces the annotation. The same
body written monomorphically, declaring no `Policy`, typechecks clean. What binds is the door — a
combinator or application site whose parameter is typed `Policy<Xi>` — never the file's name. A
`*.policy.ts` suffix would have added a rule that fires only on files already carrying the suffix,
which is this document's opening sentence.

## What would still defeat this

A rule whose property is real, is expressible as no type fact, no graph fact and no package
membership, and must not hold for every module. None has been produced.
