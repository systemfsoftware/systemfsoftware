---
"@systemfsoftware/transition-diagram": minor
---

Add `@systemfsoftware/transition-diagram`: discover `Workflow.make` workflow schemas from a repo-root `transition-diagram.config.ts`, convert each into the package's exported `TransitionDiagram` schema — `decodeTransitionDiagram` refuses a transition to an undeclared state, a duplicated state id, a missing initial state and an unreadable shape, each as its own typed defect — and render the schema as a Mermaid flowchart together with an SVG and Unicode text, plus a Markdown index, with a `transition-diagram build|check` CLI whose `check` regenerates in memory and fails non-zero naming stale, missing and orphan artifacts.
