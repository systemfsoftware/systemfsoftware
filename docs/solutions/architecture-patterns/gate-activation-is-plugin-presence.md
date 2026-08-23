---
title: A gate plugin's activation is its presence, never a second option
date: 2026-08-23
category: solutions/architecture-patterns
module: Stryker fork plugin system
problem_type: architecture_pattern
component: testing_framework
severity: medium
applies_when:
  - extracting a run-level check from an engine into a plugin package
  - designing the on and off switch for a plugin-delivered gate
tags: [stryker, plugin, gate, evaluator, options]
---

# A gate plugin's activation is its presence, never a second option

## Context

The test-contribution gate — fail a mutation run when a required property-test file kills no mutant another file does not also kill — moved out of the mutation engine into a standalone addon package. The first extraction kept the engine-era shape: a `requireTestContribution` option carried the suffix list, `null` meant off, and the plugin read the option to decide whether to judge.

That shape fails twice. A plugin that is loaded but inert reads as configured when it is not — the config lists it, yet the option decides. And a `null`-to-disable escape hatch is a second, competing switch: two sources of truth for one boolean, each able to contradict the other across an `extends` chain where arrays merge additively but scalars replace wholesale.

## Guidance

Activation is membership. A gate plugin is on exactly when the plugin module is listed; it is off exactly when it is not. There is no option to read, no `null` sentinel to normalize, no schema entry to contribute. The judgement reads only what genuinely belongs to the run (`disableBail`), not a copy of its own activation state.

```
evaluate(report):
  verdict = judge(report, options.disableBail)   // presence already decided activation
  if verdict.failed: setPendingExitClass(VerdictFail)
```

The plugin kind must state the lifecycle truth. A post-report gate is neither a Reporter (presentation) nor a Checker (per-mutant compile): it is an Evaluator, run by the engine over the finished report. Naming it by the hook it borrowed is a lifecycle lie that forces every consumer to wire the gate through a channel built for output.

## Why This Matters

Two switches for one state admit states the model cannot name: plugin listed, option `null` — on or off? The answer is whichever merge rule the config chain applied last, which is exactly the fact a reader of the config cannot see. One switch — presence in the plugin list — makes every config self-describing: the gate's state is on the same line as everything else the config loads.

The deeper invariant: **an instrument's activation must be observable at the point of its declaration, and nowhere else.** Any gate whose on/off state lives in a different file, option, or sentinel than its declaration acquires a second configuration surface, and the two surfaces drift.

## When to Apply

- Extracting any engine-resident check into a plugin, where the option that used to arm it survives the move as dead weight.
- Reviewing a plugin that reads an option whose only remaining meaning is "should I have been loaded?"
- Designing an escape hatch: if the only way to disable a thing is to stop declaring it, there is nothing to document and nothing to normalize — prefer that over a `null` sentinel whenever the declaration is per-run configuration (a preset that inherits the plugin by default is the exception to weigh deliberately, since children cannot subtract from an additively-merged plugin list).

## Examples

Before — two switches:

```
plugins: ["…test-contribution"],
requireTestContribution: null        // loaded but off; schema normalizes six input shapes
```

After — one switch:

```
plugins: ["…test-contribution"]     // on; the judge reads only disableBail
// (absent from plugins)            // off
```

A package that previously opted out with the `null` sentinel simply deletes the key; with no in-scope files the gate reports "none was judged" and passes, so empty-scope packages need no opt-out at all.

## Related

- `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` — the sibling principle for routing: a rule keyed on an author's assertion never fires on its violation; here, a gate keyed on an option never states its own activation.
