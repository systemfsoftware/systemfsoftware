---
problem_type: architecture_pattern
---

# A Skill Becomes A Gate By Stating The Obligation

Decision: to retire an agent skill that teaches a technique, do not encode the technique as lint
rules. Make every unit state, in one sentence, what the technique exists to guarantee, and run a
check that tries every way the guarantee can be broken. The `effect-interruption` skill was replaced
this way: each Cell, Blueprint, Handle, and `Supervisor.Medium` module states what it owes when
stopped, `Conformance.stopped` stops it at every simulation-kernel step three ways and judges that
sentence, and the published `systemf check` command (`@systemfsoftware/systemf`, run per
package) fails CI for a module no stop check reaches.

## The argument

1. A skill teaches _how_ (masks, finalizers, acquire/release). Lint rules over _how_ either forbid
   correct code or pass wrong code, because whether a finalizer or mask is needed depends on what the
   unit owes an outside party, which the syntax does not show.
2. What the unit owes is short and checkable: held work flushed, whoever waits told how it ended, an
   outside change finished or undone, the stop finished in time. Written as a rule over the unit's
   world, it can be judged after any stop.
3. A blind trial settled which input mattered. Fresh agents, three stop tasks, two per setup:
   task only 4 of 6 correct; task plus the stated rule and an ordinary test 5 of 6; rule plus the
   skill 6 of 6; rule plus the every-step check 6 of 6. Agents already use Effect's cleanup
   combinators once told what the code owes. The misses (a flush that hung when the collector was
   down, a waiter left waiting when only the worker stopped, an event lost when one fiber stopped)
   were caught only by stopping at every step. The skill added nothing the rule and check did not.

## What makes the check honest

- **The rule must fail when its subject never appeared.** A rule over a pool, watcher, or started
  child that returns void when none was captured passes a program that never reached the unit.
- **The check must exercise the cut it claims.** A one-fiber cut that lands on a fiber a transform
  forked into its own scope produces a state no real stop produces; skip it (R7), but count and report
  the skipped points instead of dropping them.
- **Fakes answer to the real adapter.** A stop check over a fake proves nothing about the adapter
  unless the fake and the real adapter pass one shared stop-law suite.
- **Enrollment is by type, linkage by reference.** A module is enrolled by the kind its declarations
  have; it is covered only when a checked unit's own code references it, not when a checked module
  merely imports it.
- **The lane must run it.** A check skipped on pull requests is not a gate; the conformance project
  cannot be omitted or narrowed by a package config.
- **The gate ships where the skill travelled.** A skill follows the agent into every repository; a
  repo-root script does not, so the enrollment check is a published command each package runs. It
  finds the kinds by package and export name: matching them by `src` path enrolls nothing in a
  consumer, where the kinds resolve to published declaration files. The carrier has to be the
  TypeScript native API that `@effect/tsgo` patches; a test runner has no types, and ttsc does not
  work alongside `@effect/tsgo`.

## Applicability

Use this when a skill's content reduces to an obligation a unit owes and the obligation's failure
is observable by a harness. When the skill teaches a style with no observable failure, there is no
check to write; delete the skill only when a trial shows agents do as well without it.
