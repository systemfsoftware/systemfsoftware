import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { build, check, type DiagramConfig, discover, renderDiscovered } from '@systemfsoftware/transition-diagram'
import { Array as Arr, Effect, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

const Feature = makeFeature({ it })

const FIXTURES = `${process.cwd()}/tests/__fixtures__`
const PROJECT = `${FIXTURES}/project`
const SCRATCH_ROOT_OXLINT_IGNORES = `${process.cwd()}/node_modules/.cache/transition-diagram-tests`

const MODULES = ['./workflows/place-*.workflow.ts', './workflows/refund-*.workflow.ts'] as const
const MODULES_REVERSED = ['./workflows/refund-*.workflow.ts', './workflows/place-*.workflow.ts'] as const

const CONFIG_SOURCE = `export default {\n  modules: ${JSON.stringify(MODULES)},\n  outDir: './out',\n}\n`
const BROKEN_CONFIG_SOURCE = `export default {\n  modules: ['./empty/*.module.ts'],\n  outDir: './out',\n}\n`

const writeFile = (
  file: string,
  contents: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    yield* fs.writeFileString(file, contents)
  })

const scratchProject = Effect.gen(function*() {
  const fs = yield* Effect.service(FileSystem.FileSystem)
  const path = yield* Effect.service(Path.Path)
  yield* fs.makeDirectory(SCRATCH_ROOT_OXLINT_IGNORES, { recursive: true })
  const root = yield* fs.makeTempDirectoryScoped({ directory: SCRATCH_ROOT_OXLINT_IGNORES, prefix: 'scratch-' })
  const dir = path.join(root, 'project')
  yield* fs.copy(PROJECT, dir)
  yield* writeFile(`${dir}/transition-diagram.config.ts`, CONFIG_SOURCE)
  return dir
})

const brokenProject = Effect.gen(function*() {
  const fs = yield* Effect.service(FileSystem.FileSystem)
  yield* fs.makeDirectory(SCRATCH_ROOT_OXLINT_IGNORES, { recursive: true })
  const root = yield* fs.makeTempDirectoryScoped({ directory: SCRATCH_ROOT_OXLINT_IGNORES, prefix: 'scratch-broken-' })
  yield* fs.copy(`${FIXTURES}/empty`, `${root}/empty`)
  yield* writeFile(`${root}/transition-diagram.config.ts`, BROKEN_CONFIG_SOURCE)
  return root
})

const builtScratch = Effect.gen(function*() {
  const dir = yield* scratchProject
  yield* build({ cwd: dir })
  return dir
})

const editArtifact = (dir: string, file: string, contents: string) => writeFile(`${dir}/out/${file}`, contents)

const removeArtifact = (dir: string, file: string) =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    yield* fs.remove(`${dir}/out/${file}`)
  })

const containsAll = (messages: ReadonlyArray<string>, needles: ReadonlyArray<string>): boolean =>
  Arr.every(needles, (needle) => Arr.some(messages, (message) => message.includes(needle)))

const entriesOf = (files: ReadonlyMap<string, string>): ReadonlyArray<string> =>
  [...files.entries()].map(([file, content]) => `${file}\u0000${content}`).sort()

const renderedEntries = (config: DiagramConfig) =>
  Effect.gen(function*() {
    const discovered = yield* discover({ cwd: PROJECT, config })
    const rendered = yield* renderDiscovered(discovered)
    return entriesOf(rendered.files)
  })

const readArtifact = (dir: string, prefix: string, suffix: string) =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const names = yield* fs.readDirectory(`${dir}/out`)
    const name = Option.getOrThrow(
      Arr.findFirst(names, (candidate) => candidate.startsWith(prefix) && candidate.endsWith(suffix)),
    )
    return yield* fs.readFileString(`${dir}/out/${name}`)
  })

Feature('Rendering discovered cell workflows as checked diagrams')
  .live('the fixture project on disk')
  .withScenarioLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'The committed fixture diagrams are current',
      Gherkin.Do.pipe(
        Given('the fixture project whose diagrams are checked in')('dir', () => Effect.succeed(PROJECT)),
        When('the check runs against it')('report', (state) => check({ cwd: state.dir })),
        Then('every committed artifact is present and current')((state, expect) =>
          expect({
            exitCode: state.report.exitCode,
            workflows: state.report.workflows,
            messages: state.report.messages,
          }).toEqual({ exitCode: 0, workflows: 2, messages: ['ok: 2 workflows, 7 files'] })
        ),
      ),
    )

    scenario(
      'The build reports the workflow and file counts',
      Gherkin.Do.pipe(
        Given('a scratch copy of the fixture project')('dir', () => scratchProject),
        When('the build runs against it')('report', (state) => build({ cwd: state.dir })),
        Then('the report counts the workflows and the files it wrote')((state, expect) =>
          expect({ exitCode: state.report.exitCode, workflows: state.report.workflows }).toEqual({
            exitCode: 0,
            workflows: 2,
          })
        ),
      ),
    )

    scenario(
      'A stale edit to a built artifact is named',
      Gherkin.Do.pipe(
        Given('a scratch copy of the fixture project built once')('dir', () => builtScratch),
        When('one artifact is edited without regenerating and check runs')(
          'report',
          (state) =>
            editArtifact(state.dir, 'index.md', 'edited by hand').pipe(Effect.andThen(check({ cwd: state.dir }))),
        ),
        Then('the check fails naming the stale artifact')((state, expect) =>
          expect({
            exitCode: state.report.exitCode,
            namesStale: containsAll(state.report.messages, ['index.md']),
          }).toEqual({ exitCode: 1, namesStale: true })
        ),
      ),
    )

    scenario(
      'An orphan artifact on disk fails the check',
      Gherkin.Do.pipe(
        Given('a scratch copy of the fixture project built once')('dir', () => builtScratch),
        When('an unexpected file is added and check runs')(
          'report',
          (state) =>
            editArtifact(state.dir, 'orphan.mmd', 'not generated').pipe(
              Effect.andThen(check({ cwd: state.dir })),
            ),
        ),
        Then('the check fails naming the orphan')((state, expect) =>
          expect({
            exitCode: state.report.exitCode,
            namesOrphan: containsAll(state.report.messages, ['orphan.mmd', 'orphan artifact']),
          }).toEqual({ exitCode: 1, namesOrphan: true })
        ),
      ),
    )

    scenario(
      'A missing artifact fails the check',
      Gherkin.Do.pipe(
        Given('a scratch copy of the fixture project built once')('dir', () => builtScratch),
        When('one generated artifact is deleted and check runs')(
          'report',
          (state) => removeArtifact(state.dir, 'index.md').pipe(Effect.andThen(check({ cwd: state.dir }))),
        ),
        Then('the check fails naming the missing artifact')((state, expect) =>
          expect({
            exitCode: state.report.exitCode,
            namesMissing: containsAll(state.report.messages, ['index.md', 'missing artifact']),
          }).toEqual({ exitCode: 1, namesMissing: true })
        ),
      ),
    )

    scenario(
      'A configured module exporting no workflow fails',
      Gherkin.Do.pipe(
        Given('a project whose only module exports no diagram')('dir', () => brokenProject),
        When('the build runs against it')('outcome', (state) => build({ cwd: state.dir }).pipe(Effect.flip)),
        Then('the failure is an unrecognized module naming the file')((state, expect) =>
          expect(state.outcome).toMatchObject({ _tag: 'UnrecognizedModuleError' })
        ),
      ),
    )

    scenario(
      'Two globs in either order discover the same diagrams byte for byte',
      Gherkin.Do.pipe(
        Given('the fixture project discovered through two module orders')('orders', () =>
          Effect.succeed({
            forward: { modules: MODULES, outDir: './out' } satisfies DiagramConfig,
            reverse: { modules: MODULES_REVERSED, outDir: './out' } satisfies DiagramConfig,
          })),
        When('both orders are discovered and rendered')('rendered', (state) =>
          Effect.gen(function*() {
            const forward = yield* renderedEntries(state.orders.forward)
            const reverse = yield* renderedEntries(state.orders.reverse)
            return { forward, reverse }
          })),
        Then('the rendered files are identical')((state, expect) =>
          expect(state.rendered.forward).toEqual(state.rendered.reverse)
        ),
      ),
    )

    scenario(
      'A workflow diagram declares its command and decision and draws decisions solid and errors dashed',
      Gherkin.Do.pipe(
        Given('a scratch copy of the fixture project built once')('dir', () => builtScratch),
        When('the rendered workflow source, its unicode text and its svg are read')(
          'read',
          (state) =>
            Effect.gen(function*() {
              const mmd = yield* readArtifact(state.dir, 'workflows-place-order', '.mmd')
              const unicode = yield* readArtifact(state.dir, 'workflows-place-order', '.txt')
              const svg = yield* readArtifact(state.dir, 'workflows-place-order', '.svg')
              return { mmd, unicode, svg }
            }),
        ),
        Then('the diagram is a flowchart with a labelled command node and the error edges dashed')((state, expect) =>
          expect({
            header: state.read.mmd.split('\n')[0],
            command: state.read.mmd.includes('cmd["placeOrder"]'),
            approved: state.read.mmd.includes('dec -->|"OrderApproved"|'),
            rejected: state.read.mmd.includes('dec -->|"OrderRejected"|'),
            outOfStock: state.read.mmd.includes('dec -.->|"OutOfStock"|'),
            approvedNotDashed: !state.read.mmd.includes('-.->|"OrderApproved"|'),
            unicodeRendered: state.read.unicode.length > 0,
            svgRendered: state.read.svg.startsWith('<svg'),
          }).toEqual({
            header: 'flowchart LR',
            command: true,
            approved: true,
            rejected: true,
            outOfStock: true,
            approvedNotDashed: true,
            unicodeRendered: true,
            svgRendered: true,
          })
        ),
      ),
    )
  })
