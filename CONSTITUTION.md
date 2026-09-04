# Constitution

## Application

```yaml
rules:
  - id: CONST-G4
    title: By Purpose, Not Quotation
    gate: review
    do: invoke a principle by showing the harm is present; where letter and purpose diverge, purpose governs — ask "does this harm occur here"
    dont: invoke a principle by quoting a clause or asking which clause to cite
    harm: the letter applied where no harm exists defeats the purpose
    check: review — an invocation names the harm, not the clause
  - id: CONST-E6
    title: Prefer the Gate
    gate: review
    do: make any principle that can fail a command — type error, lint rule, mutation threshold, dependency check — fail that command; a failing build is the final word
    dont: settle compliance by citing a clause against a gate; read this clause as licence to add enforcement without paying for it
    harm: an ungated principle decays into prose nothing enforces
    check: review — each principle names its gate
  - id: CONST-E8
    title: The Evaluator Is Not the Agent's to Edit
    gate: review
    do: keep the surface that judges the work outside the surface that does it — an evaluator, rubric, threshold, budget or approval boundary changes in its own commit, observed failing before and passing after, for the reason it states
    dont: weaken a gate, threshold, budget or glob to make the current change pass; ship an evaluator change in the same commit as the work it judges
    harm: given a blocked task and reachable machinery, the measured behaviour is to edit the machinery rather than satisfy it, and more capable models do this more often rather than less; an agent that judges itself reports the score it chose
    check: review — no commit carries both an evaluator change and the work it judges; a loosened threshold stands alone and names its reason
  - id: CONST-E7
    title: Evidence Before Done
    gate: review
    do: treat "done" as a gate passed or a test shown
    dont: accept a reported score or a claimed "it works" as done
    harm: compliance claimed without evidence
    check: review — done names the gate that passed or the test that ran; a report of either is not either
  - id: CONST-G5
    title: Supreme
    gate: review
    do:
      - govern AGENTS.md, lint, and the ADRs on what a rule should say, where they conflict
      - defer to the gate on whether a rule held — where this document and a gate disagree about a specific change, the gate is the final word (CONST-E6) and the disagreement is resolved by amending one of them, never by overriding the gate in place
      - place contestable choices — suffixes, patterns, module shape — in ADRs
    dont: pin contestable choices in this document
    harm: contestable choices frozen as supreme law; conflicts left unresolved
    check: review — a conflict resolved by this document, a contestable choice resolved by an ADR
```

---

## Article I — The Pure Core

```yaml
rules:
  - id: CONST-P1
    title: Purity
    gate: lint
    do: each domain decision is a pure function — data in, a value or typed error out
    dont:
      - in a decision, do I/O, throw, read a clock, or use randomness
      - return an effect handle from a decision — if it needs the runtime, move the boundary, not the purity
    harm: logic untestable over all inputs, untrustworthy
    check: lint — decisions import no I/O or effect-runtime; mutation
  - id: CONST-D1
    title: Types Before Logic
    gate: type-checker
    do: define types before behavior; make illegal states unrepresentable so bad data fails to compile
    dont: start from functions and add types after
    harm: invalid data reaches runtime; tests multiply to cover what a type could forbid
    check: type-checker rejects the illegal state; review
  - id: CONST-D2
    title: Each Error Its Own Variant
    gate: lint
    do: give every distinct failure its own tagged variant
    dont: distinguish failures by a boolean or string field
    harm: callers can't branch on the real failure; distinct errors collapse into one case
    check: lint; review — callers branch on the variant tag, never on a field value
  - id: CONST-D3
    title: No Primitive Obsession
    gate: lint
    do: brand every domain-meaningful value (ids, amounts, codes) as its own type
    dont: pass bare text or number in a domain-significant position
    harm: values transposed or misused; the type says nothing about what they are
    check: lint — no bare primitives in domain signatures
  - id: CONST-D4
    title: Null Is Not a State — but absence is fine for optional data
    gate: lint
    do:
      - model mutually-exclusive states as a tagged union — one variant per state, each carrying only its valid fields
      - use a plain nullable for a value absent identically in every state
    dont:
      - encode a state by which fields are present
      - wrap such a field in Option/Maybe to "fix" it — the wrapper renames the hole, not closes it
    harm: a state machine hidden in a record; the compiler can't reject invalid field combinations — the question is never "null or Option" but "a value that may not exist, or a state in disguise"
    check: lint — flags an optional that correlates with the discriminant, not plain optionals; review
    example:
      wrong: Order { status, shippedAt?, trackingId? } — state by presence; an Option wrapper is the same defect
      right: Order = Pending { placedAt } | Shipped { placedAt, shippedAt, trackingId }
      fine: Customer { name, middleName? } — genuinely optional; plain nullable, no wrapper
  - id: CONST-P2
    title: The Pure Core Has One Path (Cyclomatic Complexity 1)
    gate: lint
    do: write each core decision as a single path — choice as exhaustive dispatch over a closed type (match a tagged union), iteration as map/fold; the core is an expression, not a procedure
    dont:
      - in the core, use if/else, switch, ?:, or &&/|| for control
      - in the core, use for/while — repetition moves into map/fold
    scope: binds the pure core (decision and workflow files); the ban is on the control-flow form, not branching — a core function reads as one path yet still decides and iterates; the shell sequences steps and carries no decisions, its only structure is the sandwich (CONST-B3); the gate runs on core files, not the shell
    harm: every branch is an untested path where state silently diverges — the mutator reaches it, the suite does not
    check: lint — cyclomatic complexity = 1 on core files (match, map, fold are calls, not control flow, so they hold at 1; if/switch/loops raise it)
    example:
      wrong: if (o.kind === "Shipped") ship(o) else hold(o) — two paths in a decision
      right: match(o) { Shipped -> ship, Pending -> hold } — one exhaustive dispatch over a closed type
      wrong_iteration: fold over the data with a for-loop in the core — iterating the core as a procedure
      right_iteration: fold(xs, 0, add) — iterate as one expression (a shell loop is fine — that's the shell)
```

---

## Article II — The Boundary

```yaml
rules:
  - id: CONST-B1
    title: Functional Core, Imperative Shell
    gate: review
    do: split every module into a pure core (decisions) and a thin shell (I/O); pass plain serializable data across the seam
    dont: let a boundary object (handler, adapter, middleware) make a decision — it only translates external ↔ domain
    harm: decisions tangled with I/O can't be tested without mocks; bugs hide in the boundary
    check: review — a boundary object that needs its own test suite has logic in it; move it to the core
  - id: CONST-B2
    title: Effects Are Values
    gate: lint
    do: return effects as lazy values (descriptions), interpreted once at the edge; attach logging, metrics, tracing as decorators on the value
    dont:
      - put an eager async result (promise, future, task) on the public surface
      - embed a cross-cutting concern in a decision
    harm: an already-started result can't be held, retried, or swapped; embedded concerns can't be turned off or composed
    check: lint — no eager async result on the public surface
    example:
      wrong: "getUser : UserId -> <a started async result>"
      right: "getUser : UserId -> Effect<User, NotFound> — a lazy value, interpreted once at the edge"
  - id: CONST-B3
    title: The I/O Sandwich
    gate: review
    do: shape every outside interaction as read (impure) → transform (pure) → write (impure); the shell calls the core directly
    dont: insert a layer that only passes work through without a read, transform, or write
    harm: side effects leak into business logic; pass-through layers add coupling for nothing
    check: review — pass-through delegation is the violation; the shell doing the read/transform/write, or sitting between transport and core, is not
    example:
      flow: |
        read → decode → decide → shape → write
        impure bread (read, write) around a thick pure filling (decode, decide, shape), no I/O between the pure steps.
          read     pull raw inputs — store, gateway, network, clock          (impure)
          decode   validate raw → branded domain types (fail as data)        (pure)
          decide   one decision over typed data → Decision | Error           (pure)
          shape    build outputs and events from the Decision                (pure)
          write    persist · emit · respond                                  (impure)
      wrong: read → decide → read → decide — I/O interleaved; the filling turns impure
      edge: a later read that depends on an earlier decision — pre-fetch it, split into two sandwiches, or keep it openly in the shell; never fake a "pure core" around it
  - id: CONST-B6
    title: The Sandwich Order Is Carried by Types
    gate: type-checker
    do: express an outside interaction as one phase chain — each phase's return type carries the required member the next phase's parameter demands — so the order is a consequence of the types and the compiler decides it
    dont:
      - hand-sequence the phases and state their order beside them; an order asserted in prose is decided by nothing
      - give the phases a hierarchy — where a later phase's type is assignable to an earlier phase's parameter, an inversion still compiles
    harm: an order nothing decides permits every permutation while reading as a guarantee, so the interleaved read that turns the filling impure — the defect CONST-B3 names — reaches production with the rule green
    check: type-checker — composing the phases in the wrong order omits the required member, so the compiler names the phase that must come first; the sentence survives into the published declaration as that member's own name, which is what carries it into a consumer's compiler
    example:
      wrong: "write(decide(read(raw))) — hand-sequenced; every permutation type-checks, so the order is a comment"
      right: "read : Raw -> ReadDone, decode : ReadDone -> DecodeDone, decide : DecodeDone -> DecideDone — decode cannot receive what read has not produced"
  - id: CONST-B4
    title: Dependencies Point Inward
    gate: lint
    do: let the shell import the core; wire all implementations at one composition root
    dont: let the core import the shell, the database, or the framework
    harm: a decision layer chained to infrastructure can't be tested or replaced
    check: import-graph lint
  - id: CONST-B5
    title: Decode, Never Cast
    gate: lint
    do: turn outside data (bytes, serialized text, a foreign type) into a domain type via a decode returning a typed result
    dont:
      - assert type with an unchecked cast (`as`, `as unknown as`, `as any`)
      - assert type with a suppression comment
    harm: a shape nothing verified; everything downstream trusts a check that never ran
    check: lint — no unchecked casts or suppression comments on outside data
    example:
      wrong: config := value as Config
      right: "config := decode(value) : Result<ParseError, Config>"
  - id: CONST-P3
    title: Purity Is Per Function, Not Per Folder
    gate: review
    do: judge pure-versus-effectful by return type alone
    dont: infer it from a folder, package, or "library versus application"
    harm: a database-driver mislabeled "pure," a parser "impure," because of where it lives
    check: review — return type decides; the lint behind CONST-P1
    example:
      pure: "decide : Command -> Result<DomainError, Decision>"
      effectful: "load : OrderId -> Effect<Order, NotFound> — owns effects"
```

---

## Article III — Verification

```yaml
rules:
  - id: CONST-T15
    title: The Testing Trophy
    gate: review
    do: invest in order — static analysis first, then properties on the core where CONST-T14 grants them, then composition through the sandwich (CONST-B3), then contracts at the published edge; the order is the doctrine, a count of tests per layer is not
    dont:
      - gate anything on a numeric layer width or a layer-naming table — the widths were refuted instrumentation, not law
      - build a Test Pyramid — a wide base of helper unit tests buries logic in I/O and leaves the untested middle
    harm: investment spent where the compiler and the mutator already decide; the untested middle stays untested while the suite looks broad
    check: review — each authored test names its observer and the step of the order it earns, never a width
  - id: CONST-T8
    title: Test Public Functions Directly, Pure Logic with Mutation
    gate: review
    do: test the public API with real inputs and outputs; test internal calculation and branching logic with mutation tests (and properties only when CONST-T14 requires them); never write dedicated unit tests for code that only forwards calls between components
    dont:
      - write unit tests for intermediate helper functions that only pass data to other functions
      - mix I/O code or adapters into the same mutation test run as pure calculation logic
      - mock a dependency when only one real implementation exists
    harm: unit-testing intermediate layers locks in private implementation details without catching real bugs; mocking real code gives false confidence; business rules stay tangled with I/O
    check: review — every test calls either a public export or a pure decision function, never a private forwarding helper
  - id: CONST-T14
    title: Properties Where the Surface Cannot Reach
    gate: review
    do: prove a pure decision with a property when a universal over generated input, or a refusal no generated law can express, cannot be reached from the published surface; the type is the generator
    dont:
      - cover the core with hand-picked example unit tests
      - write a property for a decision already fully pinned from above just because the decision is important
    harm: a green suite that tests only the cases you imagined; or a property farm that restates the public contract and dies with it
    check: review — each authored property names the universal the public surface cannot reach
  - id: CONST-T3
    title: Mutation Is the Measure
    gate: mutation
    do: gate a named, change-relevant mutated set at a perfect kill score; the set names the behavior it covers, and its scope is a cost decision, never a fault-majority claim; kill a survivor with a sharper property or by deleting the dead branch it exploits
    dont:
      - reach the number by a suppression comment
      - reach the number by narrowing the mutated set after the fact
      - reach the number by lowering the gate
      - let an empty mutated set pass
      - treat a raw mutation percentage as comparable across changes or codebases
    harm: a score certifying tests that notice nothing; an empty or author-shrunk set passing vacuously
    check: mutation gate (break = 100) on the declared mutated set; lint banning suppression, scope-narrowing, and an empty set
  - id: CONST-T13
    title: Mutation Also Grades the Tests
    gate: mutation
    do: fail a run whose mutants all died if an authored property file defends nothing the rest of the suite does not; opt out in the mutation config, never by deleting the file the gate named
    dont:
      - treat a perfect mutant score as proof every test pulled its weight
      - accuse a file that covered an unattributed kill
    harm: toothless properties accumulate; deleting them to silence the gate removes the only named contract
    check: mutation — the test-set verdict is part of the same run as the score
  - id: CONST-T4
    title: Behavior Lives Where the Mutator Sees It
    gate: lint
    do: put any code that can be wrong (transform, check, branch) in a file the mutator covers
    dont: place behavior in a declaration file (types, schemas, constant data), excluded from mutation
    harm: a bug hidden behind a perfect score, in a file nothing mutates
    check: lint — declaration files contain no behavior
  - id: CONST-T9
    title: Pin the Published Contract Before You Delete a Path
    gate: review
    do: before removing or replacing a published operation, pin its observables (value, error variant, serialized document, process result) with examples or properties whose expected side is not the implementation under change; if the old operation still runs, compare old and new on the same published inputs until they agree, then delete old
    dont:
      - pin private functions
      - derive expected values by running the implementation under change
      - treat a mutation or property score as proof a deleted published capability still exists — those are blind to absence
      - leave a persisted gold after the old path is gone unless the gold is externally authored, independently gated, and cheap to re-bless
    harm: a rebuild silently drops a capability; same-session gold blesses the bug; a clean score after a delete is a silent regression
    check: review — pins call only published names; each expected value names an independent source (spec clause, prior published major, second implementation, or a hand-written oracle next to the constructor)
  - id: CONST-T10
    title: The Oracle Is Not the System Under Test
    gate: review
    do: every assertion has an oracle the SUT did not produce — a spec literal, a fixture not generated by importing the module, a law relating two views of the same value, or a second implementation; generated round-trip laws on a type cover what the type accepts and nothing it should reject, so a hand-written refusal survives beside them at any specifiable refusal boundary
    dont:
      - compute expected by calling the SUT
      - assert collaborator call graphs
      - treat generated accept-laws as full coverage of a refinement
    harm: a green suite that cannot fail when the behavior is wrong; widening a refinement leaves generated laws green
    check: review — plus sabotage (after green, break one core law and one published field; at least one test must go red)
  - id: CONST-T11
    title: Snapshots and Differentials Are Published-Surface Oracles
    gate: lint
    do: snapshot only canonicalized published output; compare two implementations only of the same published operation (or a prior published major against current)
    dont:
      - snapshot or compare private helpers, mappers, or unexported modules
      - snapshot a value small enough to be a property or a named example
    harm: tests that fail on refactors callers cannot see and pass on contract breaks they can
    check: lint — snapshot and differential fixtures are produced only through the package's published export map
  - id: CONST-T12
    title: What a Test Does Comes from What It Calls, Not Its Filename
    gate: lint
    do: classify what a test is by what it imports and calls — public exports or pure logic under mutation — never by its folder, filename, or file extension
    dont: decide which testing rules apply to a file based on its name or suffix
    harm: renaming a test file secretly stops its rules from running while the test suite still looks complete
    check: lint — no linter or test runner rules that pick tests by filename suffix
  - id: CONST-E5
    title: A Gate's Key Is Recomputed, Never Reported
    gate: review
    do:
      - key every gate on a recomputation from source bytes, a compiler verdict, or a rehash — never on a field the gated work's author supplied; when a gate reads a field, recompute that field in the same run
      - treat a gate whose verdict the gated agent can produce or observe as unverified until an independent channel confirms it — an instrument the agent does not control, or review by someone who is not the gated agent
    dont:
      - accept a self-reported field, a presence flag, a metadata suffix, or a comment as evidence a property holds
      - treat a mechanical gate's green as self-certifying
    harm: a check keyed on author-supplied values passes everything and catches nothing, and the green then masks the broken invariant the gate exists to catch; an instrument correlated with the work under test can manufacture a verdict no single observer catches
    check: review — each gate names the recomputation it runs and the independent channel that confirms its verdict
```

---

## Article IV — Organization

```yaml
rules:
  - id: CONST-N1
    title: Organized by What It Does
    gate: review
    do: organize by workflow and capability; keep code that changes together, together
    dont: organize by what the system has (entities, technical layers)
    harm: one change scattered across the tree
    check: review — one change touches one capability subtree
  - id: CONST-N2
    title: Names Scream the Domain
    gate: lint
    do: name files and folders for the job they do — a name must answer "of what?"
    dont:
      - use layer names (`core`, `shell`)
      - use junk drawers (`util`, `service`, `manager`)
      - use a suffix no rule keys on
    harm: files no one can locate; meaningless buckets
    check: filename lint — allowed suffixes; banned layer and junk-drawer names
  - id: CONST-N3
    title: Fits in the Head
    gate: review
    do: give a module one responsibility; split it when a test needs elaborate setup (the signal it has several)
    dont: accumulate unrelated concerns in one module
    harm: modules no one can fully reason about; brittle, sprawling tests
    check: review — fixture difficulty is the decomposition signal
```

---

## Article V — Conduct

```yaml
rules:
  - id: CONST-G3
    title: Constitutional Violations Are Automatic P0 Failures
    gate: review
    do: treat every undeclared violation of this constitution during review as an automatic, non-negotiable P0 failure; reject the change unconditionally with zero appeals and no severity downgrades unless explicitly declared under CONST-W3
    dont:
      - downgrade an undeclared constitutional breach to an advisory, P1, P2, or non-blocking finding
      - treat a CONST-W3 declaration as optional prose — an explicit declaration in the change itself is the only legal waiver, and it must name the rule and the case
      - accept a promise of follow-up repair or expedience plea to bypass an active rule without a CONST-W3 declaration
    harm: constitutional rules decay into optional suggestions; agents negotiate away core architecture to ship faster; unblocked violations calcify into precedent
    check: review — every undeclared constitutional violation is graded P0 and blocks approval unconditionally; any review that waives or downgrades an undeclared violation is rejected
  - id: CONST-S1
    title: Depth Over Expedience
    gate: review
    do: fix the root cause; restructure when the design is wrong
    dont: patch the symptom or bypass a boundary to ship faster
    harm: the bug returns
    check: review — the change names the root cause it fixes
  - id: CONST-W1
    title: Scope Discipline
    gate: review
    do: execute accepted scope in full
    dont: reduce scope mid-task because it grew complex, without the author's consent
    harm: half-finished work; wasted effort second-guessing intent
    check: review — delivered scope matches accepted scope
  - id: CONST-S2
    title: First Principles Over Precedent
    gate: review
    do: justify a pattern by these principles — surrounding code is evidence of what exists, never of what is correct
    dont:
      - justify by "that is how it's done elsewhere"
      - copy a neighbouring file as a template — code age grants no immunity
    harm: unexamined defaults calcify into rules; one slop pattern seeds the next by imitation, and the average drifts down
    check: review — a choice defended by precedent, or by the file next to it, is rejected
  - id: CONST-S3
    title: API-First Discovery
    gate: review
    do: define the outside contract first, then derive use cases, decisions, and machinery beneath it; model only what a known requirement needs
    dont: build a domain abstraction for a hypothetical future
    harm: speculative structure that never pays off and constrains what comes after
    check: review — every abstraction traces to a known requirement
  - id: CONST-W2
    title: Challenge Before You Commit
    gate: review
    do: subject a large or irreversible choice to a deliberate challenge (another agent, a person, or rigorous self-examination), record it with the decision, judge it by the harm it names
    dont:
      - appeal to a tribunal or standing authority
      - let a challenge become a clause quoted against a choice
    harm: a costly, hard-to-reverse direction taken with no one trying to break it first
    check: review — the challenge is recorded with the decision
  - id: CONST-W3
    title: No Silent Bypass
    gate: review
    do: when you break a rule here — knowingly, or because it was wrong for this case — say so, in the open, in the change itself
    dont: conceal a bypass
    harm: two failures — the breach and the hiding of it; the next reader trusts a rule quietly broken
    check: review — every rule breach is declared in the change that contains it
  - id: CONST-S4
    title: Subtract Before You Add
    gate: review
    do:
      - treat every line as a liability — removal is the default response to slop at every scale; adding is the exception you justify
      - small — unify duplicates, make bad states unrepresentable, delete a branch instead of guarding it
      - structural — when the root violates this document and breeds a bug class, rebuild the core (published contract pinned first (CONST-T9); decomposed into shippable milestones) rather than prune leaves off a rotten trunk
      - distrust existing structure — assume rotten until it proves it conforms
    dont:
      - extend a copy-paste cluster with copy N+1
      - add a helper when removing or unifying one does the job
      - patch around a rotten core to keep it alive
      - treat code as sound because it compiles, is large, or is old
      - mistake taste ("I'd write it differently") for rot
    harm: the codebase only grows; rot survives every patch and regrows; each copied pattern seeds the next, and the average drifts down
    check: review reads the net line delta — a refactor/improvement/chore that adds net lines states why and names what it deleted (features and their tests are exempt); a fix that leaves a named root violation standing is rejected; "rotten" names the invariant the core breaks; a structural rebuild ships a CONST-T9 pin on every published path it deletes
    example:
      wrong: add formatPhone() beside the three formatters already there
      right: delete the three, keep one parameterised formatter
      wrong_state: add a guard for the impossible state the record permits
      right_state: delete the record; a tagged union makes the state unconstructable

```
