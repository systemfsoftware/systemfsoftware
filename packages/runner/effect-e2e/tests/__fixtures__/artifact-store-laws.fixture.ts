import * as NodeServices from '@effect/platform-node/NodeServices'
import {
  type Artifact,
  type ArtifactStoreShape,
  FileArtifactStore,
  fileNameOf,
  MemoryArtifactStore,
  ResultDirectory,
} from '@systemfsoftware/effect-e2e/run'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import { Hex } from 'effect/encoding'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type * as Scope from 'effect/Scope'

export interface OpenedArtifacts {
  readonly store: ArtifactStoreShape
  readonly read: (path: string) => Effect.Effect<Option.Option<Uint8Array>>
}

export interface StoreSubject {
  readonly name: string
  readonly open: Effect.Effect<OpenedArtifacts, never, Scope.Scope>
}

export interface LawVerdict {
  readonly law: string
  readonly expected: string
  readonly observed: string
}

interface Law {
  readonly name: string
  readonly run: (
    open: StoreSubject['open'],
  ) => Effect.Effect<
    { readonly expected: ReadonlyArray<string>; readonly observed: ReadonlyArray<string> },
    never,
    Scope.Scope
  >
}

const OUTPUT = '.e2e'
const ABSENT = '<absent>'

const PROFILE_DIRECTORY = ResultDirectory.make('saves-the-profile-0a1b2c3d')
const TITLE_DIRECTORY = ResultDirectory.make('checks-the-title-1a2b3c4d')

const PROFILE_SCREENSHOT_PATH = '.e2e/results/saves-the-profile-0a1b2c3d/screen.png'
const PROFILE_SCREEN_TEXT_PATH = '.e2e/results/saves-the-profile-0a1b2c3d/screen.txt'
const PROFILE_TRACE_PATH = '.e2e/results/saves-the-profile-0a1b2c3d/trace.md'
const TITLE_AI_TRACE_PATH = '.e2e/results/checks-the-title-1a2b3c4d/ai-trace.json'

const SCREENSHOT_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52,
])
const FIRST_PUT_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03])
const SECOND_PUT_BYTES = new Uint8Array([0x04, 0x05, 0x06, 0x07])
const MASKED_SCREEN_BYTES = new Uint8Array([
  0x6d,
  0x61,
  0x73,
  0x6b,
  0x65,
  0x64,
  0x2d,
  0x73,
  0x63,
  0x72,
  0x65,
  0x65,
  0x6e,
])
const TRACE_PAGE_BYTES = new Uint8Array([0x23, 0x20, 0x74, 0x72, 0x61, 0x63, 0x65])
const AI_TRACE_BYTES = new Uint8Array([0x7b, 0x22, 0x73, 0x74, 0x65, 0x70, 0x73, 0x22, 0x3a, 0x31, 0x7d])

export const SCREENSHOT_ARTIFACT: Artifact = {
  directory: PROFILE_DIRECTORY,
  kind: 'screenshot',
  bytes: SCREENSHOT_BYTES,
}
export const SCREENSHOT_PATH = PROFILE_SCREENSHOT_PATH

const PROFILE_SCREENSHOT_ANSWER = `put answered screenshot at ${PROFILE_SCREENSHOT_PATH}`

const NO_COLLISION_ANSWERS: ReadonlyArray<string> = [
  `put answered screenshot at ${PROFILE_SCREENSHOT_PATH}`,
  `put answered screen-text at ${PROFILE_SCREEN_TEXT_PATH}`,
  `put answered trace-page at ${PROFILE_TRACE_PATH}`,
  `put answered ai-trace at ${TITLE_AI_TRACE_PATH}`,
]

const hexOf = (bytes: Uint8Array): string => Hex.encode(bytes)

const labelOf = (read: Option.Option<Uint8Array>): string => Option.match(read, { onNone: () => ABSENT, onSome: hexOf })

const answeredLabel = (store: ArtifactStoreShape, artifact: Artifact): Effect.Effect<string> =>
  Effect.match(store.put(artifact), {
    onFailure: (failure) => `put failed ${failure._tag}`,
    onSuccess: (ref) => `put answered ${ref.kind} at ${ref.path}`,
  })

const NO_COLLISION_ARTIFACTS: ReadonlyArray<Artifact> = [
  SCREENSHOT_ARTIFACT,
  { directory: PROFILE_DIRECTORY, kind: 'screen-text', bytes: MASKED_SCREEN_BYTES },
  { directory: PROFILE_DIRECTORY, kind: 'trace-page', bytes: TRACE_PAGE_BYTES },
  { directory: TITLE_DIRECTORY, kind: 'ai-trace', bytes: AI_TRACE_BYTES },
]

const NO_COLLISION_PATHS: ReadonlyArray<string> = [
  PROFILE_SCREENSHOT_PATH,
  PROFILE_SCREEN_TEXT_PATH,
  PROFILE_TRACE_PATH,
  TITLE_AI_TRACE_PATH,
]

const NO_COLLISION_HEXES: ReadonlyArray<string> = [
  hexOf(SCREENSHOT_BYTES),
  hexOf(MASKED_SCREEN_BYTES),
  hexOf(TRACE_PAGE_BYTES),
  hexOf(AI_TRACE_BYTES),
]

const laws: ReadonlyArray<Law> = [
  {
    name: 'put-answers-path',
    run: (open) =>
      Effect.gen(function*() {
        const { store, read } = yield* open
        const answered = yield* answeredLabel(store, SCREENSHOT_ARTIFACT)
        const readBack = yield* read(PROFILE_SCREENSHOT_PATH)
        return {
          expected: [PROFILE_SCREENSHOT_ANSWER, hexOf(SCREENSHOT_BYTES)],
          observed: [answered, labelOf(readBack)],
        }
      }),
  },
  {
    name: 'last-put-wins',
    run: (open) =>
      Effect.gen(function*() {
        const { store, read } = yield* open
        const first = yield* answeredLabel(store, {
          directory: PROFILE_DIRECTORY,
          kind: 'screenshot',
          bytes: FIRST_PUT_BYTES,
        })
        const second = yield* answeredLabel(store, {
          directory: PROFILE_DIRECTORY,
          kind: 'screenshot',
          bytes: SECOND_PUT_BYTES,
        })
        const readBack = yield* read(PROFILE_SCREENSHOT_PATH)
        return {
          expected: [PROFILE_SCREENSHOT_ANSWER, PROFILE_SCREENSHOT_ANSWER, hexOf(SECOND_PUT_BYTES)],
          observed: [first, second, labelOf(readBack)],
        }
      }),
  },
  {
    name: 'no-collision',
    run: (open) =>
      Effect.gen(function*() {
        const { store, read } = yield* open
        const answers = yield* Effect.forEach(NO_COLLISION_ARTIFACTS, (artifact) => answeredLabel(store, artifact))
        const readBack = yield* Effect.forEach(NO_COLLISION_PATHS, (at) => read(at))
        return {
          expected: [...NO_COLLISION_ANSWERS, ...NO_COLLISION_HEXES],
          observed: [...answers, ...readBack.map(labelOf)],
        }
      }),
  },
]

export const LAW_NAMES: ReadonlyArray<string> = laws.map((law) => law.name)

const verdictOf = (subject: StoreSubject) => (law: Law): Effect.Effect<LawVerdict> =>
  Effect.scoped(law.run(subject.open)).pipe(
    Effect.map(({ expected, observed }) => ({
      law: law.name,
      expected: JSON.stringify(expected),
      observed: JSON.stringify(observed),
    })),
    Effect.catchCause((cause) =>
      Effect.succeed({ law: law.name, expected: 'the law to run without a defect', observed: Cause.pretty(cause) })
    ),
  )

export const proveArtifactStore = (subject: StoreSubject): Effect.Effect<ReadonlyArray<LawVerdict>> =>
  Effect.forEach(laws, verdictOf(subject))

export const brokenLawsOf = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.filter((verdict) => verdict.expected !== verdict.observed).map((verdict) => verdict.law)

export const memorySubject: StoreSubject = {
  name: 'memory',
  open: Effect.map(MemoryArtifactStore.make({ output: OUTPUT }), (store) => ({ store, read: store.read })),
}

const fileRead =
  (fs: FileSystem.FileSystem, path: Path.Path, root: string) =>
  (at: string): Effect.Effect<Option.Option<Uint8Array>> =>
    fs.readFile(path.join(root, at)).pipe(
      Effect.map(Option.some<Uint8Array>),
      Effect.catchTag('PlatformError', (error) =>
        Match.value(error.reason).pipe(
          Match.when({ _tag: 'NotFound' }, () => Effect.succeed(Option.none<Uint8Array>())),
          Match.orElse(() => Effect.die(error)),
        )),
    )

export const fileSubject: StoreSubject = {
  name: 'file',
  open: Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fs.makeTempDirectoryScoped({ prefix: 'effect-e2e-artifacts-' })
    const store = yield* FileArtifactStore.make({ root, output: OUTPUT })
    return { store, read: fileRead(fs, path, root) }
  }).pipe(Effect.orDie, Effect.provide(NodeServices.layer)),
}

const pathOf = (artifact: Artifact): string =>
  [OUTPUT, 'results', artifact.directory, fileNameOf(artifact.kind)].join('/')

type ReadableStore = OpenedArtifacts['store'] & {
  readonly read: (path: string) => Effect.Effect<Option.Option<Uint8Array>>
}

type Breakage = (good: ReadableStore) => Effect.Effect<OpenedArtifacts>

const breakages = {
  'drops-writes': (good): Effect.Effect<OpenedArtifacts> =>
    Effect.succeed({
      store: { put: (artifact) => Effect.succeed({ kind: artifact.kind, path: pathOf(artifact) }) },
      read: good.read,
    }),
  'keeps-first': (good): Effect.Effect<OpenedArtifacts> =>
    Effect.succeed({
      store: {
        put: (artifact) =>
          Effect.flatMap(good.read(pathOf(artifact)), (existing) =>
            Option.match(existing, {
              onNone: () => good.put(artifact),
              onSome: () => Effect.succeed({ kind: artifact.kind, path: pathOf(artifact) }),
            })),
      },
      read: good.read,
    }),
  'one-file': (good): Effect.Effect<OpenedArtifacts> =>
    Effect.succeed({
      store: {
        put: (artifact) =>
          Effect.as(good.put({ ...artifact, kind: 'screenshot' }), {
            kind: artifact.kind,
            path: pathOf(artifact),
          }),
      },
      read: good.read,
    }),
} as const satisfies Record<string, Breakage>

export type BrokenStore = keyof typeof breakages

export const brokenSubject = (broken: BrokenStore): StoreSubject => ({
  name: `memory store that ${broken}`,
  open: Effect.flatMap(MemoryArtifactStore.make({ output: OUTPUT }), (good) => breakages[broken](good)),
})
