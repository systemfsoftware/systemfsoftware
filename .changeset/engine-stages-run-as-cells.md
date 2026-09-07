---
"@systemfsoftware/stryker-js-engine": major
---

The mutation run is now published as `mutationRun`, a single Cell that carries
the whole pipeline — prepare, instrument, dry run, mutation test — as one
composed value. Seed the run's environment and event queue with `Layer.succeed`
at your program's entry, merge in the engine's static layers, provide your host
layers once with `Cell.provide`, and run the spine once with
`Cell.run(mutationRun, { cliOptions, targetMutatePatterns })`. The
`runMutationTest` function and the `makeRunLayer` layer factory are removed;
the engine exports the static `idGeneratorLayer` instead, and stage services
still arrive as the Cell's requirement set.
