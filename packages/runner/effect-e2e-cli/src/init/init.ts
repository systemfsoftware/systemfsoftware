import * as Bool from 'effect/Boolean'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'

import type { Engine, Gateway } from '../templates/answers.js'
import { IGNORED_OUTPUT, suiteFilesOf, TEST_E2E_SCRIPT } from '../templates/suite.js'
import { readCliManifest, suiteDependenciesOf } from './cli-manifest.js'
import { InitRefused } from './init-failure.schema.js'
import { install } from './install.js'
import { PlanScaffold, planScaffold, type ScaffoldPlan, type SuiteWrite } from './plan-scaffold.workflow.js'
import { projectIdOf, suiteRootOf } from './suite-root.js'

export interface InitRequest {
  readonly dir: Option.Option<string>
  readonly engine: Engine
  readonly gateway: Gateway
  readonly model: Option.Option<string>
  readonly install: boolean
  readonly force: boolean
  readonly manifestUrl: URL
}

const textAt = (fs: FileSystem.FileSystem, file: string) =>
  Effect.flatMap(
    Effect.orElseSucceed(fs.exists(file), () => false),
    (present) =>
      Bool.match(present, {
        onFalse: () => Effect.succeedNone,
        onTrue: () => fs.readFileString(file).pipe(Effect.orDie, Effect.asSome),
      }),
  )

const decided = (plan: Result.Result<ScaffoldPlan, never>): ScaffoldPlan =>
  Result.match(plan, { onFailure: (never: never) => never, onSuccess: (decision) => decision })

const refuse = (message: string) =>
  Console.error(message).pipe(Effect.andThen(Effect.fail(new InitRefused({ message }))))

const writesOf = (root: string, path: Path.Path) => (plan: ScaffoldPlan) =>
  Match.valueTags(plan, {
    ScaffoldPlanned: ({ writes }) => Effect.succeed(writes),
    ScaffoldRefused: ({ conflicts }) =>
      refuse(
        [
          'effect-e2e init wrote nothing: these files already exist (pass --force to replace them):',
          ...conflicts.map((conflict) => `  ${path.join(root, conflict)}`),
        ].join('\n'),
      ),
    ManifestUnreadable: ({ expected }) =>
      refuse(`effect-e2e init wrote nothing: ${path.join(root, 'package.json')} is not ${expected}`),
  })

const write = (root: string, fs: FileSystem.FileSystem, path: Path.Path) => (file: SuiteWrite) =>
  Effect.gen(function*() {
    const absolute = path.join(root, file.path)
    yield* fs.makeDirectory(path.dirname(absolute), { recursive: true })
    yield* fs.writeFileString(absolute, file.content)
    yield* Console.log(`  wrote ${file.path}`)
  }).pipe(Effect.orDie)

/**
 * `effect-e2e init` (design §15.1): renders the suite, decides what to write with {@link planScaffold}, writes it, and
 * installs unless told not to. A refusal writes nothing and exits 2.
 */
export const init = (request: InitRequest) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* suiteRootOf(request.dir)
    const cli = yield* readCliManifest(request.manifestUrl)
    const manifest = yield* textAt(fs, path.join(root, 'package.json'))
    const projectId = projectIdOf({ directory: path.basename(root), manifest })
    const rendered = suiteFilesOf({ engine: request.engine, gateway: request.gateway, model: request.model, projectId })
    const files = yield* Effect.forEach(rendered, (file) =>
      Effect.map(
        Effect.orElseSucceed(fs.exists(path.join(root, file.path)), () => false),
        (present) => ({
          ...file,
          present,
        }),
      ))
    const plan = decided(planScaffold(
      new PlanScaffold({
        force: request.force,
        files,
        manifest,
        ignore: yield* textAt(fs, path.join(root, '.gitignore')),
        name: projectId,
        script: TEST_E2E_SCRIPT,
        devDependencies: suiteDependenciesOf(cli),
        ignoredOutput: IGNORED_OUTPUT,
      }),
    ))
    const writes = yield* writesOf(root, path)(plan)
    yield* Console.log(`effect-e2e init: scaffolding ${projectId} in ${root}`)
    yield* Effect.forEach(writes, write(root, fs, path), { discard: true })
    yield* Bool.match(request.install, { onFalse: () => Effect.void, onTrue: () => install(root) })
    yield* Console.log(`Run the suite with its test:e2e script from ${root}`)
  })
