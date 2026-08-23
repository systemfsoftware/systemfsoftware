## 4.0.0

### Major Changes

- New rule `make-command-schema`, enabled as an error in the recommended config: the command position of `Workflow.make` may not hold a value laundered into looking like a schema class. Upgrading with the recommended config on will fail builds that currently pass.

  It reports three shapes, all of which a type checker accepts: a type assertion, a non-null assertion, or a `satisfies` clause at the command position; a value assembled by `Object.assign`, `Object.create`, `Reflect.construct` or a `Proxy` wrapper; and a binding that exists only as a `declare`.

  It stays silent wherever the type checker already refuses — a plain class, an object literal, a struct schema, a primitive — so it adds no second report on code that already fails to compile. It is also silent on a factory call that returns the class, and on these constructors reached through an alias rather than written out.

### Patch Changes

- The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

  Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.
