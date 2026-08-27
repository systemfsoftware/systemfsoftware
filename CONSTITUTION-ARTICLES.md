# Constitution — Articles

Retrieved, not resident. `CONSTITUTION.md` is supreme and always in context; these four articles are its craft law, delivered when the work reaches the artifact each one governs. Article V (conduct) in `CONSTITUTION.md` binds here unchanged.

Deliver this file on **write or edit** of a source file, never on read: an agent that greps, or works from a plan, never fires a read trigger. The trigger condition is the law's; the mechanism that fires it — a path-scoped rule, a pre-tool gate — is the consuming harness's, and belongs in that repo's `AGENTS.md`, never here.

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
  - id: CONST-T1
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
  - id: CONST-T2
    title: Properties Over Examples
    gate: review
    do: prove the pure core with property tests; the type is the generator
    dont: cover the core with hand-picked example unit tests
    harm: a green suite that tests only the cases you imagined, breaking on every refactor
    check: review — property-test presence on the core
  - id: CONST-T3
    title: Mutation Is the Measure
    gate: mutation
    do: gate the core at a perfect mutation score; kill a survivor with a sharper property or by deleting the dead branch it exploits
    dont:
      - reach the number by a suppression comment
      - reach the number by narrowing the mutated set
      - reach the number by lowering the gate
    harm: a score certifying tests that notice nothing
    check: mutation gate (break = 100); lint banning suppression and scope-narrowing
  - id: CONST-T4
    title: Behavior Lives Where the Mutator Sees It
    gate: lint
    do: put any code that can be wrong (transform, check, branch) in a file the mutator covers
    dont: place behavior in a declaration file (types, schemas, constant data), excluded from mutation
    harm: a bug hidden behind a perfect score, in a file nothing mutates
    check: lint — declaration files contain no behavior
  - id: CONST-T5
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
