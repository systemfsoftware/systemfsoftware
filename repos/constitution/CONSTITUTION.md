# Constitution

## Preamble

This document states **principles, not tools or languages**. The language, frameworks, libraries, and lint rules live in `AGENTS.md`, the skills, and the ADRs — never here. Exemplars use neutral type notation (sum types and `name : Input -> Output`) so no principle pins to one stack.

Each section is directives: **DO**, **DON'T**, the **HARM** it prevents, the **CHECK** that enforces it, and — only where wrong and right look alike — an **EX**. Comply with the directive and its harm, not the prose around it.

## Application

1. **By purpose, not quotation.** Invoke a principle by showing the harm is present — never by quoting a clause. Where letter and purpose diverge, purpose governs. Ask "does this harm occur here," not "which clause can I cite."
2. **Prefer the gate.** Any principle that can fail a command — type error, lint rule, mutation threshold, dependency check — shall. A failing build, not a cited clause, is the final word.
3. **Evidence before done.** "Done" means a gate passed or a test shown — not a reported score or a claimed "it works." No evidence, no compliance.
4. **Supreme.** Governs `AGENTS.md`, lint, and the ADRs where they conflict. Contestable choices — suffixes, patterns, module shape — live in ADRs, not here.

---

## Article I — The Pure Core

**§1. Purity.**
- DO: each domain decision is a pure function — data in, a value or typed error out.
- DON'T: in a decision, do I/O, throw, read a clock, use randomness, or return an effect handle. If it needs the runtime, move the boundary, not the purity.
- HARM: logic untestable over all inputs, untrustworthy.
- CHECK: lint (decisions import no I/O or effect-runtime); mutation.

**§2. Types Before Logic.**
- DO: define types before behavior; make illegal states unrepresentable so bad data fails to compile.
- DON'T: start from functions and add types after.
- HARM: invalid data reaches runtime; tests multiply to cover what a type could forbid.
- CHECK: type-checker; review.

**§3. Each Error Its Own Variant.**
- DO: give every distinct failure its own tagged variant.
- DON'T: distinguish failures by a boolean or string field.
- HARM: callers can't branch on the real failure; distinct errors collapse into one case.
- CHECK: lint; review.

**§4. No Primitive Obsession.**
- DO: brand every domain-meaningful value (ids, amounts, codes) as its own type.
- DON'T: pass bare text or number in a domain-significant position.
- HARM: values transposed or misused; the type says nothing about what they are.
- CHECK: lint (no bare primitives in domain signatures).

**§5. Null Is Not a State — but absence is fine for optional data.**
- DO: model mutually-exclusive states as a tagged union — one variant per state, each carrying only its valid fields.
- DO: use a plain nullable for a value absent identically in every state.
- DON'T: encode a state by which fields are present, or wrap such a field in `Option`/`Maybe` to "fix" it — the wrapper renames the hole, not closes it. The question is never "null or `Option`"; it is "a value that may not exist, or a state in disguise."
- HARM: a state machine hidden in a record; the compiler can't reject invalid field combinations.
- CHECK: lint (flags an optional that correlates with the discriminant — not plain optionals); review.

```
WRONG  Order { status, shippedAt?, trackingId? }      state by presence; an Option wrapper is the same defect
RIGHT  Order = Pending { placedAt }
             | Shipped { placedAt, shippedAt, trackingId }
FINE   Customer { name, middleName? }                 genuinely optional; plain nullable, no wrapper
```

**§6. The Pure Core Has One Path (Cyclomatic Complexity 1).**
- DO: write each core decision as a single path — choice as exhaustive dispatch over a closed type (match a tagged union), iteration as map/fold. The core is an expression, not a procedure.
- DON'T: in the core, use control flow — `if`/`else`, `switch`, `?:`, `&&`/`||` for control, `for`/`while`. This bans the control-flow _form_, not branching: choice moves into a match, repetition into map/fold. A core function reads as one path yet still decides and iterates.
- SCOPE: binds the pure core (decision and workflow files). The shell sequences steps and carries no decisions; its only structure is the sandwich (§II.3). The gate runs on core files, not the shell.
- HARM: every branch is an untested path where state silently diverges — the mutator reaches it, the suite does not.
- CHECK: lint — cyclomatic complexity = 1 on core files. (Match, map, fold are calls, not control flow, so they hold at 1; `if`/`switch`/loops raise it.)

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
- HARM: decisions tangled with I/O can't be tested without mocks; bugs hide in the boundary.
- CHECK: review — a boundary object that needs its own test suite has logic in it; move it to the core.

**§2. Effects Are Values.**
- DO: return effects as lazy values (descriptions), interpreted once at the edge. Attach logging, metrics, tracing as decorators on the value.
- DON'T: put an eager async result (promise, future, task) on the public surface, or embed a cross-cutting concern in a decision.
- HARM: an already-started result can't be held, retried, or swapped; embedded concerns can't be turned off or composed.
- CHECK: lint (no eager async result on the public surface).

```
WRONG  getUser : UserId -> <a started async result>
RIGHT  getUser : UserId -> Effect<User, NotFound>     a lazy value, interpreted once at the edge
```

**§3. The I/O Sandwich.**
- DO: shape every outside interaction as read (impure) → transform (pure) → write (impure); the shell calls the core directly.
- DON'T: insert a layer that only passes work through without a read, transform, or write.
- HARM: side effects leak into business logic; pass-through layers add coupling for nothing.
- CHECK: review. Doing the read/transform/write is the shell and is allowed; only delegating is the banned layer. Sitting between transport and core is not itself the violation.

```
read → decode → decide → shape → write
impure bread (read, write) around a thick pure filling (decode, decide, shape), no I/O between the pure steps.
  read     pull raw inputs — store, gateway, network, clock          (impure)
  decode   validate raw → branded domain types (fail as data)        (pure)
  decide   one decision over typed data → Decision | Error           (pure)
  shape    build outputs and events from the Decision                (pure)
  write    persist · emit · respond                                  (impure)
WRONG  read → decide → read → decide  I/O interleaved; the filling turns impure
EDGE   a later read that depends on an earlier decision: pre-fetch it, split into two
       sandwiches, or keep it openly in the shell — never fake a "pure core" around it
```

**§4. Dependencies Point Inward.**
- DO: let the shell import the core; wire all implementations at one composition root.
- DON'T: let the core import the shell, the database, or the framework.
- HARM: a decision layer chained to infrastructure can't be tested or replaced.
- CHECK: import-graph lint.

**§5. Decode, Never Cast.**
- DO: turn outside data (bytes, serialized text, a foreign type) into a domain type via a decode returning a typed result.
- DON'T: assert type with an unchecked cast (`as`, `as unknown as`, `as any`) or a suppression comment.
- HARM: a shape nothing verified; everything downstream trusts a check that never ran.
- CHECK: lint.

```
WRONG  config := value as Config
RIGHT  config := decode(value) : Result<ParseError, Config>
```

**§6. Purity Is Per Function, Not Per Folder.**
- DO: judge pure-versus-effectful by return type alone.
- DON'T: infer it from a folder, package, or "library versus application."
- HARM: a database-driver mislabeled "pure," a parser "impure," because of where it lives.
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
- HARM: a green suite that tests only the cases you imagined, breaking on every refactor.
- CHECK: review; property-test presence on the core.

**§3. Mutation Is the Measure.**
- DO: gate the core at a perfect mutation score; kill a survivor with a sharper property or by deleting the dead branch it exploits.
- DON'T: reach the number by a suppression comment, by narrowing the mutated set, or by lowering the gate.
- HARM: a score certifying tests that notice nothing.
- CHECK: mutation gate (break = 100); lint banning suppression and scope-narrowing.

**§4. Behavior Lives Where the Mutator Sees It.**
- DO: put any code that can be wrong (transform, check, branch) in a file the mutator covers.
- DON'T: place behavior in a declaration file (types, schemas, constant data), excluded from mutation.
- HARM: a bug hidden behind a perfect score, in a file nothing mutates.
- CHECK: lint (declaration files contain no behavior).

**§5. Pin Behavior Before You Rebuild.**
- DO: before refactoring, cover the inputs the existing code accepts, with tests over real examples.
- DON'T: trust a mutation or property score to protect behavior you haven't pinned — they're blind to behavior you delete.
- HARM: a rebuild silently drops a capability; the clean score certifies the regression.
- CHECK: characterization tests over real fixtures; review.

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
- HARM: files no one can locate; meaningless buckets.
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
- DO: justify a pattern by these principles. Surrounding code is evidence of what exists, never of what is correct.
- DON'T: justify by "that is how it's done elsewhere," or copy a neighbouring file as a template. Code age grants no immunity.
- HARM: unexamined defaults calcify into rules; one slop pattern seeds the next by imitation, and the average drifts down.
- CHECK: review (a choice defended by precedent, or by the file next to it, is rejected).

**§4. API-First Discovery.**
- DO: define the outside contract first, then derive use cases, decisions, and machinery beneath it; model only what a known requirement needs.
- DON'T: build a domain abstraction for a hypothetical future.
- HARM: speculative structure that never pays off and constrains what comes after.
- CHECK: review.

**§5. Challenge Before You Commit.**
- DO: subject a large or irreversible choice to a deliberate challenge (another agent, a person, or rigorous self-examination), record it with the decision, judge it by the harm it names (Application §1).
- DON'T: appeal to a tribunal or standing authority, or let a challenge become a clause quoted against a choice.
- HARM: a costly, hard-to-reverse direction taken with no one trying to break it first.
- CHECK: review (the challenge is recorded with the decision).

**§6. No Silent Bypass.**
- DO: when you break a rule here — knowingly, or because it was wrong for this case — say so, in the open, in the change itself.
- DON'T: conceal a bypass.
- HARM: two failures — the breach and the hiding of it; the next reader trusts a rule quietly broken.
- CHECK: review.

**§7. Subtract Before You Add.**

Removal is the default response to slop, at every scale — from collapsing a duplicate to ripping out a rotten core. Adding is the exception you justify.

- DO: treat every line as a liability; make removal the default direction. _Small_ — unify duplicates, make bad states unrepresentable, delete a branch instead of guarding it. _Structural_ — when the root violates this document and breeds a bug class, rebuild the core (behaviour pinned with characterization tests first, §III.5; decomposed into shippable milestones) rather than prune leaves off a rotten trunk. Distrust existing structure; assume rotten until it proves it conforms.
- DON'T: extend a copy-paste cluster with copy N+1; add a helper when removing or unifying one does the job; patch around a rotten core to keep it alive; treat code as sound because it compiles, is large, or is old; mistake taste ("I'd write it differently") for rot.
- HARM: the codebase only grows; rot survives every patch and regrows; each copied pattern seeds the next, and the average drifts down.
- CHECK: review reads the net line delta — a `refactor`/`improvement`/`chore` that adds net lines states why and names what it deleted (features and their tests are exempt). A fix that leaves a named root violation standing is rejected; "rotten" names the invariant the core breaks; a structural rebuild ships its characterization tests.

```
WRONG  add formatPhone() beside the three formatters already there
RIGHT  delete the three, keep one parameterised formatter
WRONG  add a guard for the impossible state the record permits
RIGHT  delete the record; a tagged union makes the state unconstructable
```
