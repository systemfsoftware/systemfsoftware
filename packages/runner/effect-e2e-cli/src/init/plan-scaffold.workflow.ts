import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Bool from 'effect/Boolean'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const PlanScaffoldTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e-cli/PlanScaffold')

const MANIFEST = 'package.json'
const IGNORE_FILE = '.gitignore'
const SCRIPT = 'test:e2e'

/** A generated file, and whether a file already sits at its path in the suite root. */
export const TargetFile = Schema.Struct({ path: Schema.String, content: Schema.String, present: Schema.Boolean })
export type TargetFile = typeof TargetFile.Type

export const SuiteWrite = Schema.Struct({ path: Schema.String, content: Schema.String })
export type SuiteWrite = typeof SuiteWrite.Type

const Dependencies = Schema.Record(Schema.String, Schema.String)

export class PlanScaffold extends Schema.TaggedClass<PlanScaffold>()('PlanScaffold', {
  force: Schema.Boolean,
  files: Schema.Array(TargetFile),
  /** The suite root's `package.json` text, when it has one. */
  manifest: Schema.Option(Schema.String),
  /** The suite root's `.gitignore` text, when it has one. */
  ignore: Schema.Option(Schema.String),
  /** The name a `package.json` that `init` creates carries. */
  name: Schema.String,
  script: Schema.String,
  devDependencies: Dependencies,
  ignoredOutput: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = { force: 'app.e2e.init.force' } as const
}

export class ScaffoldPlanned extends Schema.TaggedClass<ScaffoldPlanned>()('ScaffoldPlanned', {
  writes: Schema.Array(SuiteWrite),
}) {
  readonly [PlanScaffoldTypeId] = PlanScaffoldTypeId
}

/** Files `init` would replace; without `--force` it writes nothing (requirements AC-1.4). */
export class ScaffoldRefused extends Schema.TaggedClass<ScaffoldRefused>()('ScaffoldRefused', {
  conflicts: Schema.NonEmptyArray(Schema.String),
}) {
  readonly [PlanScaffoldTypeId] = PlanScaffoldTypeId
}

/** The suite root's `package.json` cannot be merged into, so `init` writes nothing. */
export class ManifestUnreadable extends Schema.TaggedClass<ManifestUnreadable>()('ManifestUnreadable', {
  expected: Schema.String,
}) {
  readonly [PlanScaffoldTypeId] = PlanScaffoldTypeId
}

export const ScaffoldPlan = Schema.Union([ScaffoldPlanned, ScaffoldRefused, ManifestUnreadable])
export type ScaffoldPlan = typeof ScaffoldPlan.Type

const MissingIsEmpty = Dependencies.pipe(Schema.withDecodingDefaultKey(Effect.succeed({})))

const ManifestFields = Schema.Struct({ scripts: MissingIsEmpty, devDependencies: MissingIsEmpty })

interface Manifest {
  readonly raw: Schema.JsonObject
  readonly scripts: Readonly<Record<string, string>>
  readonly devDependencies: Readonly<Record<string, string>>
}

const unreadable = (expected: string) => (): ManifestUnreadable => new ManifestUnreadable({ expected })

const fieldsOf = (raw: Schema.JsonObject): Result.Result<Manifest, ManifestUnreadable> =>
  Schema.decodeResult(ManifestFields)(raw).pipe(
    Result.mapError(unreadable('string maps under scripts and devDependencies')),
    Result.map((fields) => ({ raw, ...fields })),
  )

const manifestOf = (text: string): Result.Result<Manifest, ManifestUnreadable> =>
  Schema.decodeResult(Schema.fromJsonString(Schema.JsonObject))(text).pipe(
    Result.mapError(unreadable('a JSON object')),
    Result.flatMap(fieldsOf),
  )

const createdManifest = (command: PlanScaffold): Manifest => ({
  raw: { name: command.name, private: true, type: 'module' },
  scripts: {},
  devDependencies: {},
})

const scriptConflicts = (command: PlanScaffold, manifest: Manifest): boolean =>
  Option.exists(Record.get(manifest.scripts, SCRIPT), (script) => script !== command.script)

const scriptsOf = (command: PlanScaffold, manifest: Manifest): Readonly<Record<string, string>> =>
  Bool.match(Bool.and(scriptConflicts(command, manifest), Bool.not(command.force)), {
    onFalse: () => ({ ...manifest.scripts, [SCRIPT]: command.script }),
    onTrue: () => manifest.scripts,
  })

const mergedManifestOf = (command: PlanScaffold, manifest: Manifest): Schema.JsonObject =>
  Object.fromEntries([
    ...Object.entries(manifest.raw),
    ['scripts', scriptsOf(command, manifest)],
    ['devDependencies', Record.union(manifest.devDependencies, command.devDependencies, (existing) => existing)],
  ])

const manifestWrites = (command: PlanScaffold, manifest: Manifest): ReadonlyArray<SuiteWrite> => {
  const merged = mergedManifestOf(command, manifest)
  return Bool.match(JSON.stringify(merged) === JSON.stringify(manifest.raw), {
    onFalse: () => [{ path: MANIFEST, content: `${JSON.stringify(merged, null, 2)}\n` }],
    onTrue: () => [],
  })
}

const ignores = (text: string, entry: string): boolean =>
  text.split(/\r?\n/u).some((line) => [entry, `/${entry}`, entry.replace(/\/$/u, '')].includes(line.trim()))

const separatorOf = (text: string): string =>
  Bool.match(Bool.or(text === '', text.endsWith('\n')), { onFalse: () => '\n', onTrue: () => '' })

const appendedIgnore = (command: PlanScaffold) => (text: string): ReadonlyArray<SuiteWrite> =>
  Bool.match(ignores(text, command.ignoredOutput), {
    onFalse: () => [{ path: IGNORE_FILE, content: `${text}${separatorOf(text)}${command.ignoredOutput}\n` }],
    onTrue: () => [],
  })

const ignoreWrites = (command: PlanScaffold): ReadonlyArray<SuiteWrite> =>
  Option.match(command.ignore, {
    onNone: () => [{ path: IGNORE_FILE, content: `${command.ignoredOutput}\n` }],
    onSome: appendedIgnore(command),
  })

const conflictsOf = (command: PlanScaffold, manifest: Manifest): ReadonlyArray<string> => [
  ...command.files.filter((file) => file.present).map((file) => file.path),
  ...Bool.match(scriptConflicts(command, manifest), { onFalse: () => [], onTrue: () => [MANIFEST] }),
]

const planned = (command: PlanScaffold, manifest: Manifest): ScaffoldPlan =>
  new ScaffoldPlanned({
    writes: [
      ...command.files.map(({ path, content }) => ({ path, content })),
      ...manifestWrites(command, manifest),
      ...ignoreWrites(command),
    ],
  })

const refusedOrPlanned = (command: PlanScaffold, manifest: Manifest): ScaffoldPlan =>
  Arr.match(conflictsOf(command, manifest), {
    onEmpty: () => planned(command, manifest),
    onNonEmpty: (conflicts): ScaffoldPlan => new ScaffoldRefused({ conflicts }),
  })

const decideWith = (command: PlanScaffold) => (manifest: Manifest): ScaffoldPlan =>
  Bool.match(command.force, {
    onFalse: () => refusedOrPlanned(command, manifest),
    onTrue: () => planned(command, manifest),
  })

const manifestFor = (command: PlanScaffold): Result.Result<Manifest, ManifestUnreadable> =>
  Option.match(command.manifest, { onNone: () => Result.succeed(createdManifest(command)), onSome: manifestOf })

const decide = (command: PlanScaffold): Result.Result<ScaffoldPlan, never> =>
  Result.succeed(
    Result.match(manifestFor(command), {
      onFailure: (refusal): ScaffoldPlan => refusal,
      onSuccess: decideWith(command),
    }),
  )

/**
 * Decides what `init` writes into a suite root (design §15.1): every generated file, plus `package.json` and
 * `.gitignore` merged in place, or a refusal naming each file that already exists unless `--force` replaces them.
 */
export const planScaffold = Workflow.make({
  command: PlanScaffold,
  decision: ScaffoldPlan,
  error: Schema.Never,
  decide,
})
