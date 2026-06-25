# Constitution

## Preamble

We establish this Constitution as the supreme design law of this repository. It is opinionated by intent — the considered judgment of how software here is built — and it binds every file, regardless of age or author. It is amendable; that is its safeguard against dogma.

It states principles, not tools or languages. Frameworks, libraries, the language, and lint rules live in `AGENTS.md`, the skills, and the ADRs — never here. The exemplars use neutral type notation (sum types and `name : Input -> Output` signatures) so no principle pins to one stack.

Read each section as directives: **DO**, **DON'T**, the **HARM** it prevents, and the **CHECK** that enforces it. Comply with the directive and its harm — not with the prose around it. A section also carries an **EX** — a WRONG/RIGHT example — when the directive alone is misread-prone, that is, when the wrong and right forms look alike; a self-evident directive carries none.

## Quick Reference

| Article                | Principle                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I — The Pure Core**  | Decisions are pure; types come first; errors are variants; values are branded; null is not a state; the pure core has one path.                                                   |
| **II — The Boundary**  | Core and shell separate; effects are values; read→transform→write; dependencies point inward; decode never cast; purity is per-function.                                          |
| **III — Verification** | The Testing Trophy; properties over examples; mutation is the measure; behavior lives where the mutator sees it; pin behavior before you rebuild.                                 |
| **IV — Organization**  | Organized by what it does; names scream the domain; fits in the head.                                                                                                             |
| **V — Conduct**        | Depth over expedience; scope discipline; precedent is not authority; API-first discovery; challenge before you commit; no silent bypass; subtract before you add, at every scale. |
| **VI — Amendment**     | How this document changes.                                                                                                                                                        |

## Application

Four rules govern how this document is used. Read them first.

1. **By purpose, not by quotation.** Invoke a principle by showing the harm it prevents is present. Do not quote a sentence as standalone proof. Where letter and purpose diverge, purpose governs and the text is amended. Ask "does this harm occur here," never "which clause can I cite."
2. **Prefer the gate.** Any principle that can fail a command — a type error, a lint rule, a mutation threshold, a dependency check — shall. A failing build, not a cited clause, is the final word. Each section names its CHECK.
3. **Evidence before done.** "Done" means a gate passed or a test shown. A reported score is not a verified one; a claimed "it works" is not a test. No evidence, no compliance.
4. **Supreme, and amendable.** This governs `AGENTS.md`, lint, and the ADRs where they conflict with it. It is amendable (Article VI). Contestable design choices — suffixes, patterns, module shape — live in ADRs, not here.

---

## Article I — The Pure Core

**§1. Purity.**

- DO: write each domain decision as a pure function — data in, a value or a typed error result out.
- DON'T: inside a decision, perform I/O, throw, read a clock, use randomness, or return an effect handle. If a decision needs the runtime, move the boundary — not the purity.
- HARM: logic you cannot test over all inputs, or trust.
- CHECK: lint (decision files import no I/O or effect-runtime modules); mutation covers them.

**§2. Types Before Logic.**

- DO: define the types before the behavior; make illegal states unrepresentable so bad data fails to compile.
- DON'T: start from functions and add types afterward.
- HARM: invalid data reaches runtime; tests multiply to cover what a type could have forbidden.
- CHECK: the type-checker; review.

**§3. Each Error Its Own Variant.**

- DO: give every distinct failure its own tagged variant in the error type.
- DON'T: distinguish failures by a boolean flag or a string field.
- HARM: callers cannot branch on the real failure; distinct errors collapse into one case.
- CHECK: lint; review.

**§4. No Primitive Obsession.**

- DO: brand every value that carries domain meaning (ids, amounts, codes) as its own type.
- DON'T: pass a bare text or number in a domain-significant position.
- HARM: values get transposed or misused; the type says nothing about what they are.
- CHECK: lint (no bare primitives in domain signatures).

**§5. Null Is Not a State — but absence is fine for optional data.**

- DO: model mutually-exclusive states as a tagged union — one variant per state, each carrying only its valid fields.
- DO: use a plain nullable for a value that may be absent identically in every state.
- DON'T: encode a state by which fields are present. DON'T wrap such a field in an `Option`/`Maybe` to "fix" it — the wrapper renames the hole, it does not close it. The question is never "null or `Option`"; it is "a value that may not exist, or a state in disguise."
- HARM: a state machine hidden in a record; the compiler cannot reject invalid field combinations.
- CHECK: lint (flags an optional that correlates with the discriminant — not plain optionals); review.

```
WRONG  Order { status, shippedAt?, trackingId? }      state by presence; an Option wrapper is the same defect
RIGHT  Order = Pending { placedAt }
             | Shipped { placedAt, shippedAt, trackingId }
FINE   Customer { name, middleName? }                 genuinely optional; plain nullable, no wrapper
```

**§6. The Pure Core Has One Path (Cyclomatic Complexity 1).**

- DO: write each pure-core decision as a single path — express choice as exhaustive dispatch over a closed type (match on a tagged union), and iteration as map/fold. The core is an expression, not a procedure.
- DON'T: in the core, use control flow — `if`/`else`, `switch`, `?:`, `&&`/`||` for control, `for`/`while`. This bans the control-flow _form_, not branching itself: choice moves into a closed-type match, repetition into map/fold. Branching is relocated into data and calls — which carry no control-flow path — never eliminated. That is why a core function reads as one path while still deciding and iterating.
- SCOPE: this binds the pure core (decision and workflow files). The imperative shell is imperative by name — it sequences steps and iterates over them; its only structure is the sandwich shape (§II.3), and it carries no decisions. The complexity gate runs on core files, not the shell.
- HARM: every branch in the logic is an untested path where state silently diverges — the mutator reaches it, the suite does not.
- CHECK: lint — cyclomatic complexity = 1 on pure-core files. (Match, map, and fold are function calls, not control flow, so they hold complexity at 1; `if`/`switch`/loops raise it. The gate enforces match-over-if mechanically.)

```
WRONG  if (o.kind === "Shipped") ship(o) else hold(o)     two paths in a decision
RIGHT  match(o) { Shipped -> ship, Pending -> hold }       one exhaustive dispatch over a closed type
WRONG  fold over the data with a for-loop in the core      iterating the core as a procedure
RIGHT  fold(xs, 0, add)                                     iterate as one expression  (a shell loop is fine — that's the shell)
```

---

## Article II — The Boundary

**§1. Functional Core, Imperative Shell.**

- DO: split every module into a pure core (decisions) and a thin shell (I/O); pass plain serializable data across the seam.
- DON'T: let a boundary object (handler, adapter, middleware) make a decision; it only translates external ↔ domain.
- HARM: decisions tangled with I/O cannot be tested without mocks; bugs hide in the boundary.
- CHECK: review — a boundary object that needs its own test suite has logic in it; move that logic to the core.

**§2. Effects Are Values.**

- DO: return effects as lazy values (descriptions) and interpret them once, at the edge. Attach logging, metrics, and tracing as decorators on the value.
- DON'T: put an eager async result (a promise, future, or task) on the public surface; DON'T embed a cross-cutting concern inside a decision.
- HARM: an already-started result cannot be held, retried, or swapped; embedded concerns cannot be turned off or composed.
- CHECK: lint (no eager async result on the public surface).

```
WRONG  getUser : UserId -> <a started async result>
RIGHT  getUser : UserId -> Effect<User, NotFound>     a lazy value, interpreted once at the edge
```

**§3. The I/O Sandwich.**

- DO: shape every outside interaction as read (impure) → transform (pure) → write (impure); the shell calls the core directly.
- DON'T: insert a layer that only passes work through without performing any read, transform, or write.
- HARM: side effects leak into business logic; pass-through layers add coupling for nothing.
- CHECK: review. Test a unit by what it does: performing the read/transform/write is the shell and is allowed; delegating only is the banned layer. Sitting between transport and core is not itself the violation.

```
RIGHT — impure bread, a thick pure filling, impure bread. The bread is as many reads and writes as
you need; the filling is every pure step, stacked, with no I/O between any of them.

   ════════════  impure  ════════════   read     pull raw inputs — store, gateway, network, clock
   ────────────   pure   ────────────   decode   validate raw → branded domain types (fail as data, never throw)
   ────────────   pure   ────────────   decide   the workflow: one decision over typed data → Decision | Error
   ────────────   pure   ────────────   shape    build the outputs and events from the Decision
   ════════════  impure  ════════════   write    persist · emit · respond

WRONG — read → decide → read again → decide: I/O interleaved with the pure steps; the filling turns impure.
EDGE  — when a later read genuinely depends on an earlier decision, the flat sandwich breaks. Reframe:
        pre-fetch what the decision might need, or split it into two sandwiches. If it is truly
        sequential, keep it openly in the shell — never wrap interleaved I/O in a fake "pure core."
```

**§4. Dependencies Point Inward.**

- DO: let the shell import the core; wire all implementations at one composition root.
- DON'T: let the core import the shell, the database, or the framework.
- HARM: a decision layer chained to infrastructure cannot be tested or replaced.
- CHECK: import-graph lint.

**§5. Decode, Never Cast.**

- DO: turn outside data (bytes, serialized text, a foreign type) into a domain type through a decode that returns a typed result.
- DON'T: assert the type with an unchecked cast (`as`, `as unknown as`, `as any`) or a suppression comment.
- HARM: a shape nothing verified; everything downstream trusts a check that never ran.
- CHECK: lint.

```
WRONG  config := value as Config
RIGHT  config := decode(value) : Result<ParseError, Config>
```

**§6. Purity Is Per Function, Not Per Folder.**

- DO: judge pure-versus-effectful by a function's return type alone.
- DON'T: infer it from a folder, a package, or "library versus application."
- HARM: a database-driver mislabeled "pure," a parser mislabeled "impure," because of where it lives.
- CHECK: review; the lint behind §1.

```
decide : Command -> Result<DomainError, Decision>     pure
load   : OrderId -> Effect<Order, NotFound>           owns effects
```

---

## Article III — Verification

**§1. The Testing Trophy.**

- DO: invest widest at Composition, anchored by Static Analysis, made honest by Properties.
- DON'T: build a Test Pyramid; it buries logic in I/O and leaves the untested middle.

|     Width      | Layer                                                                    | What It Catches                         |
| :------------: | ------------------------------------------------------------------------ | --------------------------------------- |
|      ████      | **Static Analysis** — type checker, linter, dependency (DAG) checks      | Entire bug classes, zero maintenance    |
|     ██████     | **Property Tests** — Core invariants, ACL roundtrips, schema conformance | What the system guarantees              |
| ██████████████ | **Composition Tests** — Mocked I/O, real use cases, error paths          | Real workflows through the I/O sandwich |
|      ███       | **Contract Tests** — transport schema, CLI output                        | External interface conformance          |

**§2. Properties Over Examples.**

- DO: prove the pure core with property tests; the type is the generator.
- DON'T: cover the core with hand-picked example unit tests.
- HARM: a green suite that tests only the cases you imagined and breaks on every refactor.
- CHECK: review; property-test presence on the pure core.

**§3. Mutation Is the Measure.**

- DO: gate the pure core at a perfect mutation score; kill a survivor with a sharper property or by deleting the dead branch it exploits.
- DON'T: reach the number by a suppression comment, by narrowing the mutated set, or by lowering the gate.
- HARM: a score that certifies tests which notice nothing.
- CHECK: mutation gate (break = 100); lint banning suppression and scope-narrowing.

**§4. Behavior Lives Where the Mutator Sees It.**

- DO: put any code that can be wrong (a transform, a check, a branch) in a file the mutator covers.
- DON'T: place behavior in a declaration file (types, schemas, constant data), which is excluded from mutation.
- HARM: a bug hidden behind a perfect score, in a file nothing mutates.
- CHECK: lint (declaration files contain no behavior).

**§5. Pin Behavior Before You Rebuild.**

- DO: before refactoring, cover the inputs the existing code accepts with tests over real examples.
- DON'T: trust a mutation or property score to protect behavior you have not pinned — they are blind to behavior you delete.
- HARM: a rebuild silently drops a capability; the clean score certifies the regression.
- CHECK: required characterization tests over real fixtures; review.

---

## Article IV — Organization

**§1. Organized by What It Does.**

- DO: organize by workflow and capability; keep code that changes together, together.
- DON'T: organize by what the system has (entities, technical layers).
- HARM: one change scattered across the tree.
- CHECK: review.

**§2. Names Scream the Domain.**

- DO: name files and folders for the job they do; a name must answer "of what?".
- DON'T: use layer names (`core`, `shell`) or junk drawers (`util`, `service`, `manager`). A suffix earns its place only when a rule keys on it.
- HARM: files nobody can locate; meaningless buckets.
- CHECK: filename lint (allowed suffixes; banned layer and junk-drawer names).

**§3. Fits in the Head.**

- DO: give a module one responsibility; split it when a test needs elaborate setup (the signal it has several).
- DON'T: accumulate unrelated concerns in one module.
- HARM: modules no one can fully reason about; brittle, sprawling tests.
- CHECK: review (fixture difficulty is the decomposition signal).

---

## Article V — Conduct

**§1. Depth Over Expedience.**

- DO: fix the root cause; restructure when the design is wrong.
- DON'T: patch the symptom or bypass a boundary to ship faster.
- HARM: the bug returns.
- CHECK: review.

**§2. Scope Discipline.**

- DO: execute accepted scope in full.
- DON'T: reduce scope mid-task because it grew complex, without the author's consent.
- HARM: half-finished work; wasted effort second-guessing intent.
- CHECK: review.

**§3. First Principles Over Precedent.**

- DO: justify a pattern by these principles. The surrounding code is evidence of what exists, never of what is correct.
- DON'T: justify it by "that is how it is done elsewhere," and never copy a neighbouring file as a template. Code age grants no immunity.
- HARM: unexamined defaults calcify into rules; one slop pattern seeds the next by imitation, and the average drifts down.
- CHECK: review (a choice defended by precedent, or by the file next to it, is rejected).

**§4. API-First Discovery.**

- DO: define the outside contract first, then derive use cases, decisions, and machinery beneath it; model only what a known requirement needs.
- DON'T: build a domain abstraction for a hypothetical future.
- HARM: speculative structure that never pays off and constrains what comes after.
- CHECK: review.

**§5. Challenge Before You Commit.**

- DO: subject a large or irreversible choice to a deliberate challenge (another agent, a person, or rigorous self-examination), record it with the decision, and judge the challenge by the harm it names (Application §1).
- DON'T: appeal to a tribunal or standing authority; DON'T let a challenge be a clause quoted against a choice.
- HARM: a costly, hard-to-reverse direction taken with no one trying to break it first.
- CHECK: review (the challenge is recorded with the decision).

**§6. No Silent Bypass.**

- DO: when you break a rule here — knowingly, or because it was wrong for this case — say so, in the open, in the change itself.
- DON'T: conceal a bypass.
- HARM: two failures — the breach and the hiding of it; the next reader trusts a rule that was quietly broken.
- CHECK: review.

**§7. Subtract Before You Add.**

Removal is the default response to slop, at every scale: from collapsing a duplicate to ripping out a rotten core. Adding is the exception you justify.

- DO: treat every line as a liability and make removal the default direction. Small scale — unify duplicates into one definition, make the bad state unrepresentable, delete a branch instead of guarding it. Structural scale — when the root violates this document and breeds a bug class, rebuild the core (behaviour pinned with characterization tests first, §III.5; the rebuild decomposed into shippable milestones) rather than prune leaves off a rotten trunk. Distrust existing structure; assume it may be rotten until it proves it conforms.
- DON'T: extend a copy-paste cluster with copy N+1; add a helper or abstraction when removing or unifying one does the job; patch around a rotten core to keep it alive; treat code as sound because it compiles, is large, or is old; mistake taste ("I would write it differently") for rot.
- HARM: the codebase only grows; rot survives every patch and regrows; each copied pattern seeds the next, and the average drifts down.
- CHECK: review reads the net line delta — a `refactor` / `improvement` / `chore` that adds net lines states why and names what it deleted (features and their tests are exempt). A fix that leaves a named root violation standing is rejected; "rotten" names the invariant the core breaks; a structural rebuild ships its characterization tests.

```
WRONG  add formatPhone() beside the three formatters already there
RIGHT  delete the three, keep one parameterised formatter
WRONG  add a guard for the impossible state the record permits
RIGHT  delete the record; a tagged union makes the state unconstructable
```

---

## Article VI — Amendment

- DO: amend with a written rationale, a version bump (major for a principle removed or redefined, minor for one added or expanded), a date, and a matching update to `AGENTS.md`.
- DO: prefer to amend by adding a gate — a principle that moves from review to a failing command is strengthened, not changed.
- DON'T: enter a weak modal. A rule is a gate or a reviewed judgment, never a "should" or a "try to."

---

**Ratified**: Version 3.4 | 2026-06-09 | Supersedes 3.3

**Amendment 3.4 (2026-06-09):** Added §V.7 _Subtract Before You Add_ — removal as the default at every scale, from collapsing a duplicate to rebuilding a rotten core with behaviour pinned first — and sharpened §V.3 to forbid justifying a choice by the neighbouring file. Rationale: break the slop death loop, where AI uses existing code as its reference for "correct" and copies it, so each slop commit seeds the next. The standard now lives in this document, not in the surrounding code. Minor bump: a principle added, none removed or redefined.
