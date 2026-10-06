---
"@systemfsoftware/transition-diagram": minor
---

Add `@systemfsoftware/transition-diagram`: discover XState v6 machines and `Workflow.make` workflow schemas from a repo-root `transition-diagram.config.ts`, render each as a Mermaid `stateDiagram-v2` or outcome flowchart together with an SVG and Unicode text, and write a Markdown index, with a `transition-diagram build|check` CLI whose `check` regenerates in memory and fails non-zero naming stale, missing and orphan artifacts.

Also add its `./model-test` host-contract subpath: generate every shortest path through a caller-supplied machine with `xstate/graph`, run each path against the caller's store adapter, fail a coverage check naming any declared state or transition no generated path reaches, and prove a persisted snapshot round-trips through `createActor({ snapshot })` unchanged.
