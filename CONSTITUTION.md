# Constitution

## Preamble

This document states **principles, not tools or languages**. The language, frameworks, libraries, and lint rules live in `AGENTS.md`, the skills, and the ADRs — never here. Exemplars use neutral type notation (sum types and `name : Input -> Output`) so no principle pins to one stack.

Every `harm` is the stated rationale for its rule, not a measured finding — none is a claim that the consequence has been observed at a given rate. Comply with the directive and its harm, not the prose around them, and read a `gate` as the only thing that establishes a rule held.

## The Retrieved Articles

Articles I–IV are **retrieved, not resident** — `CONSTITUTION-ARTICLES.md`. Each fires on the artifact it governs, on write or edit, never on read:

| Article | Fires when you are authoring |
| --- | --- |
| I — The Pure Core | a domain type, or a decision function |
| II — The Boundary | a handler, adapter, port, or composition root |
| III — Verification | a test, or a judgement about one |
| IV — Organization | a module's name, or its place in the tree |

This document carries what no artifact announces and no mechanism catches. A rule whose harm fires before you would know to look lives here; a rule the work itself announces lives there. That is the whole partition — not importance, and not article order.

## Application

```yaml
rules:
  - id: CONST-G1
    title: By Purpose, Not Quotation
    gate: review
    do: invoke a principle by showing the harm is present; where letter and purpose diverge, purpose governs — ask "does this harm occur here"
    dont: invoke a principle by quoting a clause or asking which clause to cite
    harm: the letter applied where no harm exists defeats the purpose
    check: review — an invocation names the harm, not the clause
  - id: CONST-E1
    title: Prefer the Gate
    gate: review
    do: make any principle that can fail a command — type error, lint rule, mutation threshold, dependency check — fail that command, at the price CONST-E3 sets; a failing build is the final word
    dont: settle compliance by citing a clause against a gate; read this clause as licence to add enforcement without paying for it
    harm: an ungated principle decays into prose nothing enforces
    check: review — each principle names its gate
  - id: CONST-E3
    title: A Gate Earns Its Place
    gate: review
    do:
      - name the mistake each gate prevents — a specific wrong thing that specifically happened, in the same form a module earns its existence
      - price the entry before adding it — for N checks each misfiring independently with probability p, a clean run is blocked with probability 1-(1-p)^N, so affordability is N x p and never N, and the Nth gate tightens the requirement on every gate already present
      - retire or subsume when you add; a rule a published artifact can carry leaves the suite entirely and costs the budget nothing
    dont:
      - add a gate whose verdict depends on scheduler order, cache state, or which task happened to finish first — that is a coin flip wearing an exit code, and green from it is indistinguishable from luck
      - keep a check whose false-positive rate has already demoted it to a suggestion the team waives
    harm: enforcement accumulates and nothing removes it, because deletion produces no artifact while addition produces a file. An earn test that binds modules but not gates states that gates are free; the suite then blocks clean runs often enough to be routinely bypassed, and the machinery is a liability twice over — a larger agent-writable enforcement surface is measured to raise specification-violating shortcuts rather than compliance
    check: review — each added gate names its mistake and its false-positive band, and the change states what retired; an unstated aggregate is an unpriced suite. The band itself is a contestable number and belongs in the harness, never here
  - id: CONST-E4
    title: The Evaluator Is Not the Agent's to Edit
    gate: review
    do: keep the surface that judges the work outside the surface that does it — an evaluator, rubric, threshold, budget or approval boundary changes in its own commit, observed failing before and passing after, for the reason it states
    dont: weaken a gate, threshold, budget or glob to make the current change pass; ship an evaluator change in the same commit as the work it judges
    harm: given a blocked task and reachable machinery, the measured behaviour is to edit the machinery rather than satisfy it, and more capable models do this more often rather than less; an agent that judges itself reports the score it chose
    check: review — no commit carries both an evaluator change and the work it judges; a loosened threshold stands alone and names its reason
  - id: CONST-E2
    title: Evidence Before Done
    gate: review
    do: treat "done" as a gate passed or a test shown
    dont: accept a reported score or a claimed "it works" as done
    harm: compliance claimed without evidence
    check: review — done names the gate that passed or the test that ran; a report of either is not either
  - id: CONST-G2
    title: Supreme
    gate: review
    do:
      - govern AGENTS.md, lint, and the ADRs on what a rule should say, where they conflict
      - defer to the gate on whether a rule held — where this document and a gate disagree about a specific change, the gate is the final word (CONST-E1) and the disagreement is resolved by amending one of them, never by overriding the gate in place
      - place contestable choices — suffixes, patterns, module shape — in ADRs
    dont: pin contestable choices in this document
    harm: contestable choices frozen as supreme law; conflicts left unresolved
    check: review — a conflict resolved by this document, a contestable choice resolved by an ADR
```

---

## Article V — Conduct

```yaml
rules:
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
    do: subject a large or irreversible choice to a deliberate challenge (another agent, a person, or rigorous self-examination), record it with the decision, judge it by the harm it names (CONST-G1)
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
      - structural — when the root violates this document and breeds a bug class, rebuild the core (behaviour pinned with characterization tests first, CONST-T5; decomposed into shippable milestones) rather than prune leaves off a rotten trunk
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

```
