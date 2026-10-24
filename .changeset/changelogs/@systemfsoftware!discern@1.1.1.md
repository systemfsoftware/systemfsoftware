# @systemfsoftware/discern@1.1.1

No code change: the built output is byte-identical; only the published dependency ranges move.

- `effect-schema-vite`: its exact `@systemfsoftware/effect-schema-law` peer moves to the new minor.
- discern, effect-atom, effect-atom-react, effect-daemon-cluster, effect-daemon-conformance,
  effect-daemon-process, effect-daemon-socket, effect-daemon-spec, effect-memfs,
  effect-microsandbox, effect-readiness, hex-schema: the `effect-schema-law` and
  `effect-schema-vite` devDependency ranges move.
- effect-cell-types: the `effect-schema-vite` devDependency range moves.
- differential-spec, effect-daemon-microvm, effect-schema-extensions, npm-package, trace-spec:
  ranges on `@systemfsoftware` dependencies released alongside move.
