---
"@systemfsoftware/differential-spec": patch
"@systemfsoftware/discern": patch
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-daemon-cluster": patch
"@systemfsoftware/effect-daemon-conformance": patch
"@systemfsoftware/effect-daemon-microvm": patch
"@systemfsoftware/effect-daemon-process": patch
"@systemfsoftware/effect-daemon-socket": patch
"@systemfsoftware/effect-daemon-spec": patch
"@systemfsoftware/effect-memfs": patch
"@systemfsoftware/effect-microsandbox": patch
"@systemfsoftware/effect-readiness": patch
"@systemfsoftware/effect-schema-extensions": patch
"@systemfsoftware/effect-schema-vite": patch
"@systemfsoftware/hex-schema": patch
"@systemfsoftware/npm-package": patch
"@systemfsoftware/trace-spec": patch
---

No code change: the built output is byte-identical; only the published dependency ranges move.

- `effect-schema-vite`: its exact `@systemfsoftware/effect-schema-law` peer moves to the new minor.
- discern, effect-atom, effect-atom-react, effect-daemon-cluster, effect-daemon-conformance,
  effect-daemon-process, effect-daemon-socket, effect-daemon-spec, effect-memfs,
  effect-microsandbox, effect-readiness, hex-schema: the `effect-schema-law` and
  `effect-schema-vite` devDependency ranges move.
- effect-cell-types: the `effect-schema-vite` devDependency range moves.
- differential-spec, effect-daemon-microvm, effect-schema-extensions, npm-package, trace-spec:
  ranges on `@systemfsoftware` dependencies released alongside move.
