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
const SCRATCH = `${FIXTURES}/.scratch`
const SCRATCH_BROKEN = `${FIXTURES}/.scratch-broken`

const MODULES = ['./machines/*.machine.ts', './workflows/*.workflow.ts'] as const
const MODULES_REVERSED = ['./workflows/*.workflow.ts', './machines/*.machine.ts'] as const

const CONFIG_SOURCE = `export default {\n  modules: ${JSON.stringify(MODULES)},\n  outDir: './out',\n}\n`
const BROKEN_CONFIG_SOURCE = `export default {\n  modules: ['./empty/*.module.ts'],\n  outDir: './out',\n}\n`

const ORDER_WITH_EXTRA_STATE = `import { setup } from 'xstate'

export const orderMachine = setup({
  guards: {
    hasStock: () => true,
    isPaid: () => true,
  },
}).createMachine({
  id: 'order',
  initial: 'idle',
  states: {
    idle: { on: { SUBMIT: { target: 'reserved', guard: 'hasStock' } } },
    reserved: {
      on: {
        PAY: { target: 'paid', guard: 'isPaid' },
        CANCEL: { target: 'cancelled' },
      },
    },
    paid: { type: 'final' },
    cancelled: { type: 'final' },
    onHold: { on: { RESUME: { target: 'idle' } } },
  },
})
`

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

const resetDirectory = (
  dir: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    yield* fs.remove(dir, { recursive: true, force: true })
  })

const scratchProject = Effect.gen(function*() {
  const fs = yield* Effect.service(FileSystem.FileSystem)
  yield* resetDirectory(SCRATCH)
  yield* fs.copy(PROJECT, SCRATCH)
  yield* writeFile(`${SCRATCH}/transition-diagram.config.ts`, CONFIG_SOURCE)
  return SCRATCH
})

const brokenProject = Effect.gen(function*() {
  const fs = yield* Effect.service(FileSystem.FileSystem)
  yield* resetDirectory(SCRATCH_BROKEN)
  yield* fs.copy(`${FIXTURES}/empty`, `${SCRATCH_BROKEN}/empty`)
  yield* writeFile(`${SCRATCH_BROKEN}/transition-diagram.config.ts`, BROKEN_CONFIG_SOURCE)
  return SCRATCH_BROKEN
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

const lineCount = (text: string, line: string): number =>
  text.split('\n').filter((candidate) => candidate === line).length

const transitionCount = (text: string): number =>
  text.split('\n').filter((line) => line.includes(' --> ') && !line.includes('[*]')).length

Feature('Rendering discovered machines and workflows as checked diagrams')
  .live('the fixture project on disk')
  .withScenarioLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'The committed fixture diagrams are current',
      Gherkin.Do.pipe(
        Given('the fixture project whose diagrams are checked in')('dir', () => Effect.succeed(PROJECT)),
        When('the check runs against it')('report', (state) => check({ cwd: state.dir })),
        Then('every committed artifact is present and current')((state, expect) =>
          expect(state.report.exitCode).toBe(0)
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
      'A machine that gains a state is named stale',
      Gherkin.Do.pipe(
        Given('a scratch copy of the fixture project built once')('dir', () => builtScratch),
        When('the order machine gains a state and check runs')(
          'report',
          (state) =>
            writeFile(`${state.dir}/machines/order.machine.ts`, ORDER_WITH_EXTRA_STATE).pipe(
              Effect.andThen(check({ cwd: state.dir })),
            ),
        ),
        Then('the check fails naming the stale machine artifact')((state, expect) =>
          expect({
            exitCode: state.report.exitCode,
            namesStale: containsAll(state.report.messages, ['machines-order', 'stale artifact']),
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
      'A configured module exporting neither a machine nor a workflow fails',
      Gherkin.Do.pipe(
        Given('a project whose only module exports no diagram')('dir', () => brokenProject),
        When('the build runs against it')('outcome', (state) => build({ cwd: state.dir }).pipe(Effect.flip)),
        Then('the failure is an unrecognized module naming the file')((state, expect) =>
          expect(state.outcome).toMatchObject({ _tag: 'UnrecognizedModuleError' })
        ),
      ),
    )

    scenario(
      'Shuffling the module order yields identical bytes',
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
      'A machine diagram lists each transition once and marks the initial and final states',
      Gherkin.Do.pipe(
        Given('a scratch copy of the fixture project built once')('dir', () => builtScratch),
        When('the rendered machine, its unicode text and the metacharacter machine are read')(
          'read',
          (state) =>
            Effect.gen(function*() {
              const text = yield* readArtifact(state.dir, 'machines-order', '.mmd')
              const unicode = yield* readArtifact(state.dir, 'machines-order', '.txt')
              const weirdSvg = yield* readArtifact(state.dir, 'machines-weird', '.svg')
              return { text, unicode, weirdSvg }
            }),
        ),
        Then('every edge appears exactly once, the initial and finals are marked, and the weird names rendered')((
          state,
          expect,
        ) =>
          expect({
            submit: lineCount(state.read.text, 'idle --> reserved: SUBMIT [hasStock]'),
            pay: lineCount(state.read.text, 'reserved --> paid: PAY [isPaid]'),
            cancel: lineCount(state.read.text, 'reserved --> cancelled: CANCEL'),
            initial: lineCount(state.read.text, '[*] --> idle'),
            paidFinal: lineCount(state.read.text, 'paid --> [*]'),
            cancelledFinal: lineCount(state.read.text, 'cancelled --> [*]'),
            transitions: transitionCount(state.read.text),
            unicodeRendered: state.read.unicode.length > 0,
            weirdRendered: state.read.weirdSvg.startsWith('<svg'),
          }).toEqual({
            submit: 1,
            pay: 1,
            cancel: 1,
            initial: 1,
            paidFinal: 1,
            cancelledFinal: 1,
            transitions: 3,
            unicodeRendered: true,
            weirdRendered: true,
          })
        ),
      ),
    )

    scenario(
      'A workflow diagram draws decision variants solid and error variants dashed',
      Gherkin.Do.pipe(
        Given('a scratch copy of the fixture project built once')('dir', () => builtScratch),
        When('the rendered workflow source is read')(
          'text',
          (state) => readArtifact(state.dir, 'workflows-place-order', '.mmd'),
        ),
        Then('the decisions are solid edges and the errors are dashed edges')((state, expect) =>
          expect({
            approved: state.text.includes('dec -->|"OrderApproved"|'),
            rejected: state.text.includes('dec -->|"OrderRejected"|'),
            outOfStock: state.text.includes('dec -.->|"OutOfStock"|'),
            paymentFailed: state.text.includes('dec -.->|"PaymentFailed"|'),
            approvedNotDashed: !state.text.includes('-.->|"OrderApproved"|'),
          }).toEqual({
            approved: true,
            rejected: true,
            outOfStock: true,
            paymentFailed: true,
            approvedNotDashed: true,
          })
        ),
      ),
    )
  })
