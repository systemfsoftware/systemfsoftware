# @systemfsoftware/project-modules-node

Node host implementation for
[`@systemfsoftware/project-modules`](../project-modules).

`ProjectModulesLive(projectDir)` resolves and imports specifiers from
`projectDir` exactly as a module evaluated there would — the same lookup a
`require` scoped to that directory performs, reached through the runtime's own
module API rather than an import your linter has to allow.

```ts
import { ProjectModules } from '@systemfsoftware/project-modules'
import { ProjectModulesLive } from '@systemfsoftware/project-modules-node'
import { Effect } from 'effect'

const program = Effect.gen(function*() {
  const modules = yield* ProjectModules
  return yield* modules.resolve('vitest/package.json')
}).pipe(Effect.provide(ProjectModulesLive(process.cwd())))
```

`projectDir` is resolved to an absolute path, so a relative value is read
against the process working directory.
