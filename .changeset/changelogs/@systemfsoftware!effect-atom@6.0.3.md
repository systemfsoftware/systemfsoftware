# @systemfsoftware/effect-atom@6.0.3

Schema classes and errors conform to the effect-tsgo 0.54 lint rules (nominal brand on classes); the published behavior is unchanged. Rebuilt against the new `@systemfsoftware/oxlint-config-recommended` and `@systemfsoftware/oxlint-plugin-test-discipline` releases; the exported API is unchanged. Rebuilt with updated development dependencies. An accumulating `Atom.pull` keeps the longest batch it has delivered, so concurrent pulls that finish out of order no longer leave the atom on an older, shorter batch. turbo moved 2.11.8 -> 2.11.10
