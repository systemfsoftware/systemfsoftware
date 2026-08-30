# @systemfsoftware/project-modules

Resolve and import modules relative to a project directory — as a port.

Feature code yields the `ProjectModules` service and never touches a host
module API: plugin loading, config `extends` resolution, and dependency
manifest reads all go through one tag. The live Node implementation ships in
[`@systemfsoftware/project-modules-node`](../project-modules-node); tests
substitute a layer returning fixed paths.

```ts
import { ProjectModules } from '@systemfsoftware/project-modules'
import { Effect } from 'effect'

const program = Effect.gen(function*() {
  const modules = yield* ProjectModules
  const entryPoint = yield* modules.resolve('my-plugin')
  return yield* modules.import('my-plugin')
})
```

Install the port alongside the host implementation:

```sh
pnpm add @systemfsoftware/project-modules @systemfsoftware/project-modules-node
```

`resolve` returns the resolved filesystem path; `import` returns the imported
module namespace. Both fail with `ModuleNotFound` when the specifier cannot be
resolved from the project directory.
