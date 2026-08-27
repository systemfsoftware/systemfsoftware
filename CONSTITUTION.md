# Constitution

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
