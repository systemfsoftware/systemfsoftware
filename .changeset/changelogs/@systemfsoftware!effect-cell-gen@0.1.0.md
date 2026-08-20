## 0.1.0

### Major Changes

- The Workflow brand: `make` is the only door to a decide slot.

  `Workflow<C, D, E>` and `Cell.DecidePhase<P>` carry a phantom `WorkflowBrand` conjunct applied
  solely by `Workflow.make` through the existing assertion narrowing — no runtime property, `make`
  stays the identity it always was. The consumer's signature is the forcing function: a bare
  function handed where a decide run is demanded is now a compile error naming the brand, so a
  decision cannot reach production without passing through the constructor every gate keys on.

  Breaking by design (`REPO-R1`): the two inline adapter sites (cli's admission adapter,
  claude-compat's submit-hook adapter) become `make`-wrapped, and the cell-gen either-pass
  fixture reshapes to one exhaustive path with the failure injection decided before the boundary.

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@2.0.0
