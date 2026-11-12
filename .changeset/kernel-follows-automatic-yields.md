---
"@systemfsoftware/effect-sim-kernel": patch
"@systemfsoftware/conformance-spec": patch
"@systemfsoftware/differential-spec": patch
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-schema-law": patch
"@systemfsoftware/effect-schema-recursion-budget": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/storybook-gherkin": patch
"@systemfsoftware/trace-taxonomy": patch
---

Follows Effect 4.1.4's automatic yields. A resumed fiber continues inline instead of being queued as a new step, so a run stopped after any step releases the resources its scope acquired. Previously, under Effect 4.1.4, such a stop could leave an acquired resource unreleased, or leave the run waiting with no runnable step.
