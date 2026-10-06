import { Option, Schema } from 'effect'
import { dual } from 'effect/Function'

const InPlaceRecord = Schema.Struct({
  subtree: Schema.String,
  commit: Schema.String,
  files: Schema.Array(Schema.String),
})

const UpstreamManifest = Schema.Struct({
  inPlace: Schema.Array(InPlaceRecord),
})

export type InPlaceRecord = typeof InPlaceRecord.Type

/** The in-place records of `upstream-tests.json`, in the shape `@systemfsoftware/upstream-manifest` grades. */
export const decodeInPlace = (text: string): Option.Option<ReadonlyArray<InPlaceRecord>> =>
  Schema.decodeOption(Schema.fromJsonString(UpstreamManifest))(text).pipe(
    Option.map((manifest) => manifest.inPlace),
  )

/** A vendored scenario module: what it exports, keyed by export name, as `import.meta.glob` yields it. */
export type ScenarioModule = Readonly<Record<string, object>>

const exportsClass = (module: ScenarioModule, scenarioClass: object): boolean =>
  Object.values(module).includes(scenarioClass)

/**
 * The subtree path of the in-place file whose module exports the class a registered
 * scenario was built from. `modules` is keyed by `<subtree>/<file>`; only recorded
 * files are searched, so a scenario defined outside every record has no file.
 */
export const fileDefining = dual<
  (scenarioClass: object) => (modules: ReadonlyMap<string, ScenarioModule>) => Option.Option<string>,
  (modules: ReadonlyMap<string, ScenarioModule>, scenarioClass: object) => Option.Option<string>
>(
  2,
  (modules, scenarioClass) =>
    Option.fromNullishOr([...modules].find(([, module]) => exportsClass(module, scenarioClass))?.[0]),
)
