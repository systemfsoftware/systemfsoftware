# Constitution

## Preamble

This document states **principles, not tools or languages**. The language, frameworks, libraries, and lint rules live in `AGENTS.md`, the skills, and the ADRs — never here. Exemplars use neutral type notation (sum types and `name : Input -> Output`) so no principle pins to one stack.

Each rule is a machine-readable YAML block: `do` and `dont` are lists of single atomic directives, `harm` names the consequence, `gate` names the primary enforcement mechanism, `check` names the verification criterion, and — only where wrong and right look alike — a structured `example`. Rule ids (`A.1` … `V.7`) are stable; external documents cross-reference them. Comply with the directive and its harm, not the prose around it.

## Application

```yaml
rules:
  - id: A.1
    title: By Purpose, Not Quotation
    gate: review
    do: invoke a principle by showing the harm is present; where letter and purpose diverge, purpose governs — ask "does this harm occur here"
    dont: invoke a principle by quoting a clause or asking which clause to cite
    harm: the letter applied where no harm exists defeats the purpose
    check: review — an invocation names the harm, not the clause
  - id: A.2
    title: Prefer the Gate
    gate: review
    do: make any principle that can fail a command — type error, lint rule, mutation threshold, dependency check — fail that command; a failing build is the final word
    dont: settle compliance by citing a clause against a gate
    harm: an ungated principle decays into prose nothing enforces
    check: review — each principle names its gate
  - id: A.3
    title: Evidence Before Done
    gate: review
    do: treat "done" as a gate passed or a test shown
    dont: accept a reported score or a claimed "it works" as done
    harm: compliance claimed without evidence
    check: no evidence, no compliance
  - id: A.4
    title: Supreme
    gate: review
    do:
      - govern AGENTS.md, lint, and the ADRs where they conflict
      - place contestable choices — suffixes, patterns, module shape — in ADRs
    dont: pin contestable choices in this document
    harm: contestable choices frozen as supreme law; conflicts left unresolved
    check: review — a conflict resolved by this document, a contestable choice resolved by an ADR
```

---

## Article I — The Pure Core

```yaml
rules:
  - id: I.1
    title: Purity
    gate: lint
    do: each domain decision is a pure function — data in, a value or typed error out
    dont:
      - in a decision, do I/O, throw, read a clock, or use randomness
      - return an effect handle from a decision — if it needs the runtime, move the boundary, not the purity
    harm: logic untestable over all inputs, untrustworthy
    check: lint — decisions import no I/O or effect-runtime; mutation
  - id: I.2
    title: Types Before Logic
    gate: type-checker
    do: define types before behavior; make illegal states unrepresentable so bad data fails to compile
    dont: start from functions and add types after
    harm: invalid data reaches runtime; tests multiply to cover what a type could forbid
    check: type-checker rejects the illegal state; review
  - id: I.3
    title: Each Error Its Own Variant
    gate: lint
    do: give every distinct failure its own tagged variant
    dont: distinguish failures by a boolean or string field
    harm: callers can't branch on the real failure; distinct errors collapse into one case
    check: lint; review — callers branch on the variant tag, never on a field value
  - id: I.4
    title: No Primitive Obsession
    gate: lint
    do: brand every domain-meaningful value (ids, amounts, codes) as its own type
    dont: pass bare text or number in a domain-significant position
    harm: values transposed or misused; the type says nothing about what they are
    check: lint — no bare primitives in domain signatures
  - id: I.5
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
  - id: I.6
    title: The Pure Core Has One Path (Cyclomatic Complexity 1)
    gate: lint
    do: write each core decision as a single path — choice as exhaustive dispatch over a closed type (match a tagged union), iteration as map/fold; the core is an expression, not a procedure
    dont:
      - in the core, use if/else, switch, ?:, or &&/|| for control
      - in the core, use for/while — repetition moves into map/fold
    scope: binds the pure core (decision and workflow files); the ban is on the control-flow form, not branching — a core function reads as one path yet still decides and iterates; the shell sequences steps and carries no decisions, its only structure is the sandwich (§II.3); the gate runs on core files, not the shell
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
  - id: II.1
    title: Functional Core, Imperative Shell
    gate: review
    do: split every module into a pure core (decisions) and a thin shell (I/O); pass plain serializable data across the seam
    dont: let a boundary object (handler, adapter, middleware) make a decision — it only translates external ↔ domain
    harm: decisions tangled with I/O can't be tested without mocks; bugs hide in the boundary
    check: review — a boundary object that needs its own test suite has logic in it; move it to the core
  - id: II.2
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
  - id: II.3
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
  - id: II.4
    title: Dependencies Point Inward
    gate: lint
    do: let the shell import the core; wire all implementations at one composition root
    dont: let the core import the shell, the database, or the framework
    harm: a decision layer chained to infrastructure can't be tested or replaced
    check: import-graph lint
  - id: II.5
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
  - id: II.6
    title: Purity Is Per Function, Not Per Folder
    gate: review
    do: judge pure-versus-effectful by return type alone
    dont: infer it from a folder, package, or "library versus application"
    harm: a database-driver mislabeled "pure," a parser "impure," because of where it lives
    check: review — return type decides; the lint behind §I.1
    example:
      pure: "decide : Command -> Result<DomainError, Decision>"
      effectful: "load : OrderId -> Effect<Order, NotFound> — owns effects"
```

---

## Article III — Verification

```yaml
rules:
  - id: III.1
    title: The Testing Trophy
    gate: review
    do: invest widest at Composition, anchored by Static Analysis, made honest by Properties
    dont: build a Test Pyramid — it buries logic in I/O and leaves the untested middle
    harm: logic buried in I/O; the untested middle
    check: review — layer investment follows the trophy widths
    layers:
      - width: ████
        name: Static Analysis
        scope: type checker, linter, dependency (DAG) checks
        catches: Entire bug classes, zero maintenance
      - width: ██████
        name: Property Tests
        scope: Core invariants, ACL roundtrips, schema conformance
        catches: What the system guarantees
      - width: ██████████████
        name: Composition Tests
        scope: Mocked I/O, real use cases, error paths
        catches: Real workflows through the I/O sandwich
      - width: ███
        name: Contract Tests
        scope: transport schema, CLI output
        catches: External interface conformance
  - id: III.2
    title: Properties Over Examples
    gate: review
    do: prove the pure core with property tests; the type is the generator
    dont: cover the core with hand-picked example unit tests
    harm: a green suite that tests only the cases you imagined, breaking on every refactor
    check: review — property-test presence on the core
  - id: III.3
    title: Mutation Is the Measure
    gate: mutation
    do: gate the core at a perfect mutation score; kill a survivor with a sharper property or by deleting the dead branch it exploits
    dont:
      - reach the number by a suppression comment
      - reach the number by narrowing the mutated set
      - reach the number by lowering the gate
    harm: a score certifying tests that notice nothing
    check: mutation gate (break = 100); lint banning suppression and scope-narrowing
  - id: III.4
    title: Behavior Lives Where the Mutator Sees It
    gate: lint
    do: put any code that can be wrong (transform, check, branch) in a file the mutator covers
    dont: place behavior in a declaration file (types, schemas, constant data), excluded from mutation
    harm: a bug hidden behind a perfect score, in a file nothing mutates
    check: lint — declaration files contain no behavior
  - id: III.5
    title: Pin Behavior Before You Rebuild
    gate: review
    do: before refactoring, cover the inputs the existing code accepts, with tests over real examples
    dont: trust a mutation or property score to protect behavior you haven't pinned — they're blind to behavior you delete
    harm: a rebuild silently drops a capability; the clean score certifies the regression
    check: characterization tests over real fixtures; review
```

---

## Article IV — Organization

```yaml
rules:
  - id: IV.1
    title: Organized by What It Does
    gate: review
    do: organize by workflow and capability; keep code that changes together, together
    dont: organize by what the system has (entities, technical layers)
    harm: one change scattered across the tree
    check: review — one change touches one capability subtree
  - id: IV.2
    title: Names Scream the Domain
    gate: lint
    do: name files and folders for the job they do — a name must answer "of what?"
    dont:
      - use layer names (`core`, `shell`)
      - use junk drawers (`util`, `service`, `manager`)
      - use a suffix no rule keys on
    harm: files no one can locate; meaningless buckets
    check: filename lint — allowed suffixes; banned layer and junk-drawer names
  - id: IV.3
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
  - id: V.1
    title: Depth Over Expedience
    gate: review
    do: fix the root cause; restructure when the design is wrong
    dont: patch the symptom or bypass a boundary to ship faster
    harm: the bug returns
    check: review — the change names the root cause it fixes
  - id: V.2
    title: Scope Discipline
    gate: review
    do: execute accepted scope in full
    dont: reduce scope mid-task because it grew complex, without the author's consent
    harm: half-finished work; wasted effort second-guessing intent
    check: review — delivered scope matches accepted scope
  - id: V.3
    title: First Principles Over Precedent
    gate: review
    do: justify a pattern by these principles — surrounding code is evidence of what exists, never of what is correct
    dont:
      - justify by "that is how it's done elsewhere"
      - copy a neighbouring file as a template — code age grants no immunity
    harm: unexamined defaults calcify into rules; one slop pattern seeds the next by imitation, and the average drifts down
    check: review — a choice defended by precedent, or by the file next to it, is rejected
  - id: V.4
    title: API-First Discovery
    gate: review
    do: define the outside contract first, then derive use cases, decisions, and machinery beneath it; model only what a known requirement needs
    dont: build a domain abstraction for a hypothetical future
    harm: speculative structure that never pays off and constrains what comes after
    check: review — every abstraction traces to a known requirement
  - id: V.5
    title: Challenge Before You Commit
    gate: review
    do: subject a large or irreversible choice to a deliberate challenge (another agent, a person, or rigorous self-examination), record it with the decision, judge it by the harm it names (§A.1)
    dont:
      - appeal to a tribunal or standing authority
      - let a challenge become a clause quoted against a choice
    harm: a costly, hard-to-reverse direction taken with no one trying to break it first
    check: review — the challenge is recorded with the decision
  - id: V.6
    title: No Silent Bypass
    gate: review
    do: when you break a rule here — knowingly, or because it was wrong for this case — say so, in the open, in the change itself
    dont: conceal a bypass
    harm: two failures — the breach and the hiding of it; the next reader trusts a rule quietly broken
    check: review — every rule breach is declared in the change that contains it
  - id: V.7
    title: Subtract Before You Add
    gate: review
    do:
      - treat every line as a liability — removal is the default response to slop at every scale; adding is the exception you justify
      - small — unify duplicates, make bad states unrepresentable, delete a branch instead of guarding it
      - structural — when the root violates this document and breeds a bug class, rebuild the core (behaviour pinned with characterization tests first, §III.5; decomposed into shippable milestones) rather than prune leaves off a rotten trunk
      - distrust existing structure — assume rotten until it proves it conforms
    dont:
      - extend a copy-paste cluster with copy N+1
      - add a helper when removing or unifying one does the job
      - patch around a rotten core to keep it alive
      - treat code as sound because it compiles, is large, or is old
      - mistake taste ("I'd write it differently") for rot
    harm: the codebase only grows; rot survives every patch and regrows; each copied pattern seeds the next, and the average drifts down
    check: review reads the net line delta — a refactor/improvement/chore that adds net lines states why and names what it deleted (features and their tests are exempt); a fix that leaves a named root violation standing is rejected; "rotten" names the invariant the core breaks; a structural rebuild ships its characterization tests
    example:
      wrong: add formatPhone() beside the three formatters already there
      right: delete the three, keep one parameterised formatter
      wrong_state: add a guard for the impossible state the record permits
      right_state: delete the record; a tagged union makes the state unconstructable
