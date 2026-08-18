# Exported Live State Is Not Structurally Decidable

## The Argument

A package must not hand a consumer live coordination state. Give a caller the `Map` behind
`withLock`, and they coordinate through it directly; the interior is then frozen, because
swapping it or adding backpressure breaks them silently. The rule is sound. The claim that a
mechanical predicate can _decide_ it is what fails, and this document records four predicates
built against it, the measurement that killed each, and the one that survives with a narrowed
claim.

The failure is uniform: each predicate's message asserted a property its predicate did not
settle. Two shipped rules were deleted on this evidence, and a replacement gate was built and
then withdrawn.

## Failure Mode 1 — A Syntactic Predicate Decides Spelling, Not Type

A predicate over source text or emitted declarations matches a _spelling_. The question is about
a _type_. The set of spellings denoting one type is unbounded, so each fix buys one spelling and
the next adversarial pass finds another.

Measured: nineteen confirmed evasions across four adversarial rounds against one text-scanning
predicate, each verified by writing the probe, running the real linter, and observing zero
findings. The escape classes, which generalise to any text predicate over a typed language:

1. **Namespace qualification.** The compiler emits `Ref.Ref<A>`, `Queue.Queue<A>`,
   `SubscriptionRef.SubscriptionRef<A>` — the namespace and the type share a name. A predicate
   excluding a match preceded by `.` excludes exactly the form the compiler actually writes.
2. **Member syntax variants.** A method, a string-keyed method, an index signature on a class, a
   member of a `declare namespace` block, and a getter each need their own pattern.
3. **Type-level composition.** A tuple, a second-position union member, an indexed access, an
   `Omit` of a primitive, and a generic parameter default all denote the primitive without
   naming it in the reported position.
4. **Aliasing.** `type Registry = Map<K, V>` moves the name out of the signature entirely; an
   alias chain moves it arbitrarily far.
5. **Constructor forms.** `typeof Map` carries no type arguments to match.
6. **Physical layout.** A declaration wrapped across lines defeats a line-oriented scan; joining
   statements by bracket balance then miscounts, because `=>` contains `>`.
7. **A closed name list.** Any primitive absent from the list passes, and every future one needs
   a manual addition.

**Invariant — Predicate Domain Matching.** A predicate must range over the same domain as its
claim. A claim about types is settled by the type checker; a claim about syntax is settled by a
syntax predicate. Crossing the boundary produces a predicate whose false-negative set is
unbounded and whose message is therefore false.

## Failure Mode 2 — Absence Of Findings Is Not Evidence Of Checking

A gate keyed on "no diagnostics attributable to me" treats two states as one: _the checker ran
and found nothing_, and _the checker never ran_.

Measured: a type-level gate invoked the compiler with a project configuration containing an
option removed in the current compiler version. The compiler emitted one configuration
diagnostic and type-checked nothing. The gate's filter matched no diagnostics in its own file and
reported that every surface was clean.

$$\text{findings} = \emptyset \;\not\Rightarrow\; \text{property holds}$$

The implication only holds conjoined with evidence the decision procedure executed.

**Invariant — Positive Liveness Evidence.** A gate must establish that its decision procedure
ran before interpreting an empty finding set as a pass. Two mechanisms discharge this, and both
are cheap: classify a configuration-level or infrastructure-level diagnostic as _did not run_
rather than _clean_; and carry a self-test that plants a violation and requires a finding, so a
run that cannot fail is itself a failure. This is the same defect class as a check keyed on a
value its own author supplied — the gate certifies its own liveness rather than measuring it.

## Failure Mode 3 — Fail-Open At The Unresolved Boundary

A predicate that resolves a binding to its origin must decide what an _unresolvable_ binding
means. Treating unresolvable as "not a violation" makes every shape outside the resolver's
envelope a smuggling route, and the routes are cheap to find.

Measured against a declaration-placement rule: fourteen confirmed escapes, every one a shape the
origin resolver returned nothing for — a `let`-kind alias, a sequence expression, a computed
destructuring key, a type-assertion wrapper, an alias chain past the depth cap, an
immediately-invoked function, an object or array wrapper, a destructuring declarator, a
non-identifier computed member key, and a value reached through a module-local call.

**Invariant — Unresolved Is A Finding, Not A Pass.** Where a predicate's claim is that a
construct appears only in sanctioned locations, an initializer whose origin the resolver cannot
determine must report, naming irresolution as the reason. The narrow exception is a value that is
_genuinely_ opaque — one crossing a module boundary the predicate does not read, or arriving as a
parameter — where the predicate truly cannot decide and its message must say so. A depth cap that
passes on overflow is the same defect wearing a constant.

## Failure Mode 4 — Structural Predicates Cannot Separate Coordination State From Value Objects

A type-level predicate escapes Failure Mode 1 completely: the compiler resolves aliases,
namespaces, renames, casts and layout before the predicate sees anything, so the entire
nineteen-shape escape set is closed by construction. Three candidate predicates were then
measured against a source census of the vendored Effect release, covering its forty mutable and
coordination types.

### Candidate A — Mutator Method Names

`keyof T` including `set`, `add`, `delete`, `clear`, `enqueue`, `offer`, `unsafeSet`.

**Caught 0 of 40.** No Effect coordination primitive declares a mutator as a member: operations
are module-level functions taking the primitive as an argument. The predicate decides JavaScript
builtin collections and nothing else in that library.

### Candidate B — Writable Data Properties

Writability _is_ decidable, despite assignability ignoring `readonly` on properties, so
`Readonly<T> extends T` settles nothing. The identical-type-parameter comparison decides it:

```
IsWritableKey<T, K> =
  (<X>() => X extends { [P in K]: T[K] } ? 1 : 2) extends
  (<X>() => X extends { readonly [P in K]: T[K] } ? 1 : 2) ? false : true
```

**Caught 11 of 40**, including the canonical mutable cell's `current`, a deferred value's
completion slots, a subscription reference's `value`, a queue's four inherited members, a scope's
`state`, and the fiber containers' `state`.

It cannot ship, for a reason no refinement removes. A writable optional slot on a component type
— a React function component's `displayName` — is _structurally identical_ to a mutable cell's
`current`. Both are one writable slot on an interface. Measured consequences:

- Unbounded, it reported every `Effect<A, E, R>` in the tree, because the effect type's iterator
  plumbing bottoms out in an iterator-result object whose `value` slot is writable.
- Bounded to shallow depth, it still reported every exported component type.
- Restricting to non-function-typed members was necessary but insufficient: an interface method is
  not `readonly` either, so counting methods made every type carrying one read as live state,
  failing fourteen read-only fixtures at once.

$$\text{writable slot} \;\not\Rightarrow\; \text{coordination state}$$

The distinction between a mutable cell and a mutable record is _intent_, which is not in the type.

### Candidate C — Library Brands, At The Type Level

Key on the unique-symbol type identifier each primitive declares, from inside the type system.

**Not available to a type-level predicate.** Exactly one `unique symbol` type identifier exists in
the entire vendored library, on an unrelated HTTP header type. Every coordination primitive brands
with an _unexported_ string-literal constant, so a conditional type has no importable nominal
handle to compare against. Three types carry no brand at all, and there is no shared umbrella
brand — each module declares its own.

This is a limit of the _type level_, not of nominal identity as such. See the Compile-Time
Analyser section below, where identity is recovered from outside the type system and verified.

### Candidate D — Reaching A Mutable Builtin Collection

`Map`, `Set`, `WeakMap`, `WeakSet`, reached from an outgoing position at any depth.

**Caught 15 of 40** on its own — the mutable hash map and hash set through their backing
collections, the publish-subscribe primitive through its subscriber map, the cache and pool
through their entry sets, and the whole transactional family through the shared transactional
reference's pending map. Combined with Candidate B it reaches 26 of 40, or 65%, which refutes any
claim that a structural predicate decides "close to nothing" here.

This candidate is precise: reaching a mutable builtin collection means the consumer can mutate a
collection the package owns, and no spelling changes that. **It is the survivor**, and its claim
must be stated as exactly that, never as "no surface hands out live coordination state" — 14 of
the 40 hide their state in a closure or in the runtime and are invisible to every structural
predicate over their public type.

## Failure Mode 5 — Variance, And The Harness That Reports Its Own Noise

Two mechanics matter for any type-level reachability walk, and both were found by measurement
rather than reasoning.

**Contravariance is not optional.** A parameter is the consumer's value already, so it is not a
handout — but a _function-typed_ parameter is one the package **calls**, so that function's own
parameters flip back to outgoing. `(use: (ref: Ref<A>) => void) => void` hands out a `Ref`. A walk
must alternate polarity through function types, and must stop at a primitive reached in an
incoming position: continuing into the consumer's own collection finds its iteration callback
receiving that same collection back, and reports it as outgoing.

Three mechanical traps, each of which silently produced a wrong verdict:

1. **`any` distributes both conditional branches.** Every builtin iteration method carries an
   optional untyped context parameter, so an unguarded walk resolved to a union containing `any`
   and reported. An undecidable input must yield "not decided", never a finding.
2. **Homomorphic mapped types preserve optionality.** Mapping a parameter tuple and indexing it
   yields `undefined` beside the elements, and that `undefined` surfaces as a finding whose type
   is not a primitive at all. Strip the modifier.
3. **Arrays carry mutators.** Including array-likes in a mutability test makes every function's
   own parameter list read as live state.

**The harness is part of the predicate.** Resolving each package to its TypeScript sources means
those sources compile under the _gate's_ configuration rather than their own, surfacing library
and target mismatches the gate has no opinion about — and, where a package failed to type at all,
yielding `any` and thus a finding. Resolving to built declarations instead makes the verdict
depend on an artifact that can be stale, freezing a package's verdict while its sources change.
Half of one gate's final findings were harness artifacts of this kind.

**Invariant — Sound Application Layer.** A correct predicate applied through an unsound harness is
an unsound gate. The predicate and the mechanism that applies it to real inputs require
independent evidence; fixtures prove only the former.

## Verification Patterns

- **Adversarial probes, not fixtures alone.** Every escape recorded here was found by writing a
  probe, running the real checker, and observing zero findings — then landing that probe as a
  regression case. Fixtures written by the predicate's own author pin the shapes its author
  imagined.
- **Red before green, on a real subject.** Observe the finding absent, change the predicate,
  observe it present. A gate demonstrated only against synthetic fixtures has not been shown to
  fire on the tree it governs.
- **Self-test that plants a violation.** Required by the Positive Liveness Evidence invariant.
- **Census before scope claims.** A claim about coverage is a number. Enumerate the target
  library's types from its source, classify each, and report the ratio. Both the assertion that
  the structural predicate caught "close to nothing" and the assertion that specific primitives
  were invisible were refuted by counting.

## Code Smells

```
# A predicate over text answering a question about types
if (/(?<![A-Za-z0-9_$.])(Map|Set|Ref)\s*</.test(line)) report()

# Absence of findings read as a pass, with no evidence the checker ran
if (diagnosticsInMyFile.length === 0) return pass

# Unresolved origin treated as compliant
const origin = resolve(binding)
if (origin === null) return          # every unresolvable shape is now a route

# A depth cap that passes on overflow
if (depth > MAX_DEPTH) return null   # a ladder, not a bound

# A closed list of type names standing in for a property
const LIVE = ['Map', 'Set', 'Ref', 'Queue']   # every future primitive is a hole

# A message asserting more than the predicate settles
'exported live coordination state'    # when the predicate decides only builtin collections
```

## The Mechanism That Does Decide It — A Compile-Time Analyser

Every failure above shares one cause at a higher level: each predicate was confined to a domain
narrower than its claim. A text predicate cannot see types. A type-level predicate can see
structure but not _identity_, and cannot see modifiers, because assignability discards them.

A predicate driving the compiler's own type checker from outside the type system has both. This
was verified against the toolchain in use, not assumed, and the results below are measured.

**Nominal identity, and it is alias-transparent.** Resolve an export to its type, take that type's
symbol, and read the declaration paths behind it. Measured on a subject declaring a decoy type
deliberately named the same as the builtin: the builtin resolved to four declarations, all in
standard library files; the decoy resolved to one, in the subject file. A type alias over the
builtin resolved to _the same four library declarations_ while still printing as the alias name.
The read-only view resolved to library files too, and is separated from the mutable one by symbol
name. So a spelling, a rename, a namespace qualifier, an alias chain and a cast are all one type
with one identity, and a consumer's same-named type is not confusable with it. This is the
capability whose absence defeated the text predicate, and whose type-level substitute does not
exist.

**Variance falls out of signatures.** A call signature yields its parameter types and its return
type separately, including a nested callback's own parameter types. A walk alternating polarity
through function types is then direct, rather than reconstructed by blanking parenthesised runs of
text.

**Two limits found by probing, both real.** The checker surface in use exposes no per-property
readonly predicate, so property mutability needs the symbol's check flags or its declaration's
modifiers rather than a single call — and per Candidate B, mutability is the wrong question anyway.
Second, a method is distinguished from a data property by asking whether its type has call
signatures, which works and is worth stating because the modifier-based approach silently does not.

**Invariant — Decide Identity Where Identity Lives.** A claim about which _type_ a value has is
settled by the compiler's symbol table, never by the value's spelling and never by its structure.
Structure answers "what shape is this", which is a different question, and substituting one for the
other is what produced both an unbounded false-negative set and an unbounded false-positive set in
the attempts above.

The residual cost is honest and unchanged: an analyser must be applied through a sound harness
(Sound Application Layer), and it decides nothing about the fourteen primitives that hide their
state in a closure or in the runtime, because no analysis of a public type can reach what the
public type does not mention.

## Outcome

Two rules were deleted on this evidence: one refusing module-scope construction of a coordination
primitive, which had eight confirmed escapes and also refused the module-private shape its own
message prescribed; and one refusing a service-construction expression that the compiler already
rejects with a diagnostic naming the exact expression and its replacement, which had seven
confirmed escapes. A restated compiler diagnostic is not a rule.

The type-level gate was built, proven against twenty-one pinned shapes including the full
nineteen-shape escape set, and withdrawn — not for its predicate, which held, but for its
application layer, per the Sound Application Layer invariant.

What survives is the ordering: state the claim, choose a predicate whose domain matches it, count
what it decides against a real census, and only then decide whether the residue is small enough to
name honestly. Related: `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`.
