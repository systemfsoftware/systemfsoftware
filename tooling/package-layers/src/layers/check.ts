import { Array as Arr, Match, Option, Result, Schema } from 'effect'
import {
  DuplicateManifest,
  DuplicateName,
  type Edge,
  EdgeField,
  Finding,
  ForbiddenEdge,
  HostedLayer,
  Layer,
  type LayerMap,
  type Manifest,
  ManifestDoc,
  type ManifestRefused,
  MissingPackage,
  SchemaLawPeer,
  toManifest,
  UnmappedPackage,
} from './layers.schema.ts'

interface LayerRow {
  readonly layer: Layer
  readonly names: readonly string[]
  readonly absent: readonly string[]
}

interface DevEdge {
  readonly from: string
  readonly fromLayer: Layer
  readonly to: string
  readonly toLayer: Layer
}

export interface Decision {
  readonly findings: readonly Finding[]
  readonly table: readonly LayerRow[]
  readonly devEdges: readonly DevEdge[]
  readonly present: number
}

interface CheckInput {
  readonly map: LayerMap
  readonly manifests: readonly Manifest[]
  readonly refused: readonly ManifestRefused[]
}

const isHosted = Schema.is(HostedLayer)

const FORBIDDEN: Record<Layer, readonly Layer[]> = {
  'core': ['harness', 'spec-trace', 'extracted', 'frontend'],
  'harness': ['core', 'spec-trace', 'extracted'],
  'spec-trace': ['extracted'],
  'extracted': [],
  'frontend': [],
}

const ORDER: Record<Finding['_tag'], number> = {
  MapRefused: 0,
  ManifestRefused: 1,
  DuplicateName: 2,
  DuplicateManifest: 3,
  MissingPackage: 4,
  UnmappedPackage: 5,
  SchemaLawPeer: 6,
  ForbiddenEdge: 7,
}

export const SCHEMA_LAW = '@systemfsoftware/effect-schema-law'
export const VITEST_FORK = '@systemfsoftware/vitest'
const VITEST = 'vitest'

const SCHEMA_LAW_RULES: readonly {
  readonly peer: SchemaLawPeer['peer']
  readonly breaks: (edge: Edge, manifest: Manifest) => boolean
}[] = [
  { peer: 'fork', breaks: (edge) => edge.key === VITEST_FORK },
  { peer: 'fork-alias', breaks: (edge) => edge.key === VITEST && edge.to === VITEST_FORK },
  { peer: 'required', breaks: (edge, manifest) => edge.key === VITEST && !manifest.optionalPeers.has(VITEST) },
]

interface Listing {
  readonly name: string
  readonly layer: Layer
}

interface MappedEdge extends Edge {
  readonly toLayer: Layer
}

interface Trail {
  readonly to: string
  readonly toLayer: Layer
  readonly path: readonly string[]
  readonly fields: readonly EdgeField[]
}

type EdgesOf = (name: string) => readonly MappedEdge[]

const compare = (a: string, b: string): number => Number(a > b) - Number(a < b)

const listings = (map: LayerMap): readonly Listing[] =>
  Layer.literals.flatMap((layer) => map[layer].map((name) => ({ name, layer })))

const repeats = <A extends { readonly name: string }>(items: readonly A[]): readonly (readonly [A, A])[] =>
  Object.values(Arr.groupBy(items, (item) => item.name)).flatMap(([first, ...again]) =>
    again.map((item) => [first, item] as const)
  )

const firstByName = <A extends { readonly name: string }, B>(
  items: readonly A[],
  value: (item: A) => B,
): Map<string, B> => new Map(items.toReversed().map((item) => [item.name, value(item)]))

const lookup = <A>(map: ReadonlyMap<string, A>, key: string): Option.Option<A> => Option.fromUndefinedOr(map.get(key))

const schemaLawFindings = (manifest: Manifest): readonly SchemaLawPeer[] =>
  manifest.packed
    .filter((edge) => edge.field === 'peerDependencies')
    .flatMap((edge) =>
      SCHEMA_LAW_RULES.filter((rule) => rule.breaks(edge, manifest)).map((rule) =>
        SchemaLawPeer.make({ peer: rule.peer })
      )
    )

const freshSteps = (steps: readonly Trail[], reached: ReadonlySet<string>): readonly Trail[] =>
  Arr.dedupeWith(steps.filter((step) => !reached.has(step.to)), (a, b) => a.to === b.to)

const coreWalk = (edgesOf: EdgesOf, frontier: readonly Trail[], reached: ReadonlySet<string>): readonly Trail[] => {
  const steps = frontier.flatMap((trail) =>
    edgesOf(trail.to).map((edge) => ({
      to: edge.to,
      toLayer: edge.toLayer,
      path: [...trail.path, edge.to],
      fields: [...trail.fields, edge.field],
    }))
  )
  const fresh = freshSteps(steps, reached)
  const next = fresh.filter((step) => step.toLayer === 'core')
  const left = fresh.filter((step) => step.toLayer !== 'core')
  return next.length === 0
    ? left
    : [...left, ...coreWalk(edgesOf, next, new Set([...reached, ...fresh.map((step) => step.to)]))]
}

const coreReach = (source: string, edgesOf: EdgesOf): readonly ForbiddenEdge[] =>
  coreWalk(edgesOf, [{ to: source, toLayer: 'core', path: [source], fields: [] }], new Set([source]))
    .filter((trail) => FORBIDDEN.core.includes(trail.toLayer))
    .map((trail) =>
      ForbiddenEdge.make({ fromLayer: 'core', toLayer: trail.toLayer, path: trail.path, fields: trail.fields })
    )

const directReach = (source: string, sourceLayer: Layer, edgesOf: EdgesOf): readonly ForbiddenEdge[] =>
  edgesOf(source)
    .filter((edge) => FORBIDDEN[sourceLayer].includes(edge.toLayer))
    .map((edge) =>
      ForbiddenEdge.make({
        fromLayer: sourceLayer,
        toLayer: edge.toLayer,
        path: [source, edge.to],
        fields: [edge.field],
      })
    )

const reachFindings = (source: string, sourceLayer: Layer, edgesOf: EdgesOf): readonly ForbiddenEdge[] =>
  sourceLayer === 'core' ? coreReach(source, edgesOf) : directReach(source, sourceLayer, edgesOf)

const findingKey = (finding: Finding): string =>
  Match.valueTags(finding, {
    MapRefused: (f) => f.path,
    ManifestRefused: (f) => f.path,
    DuplicateName: (f) => [f.name, ...f.layers].join('\0'),
    DuplicateManifest: (f) => [f.name, ...f.paths].join('\0'),
    MissingPackage: (f) => `${f.layer}\0${f.name}`,
    UnmappedPackage: (f) => f.path,
    SchemaLawPeer: (f) => f.peer,
    ForbiddenEdge: (f) => f.path.join('\0'),
  })

const byOrder = (a: Finding, b: Finding): number =>
  ORDER[a._tag] - ORDER[b._tag] || compare(findingKey(a), findingKey(b))

export const decide = ({ map, manifests, refused }: CheckInput): Decision => {
  const listed = listings(map)
  const layerOf = firstByName(listed, (listing) => listing.layer)
  const manifestOf = firstByName(manifests, (manifest) => manifest)
  const mapped = (edge: Edge): readonly MappedEdge[] =>
    Option.toArray(lookup(layerOf, edge.to)).map((toLayer) => ({ ...edge, toLayer }))
  const edgesOf: EdgesOf = (name) =>
    Option.match(lookup(manifestOf, name), {
      onNone: () => [],
      onSome: (manifest) => manifest.packed.flatMap(mapped),
    })

  const findings: readonly Finding[] = [
    ...refused,
    ...repeats(listed).map(([first, again]) =>
      DuplicateName.make({ name: again.name, layers: [first.layer, again.layer] })
    ),
    ...repeats(manifests).map(([first, again]) =>
      DuplicateManifest.make({ name: again.name, paths: [first.path, again.path] })
    ),
    ...[...layerOf]
      .filter(([name, layer]) => isHosted(layer) && !manifestOf.has(name))
      .map(([name, layer]) => MissingPackage.make({ name, layer })),
    ...manifests
      .filter((manifest) => !layerOf.has(manifest.name))
      .map((manifest) => UnmappedPackage.make({ name: manifest.name, path: manifest.path })),
    ...Option.toArray(lookup(manifestOf, SCHEMA_LAW)).flatMap(schemaLawFindings),
    ...[...layerOf].flatMap(([source, layer]) => reachFindings(source, layer, edgesOf)),
  ]

  const devEdges = [...layerOf]
    .flatMap(([from, fromLayer]) =>
      Option.toArray(lookup(manifestOf, from)).flatMap((manifest) =>
        manifest.dev.flatMap((to) =>
          Option.toArray(lookup(layerOf, to))
            .filter((toLayer) => toLayer !== fromLayer)
            .map((toLayer): DevEdge => ({ from, fromLayer, to, toLayer }))
        )
      )
    )
    .toSorted((a, b) => compare(a.from, b.from) || compare(a.to, b.to))

  return {
    findings: findings.toSorted(byOrder),
    table: Layer.literals.map((layer) => {
      const names = [...new Set(map[layer])].toSorted()
      return { layer, names, absent: names.filter((name) => !manifestOf.has(name)) }
    }),
    devEdges,
    present: manifests.length,
  }
}

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static import
  // would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  const LAYER_ORDER: readonly Layer[] = ['core', 'harness', 'spec-trace', 'extracted', 'frontend']

  const EMPTY_MAP: LayerMap = { 'core': [], 'harness': [], 'spec-trace': [], 'extracted': [], 'frontend': [] }

  const decodeDoc = Schema.decodeUnknownResult(ManifestDoc)

  const under = (map: LayerMap, [layer, name]: readonly [Layer, string]): LayerMap => ({
    ...map,
    [layer]: [...map[layer], name],
  })

  const buildMap = (pairs: readonly (readonly [Layer, string])[]): LayerMap => pairs.reduce(under, EMPTY_MAP)

  const pkg = (name: string, fields: Readonly<Record<string, Readonly<Record<string, string>>>> = {}): Manifest =>
    toManifest({
      path: `packages/${name}/package.json`,
      doc: Result.getOrThrow(decodeDoc({ name, version: '0.0.0', ...fields })),
    })

  const same = Schema.toEquivalence(Schema.Array(Finding))

  const ordered = (one: Layer, two: Layer): readonly [Layer, Layer] =>
    LAYER_ORDER.indexOf(one) <= LAYER_ORDER.indexOf(two) ? [one, two] : [two, one]

  const aliasKey = (alias: boolean): string => (alias ? 'innocent' : '@t/target')

  const aliasSpecifier = (alias: boolean): string => (alias ? 'npm:@t/target@^1' : 'workspace:^')

  it.prop(
    '∀f_CoreHarness_∈ForbiddenEdge',
    { of: [EdgeField, Schema.Boolean], subject: decide },
    (decide, [field, alias]) =>
      same(
        decide({
          map: buildMap([['core', '@t/source'], ['harness', '@t/target']]),
          manifests: [
            pkg('@t/source', { [field]: { [aliasKey(alias)]: aliasSpecifier(alias) } }),
            pkg('@t/target'),
          ],
          refused: [],
        }).findings,
        [
          ForbiddenEdge.make({
            fromLayer: 'core',
            toLayer: 'harness',
            path: ['@t/source', '@t/target'],
            fields: [field],
          }),
        ],
      ),
  )

  it.prop(
    '∀d_DoubledName_∈DuplicateName',
    { of: [Layer, Layer, Schema.String], subject: decide },
    (decide, [one, two, name]) =>
      same(
        decide({ map: buildMap([[one, name], [two, name]]), manifests: [pkg(name)], refused: [] }).findings,
        [DuplicateName.make({ name, layers: ordered(one, two) })],
      ),
  )

  it.prop(
    '∀h_HostedAbsent_∈MissingPackage',
    { of: [HostedLayer, Schema.String], subject: decide },
    (decide, [layer, name]) =>
      same(
        decide({ map: buildMap([[layer, name]]), manifests: [], refused: [] }).findings,
        [MissingPackage.make({ name, layer })],
      ),
  )
}
