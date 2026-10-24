import { Effect, Option, Result, Schema } from 'effect'

export const Layer = Schema.Literals(['core', 'harness', 'spec-trace', 'extracted', 'frontend'])

export type Layer = typeof Layer.Type

export const HostedLayer = Schema.Literals(['core', 'harness', 'spec-trace'])

export type HostedLayer = typeof HostedLayer.Type

const Names = Schema.Array(Schema.String)

export const LayerMap = Schema.Struct({
  'core': Names,
  'harness': Names,
  'spec-trace': Names,
  'extracted': Names,
  'frontend': Names,
})

export type LayerMap = typeof LayerMap.Type

const decodeMapResult = Schema.decodeUnknownResult(LayerMap)

export type LayerMapAcceptance = Result.Result<LayerMap, Schema.SchemaError>

/** Whether a document is a layer map: the five layer keys, decoded strictly, with no other key. */
export const acceptsLayerDoc = (doc: Readonly<Record<string, readonly string[]>>): LayerMapAcceptance =>
  decodeMapResult(doc, { onExcessProperty: 'error' })

const Deps = Schema.Record(Schema.String, Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed({})))

const PeerMeta = Schema.Record(
  Schema.String,
  Schema.Struct({ optional: Schema.optionalKey(Schema.Boolean) }),
).pipe(Schema.withDecodingDefaultKey(Effect.succeed({})))

export const ManifestDoc = Schema.Struct({
  name: Schema.String,
  dependencies: Deps,
  optionalDependencies: Deps,
  peerDependencies: Deps,
  devDependencies: Deps,
  peerDependenciesMeta: PeerMeta,
})

export type ManifestDoc = typeof ManifestDoc.Type

export const EdgeField = Schema.Literals(['dependencies', 'optionalDependencies', 'peerDependencies'])

export type EdgeField = typeof EdgeField.Type

export const ManifestRefused = Schema.TaggedStruct('ManifestRefused', { path: Schema.String, reason: Schema.String })

export const MapRefused = Schema.TaggedStruct('MapRefused', { path: Schema.String, reason: Schema.String })

export const DuplicateName = Schema.TaggedStruct('DuplicateName', {
  name: Schema.String,
  layers: Schema.Tuple([Layer, Layer]),
})

export const DuplicateManifest = Schema.TaggedStruct('DuplicateManifest', {
  name: Schema.String,
  paths: Schema.Tuple([Schema.String, Schema.String]),
})

export const MissingPackage = Schema.TaggedStruct('MissingPackage', { name: Schema.String, layer: Layer })

export const UnmappedPackage = Schema.TaggedStruct('UnmappedPackage', { name: Schema.String, path: Schema.String })

export const SchemaLawVitest = Schema.TaggedStruct('SchemaLawVitest', {
  rule: Schema.Literals(['fork', 'fork-alias', 'required']),
  field: EdgeField,
})

export const ForbiddenEdge = Schema.TaggedStruct('ForbiddenEdge', {
  fromLayer: Layer,
  toLayer: Layer,
  path: Schema.Array(Schema.String),
  fields: Schema.Array(EdgeField),
})

export const Finding = Schema.Union([
  ManifestRefused,
  DuplicateName,
  DuplicateManifest,
  MissingPackage,
  UnmappedPackage,
  SchemaLawVitest,
  ForbiddenEdge,
  MapRefused,
])

export type ManifestRefused = typeof ManifestRefused.Type
export type MapRefused = typeof MapRefused.Type
export type DuplicateName = typeof DuplicateName.Type
export type DuplicateManifest = typeof DuplicateManifest.Type
export type MissingPackage = typeof MissingPackage.Type
export type UnmappedPackage = typeof UnmappedPackage.Type
export type SchemaLawVitest = typeof SchemaLawVitest.Type
export type ForbiddenEdge = typeof ForbiddenEdge.Type
export type Finding = typeof Finding.Type
export class LayersRefused extends Schema.TaggedError<LayersRefused>()('LayersRefused', {
  findings: Schema.Array(Finding),
}) {
  override get message(): string {
    return `${this.findings.length} layer findings`
  }
}

export interface Edge {
  readonly key: string
  readonly to: string
  readonly field: EdgeField
}

export interface Manifest {
  readonly path: string
  readonly name: string
  readonly packed: readonly Edge[]
  readonly dev: readonly string[]
  readonly optionalPeers: ReadonlySet<string>
}

const NPM_ALIAS = /^npm:(@?[^@]+)/

const aliasTarget = (specifier: string): Option.Option<string> =>
  Option.fromNullishOr(NPM_ALIAS.exec(specifier)).pipe(Option.flatMap((match) => Option.fromUndefinedOr(match[1])))

const installed = (key: string, specifier: string): string => Option.getOrElse(aliasTarget(specifier), () => key)

const edges = (record: Readonly<Record<string, string>>, field: EdgeField): readonly Edge[] =>
  Object.entries(record).map(([key, specifier]) => ({ key, to: installed(key, specifier), field }))

export interface ManifestFile {
  readonly path: string
  readonly doc: ManifestDoc
}

export const toManifest = ({ path, doc }: ManifestFile): Manifest => ({
  path,
  name: doc.name,
  packed: [
    ...edges(doc.dependencies, 'dependencies'),
    ...edges(doc.optionalDependencies, 'optionalDependencies'),
    ...edges(doc.peerDependencies, 'peerDependencies'),
  ],
  dev: Object.entries(doc.devDependencies).map(([key, specifier]) => installed(key, specifier)),
  optionalPeers: new Set(
    Object.entries(doc.peerDependenciesMeta).filter(([, meta]) => meta.optional === true).map(([name]) => name),
  ),
})

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static import
  // would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  const LayerDoc = Schema.Record(Schema.String, Schema.Array(Schema.String))

  // Independent of LayerMap's struct: a document is a layer map exactly when its keys are the five
  // layer names and nothing else.
  const LAYER_KEYS = ['core', 'harness', 'spec-trace', 'extracted', 'frontend'] as const

  const isLayerDoc = (doc: Readonly<Record<string, readonly string[]>>): boolean =>
    Object.keys(doc).length === LAYER_KEYS.length && LAYER_KEYS.every((key) => key in doc)

  const agrees = (
    subject: typeof acceptsLayerDoc,
    doc: Readonly<Record<string, readonly string[]>>,
  ): boolean => Result.isSuccess(subject(doc)) === isLayerDoc(doc)

  const BOUNDARY_CASES: readonly (readonly [
    Readonly<Record<string, readonly string[]>>,
    boolean,
  ])[] = [
    [{}, false],
    [{ 'core': [], 'harness': [], 'spec-trace': [], 'extracted': [], 'frontend': [] }, true],
    [{ 'core': [], 'harness': [], 'spec-trace': [], 'extracted': [], 'frontend': [], 'tooling': [] }, false],
  ]

  const baseCasesHold = (subject: typeof acceptsLayerDoc): boolean =>
    BOUNDARY_CASES.every(([doc, expected]) => Result.isSuccess(subject(doc)) === expected)

  it.prop(
    '∀m_LayerDoc_⊨KeySet',
    { of: [LayerDoc], subject: acceptsLayerDoc },
    (accepts, [doc]) => agrees(accepts, doc) && baseCasesHold(accepts),
  )
}
