#!/usr/bin/env -S deno run --frozen --allow-read=.
// sfs-checks - the repository-level structural checks the repo gate runs.
//
//   sfs-checks layers
//
// `layers` reads `package-layers.json` (the committed layer map: one key per
// layer, each an array of package names) and every package manifest under
// `packages/`, and refuses (exit 1, one `::error` line per finding) on:
//
//   - a `core`, `harness` or `spec-trace` name with no manifest (`extracted`
//     and `frontend` are target categories, so their names may be absent), a
//     manifest name the map does not list, one name listed twice or in two
//     layers, or two manifests sharing a name;
//   - a forbidden runtime or peer edge: core to any non-core layer, harness to
//     core/spec-trace/extracted, spec-trace to extracted. Harness and
//     spec-trace sources are judged on their direct edges; a core source on
//     its whole packed closure (dependencies, optionalDependencies and
//     peerDependencies, optional peers included), with the shortest path;
//   - a `@systemfsoftware/vitest` fork peer, a `vitest` peer aliasing the
//     fork, or a `vitest` peer not marked optional, on
//     `@systemfsoftware/effect-schema-law`.
//
// `devDependencies` are listed in their own report section and never fail the
// check. A missing or unknown subcommand exits 2. Every input is re-read on
// each run; an unreadable map or manifest is a refusal naming the file, never
// a silent skip.

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { dirname, fromFileUrl, join, relative } from '@std/path'
import { Result, Schema } from 'effect'

export const LAYERS = ['core', 'harness', 'spec-trace', 'extracted', 'frontend'] as const

export type Layer = (typeof LAYERS)[number]

/** The committed layer map, `package-layers.json` decoded. */
export type LayerMap = { readonly [K in Layer]: readonly string[] }

export type EdgeField = 'dependencies' | 'optionalDependencies' | 'peerDependencies'

/** One dependency entry with its `npm:` alias resolved: `key` is the manifest key, `to` the package installed. */
export interface Edge {
  readonly key: string
  readonly to: string
  readonly field: EdgeField
}

/** One package manifest, reduced to what the check reads. */
export interface Manifest {
  readonly path: string
  readonly name: string
  /** `dependencies`, `optionalDependencies` and `peerDependencies`: the fields `pnpm pack` keeps. */
  readonly packed: readonly Edge[]
  readonly dev: readonly string[]
  readonly optionalPeers: ReadonlySet<string>
}

export type Finding =
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'duplicate'; readonly detail: string }
  | { readonly kind: 'missing-package'; readonly name: string; readonly layer: Layer }
  | { readonly kind: 'unmapped-manifest'; readonly name: string; readonly path: string }
  | { readonly kind: 'schema-law-peer'; readonly detail: string }
  | {
    readonly kind: 'forbidden-reach'
    readonly fromLayer: Layer
    readonly toLayer: Layer
    /** Package names from the judged source to the forbidden target; length 2 is a direct edge. */
    readonly path: readonly string[]
    /** The manifest field of each hop, `path.length - 1` entries. */
    readonly fields: readonly EdgeField[]
  }

export interface Decision {
  readonly findings: readonly Finding[]
  /** Every mapped name per layer; `absent` are the target-category names with no manifest here. */
  readonly table: readonly {
    readonly layer: Layer
    readonly names: readonly string[]
    readonly absent: ReadonlySet<string>
  }[]
  /** Cross-layer `devDependencies` edges, one rendered line each, never judged. */
  readonly devEdges: readonly string[]
}

/** The layers this repository hosts: each of their names must have a manifest under `packages/`. */
const HOSTED: Record<Layer, boolean> = {
  'core': true,
  'harness': true,
  'spec-trace': true,
  'extracted': false,
  'frontend': false,
}

/** The layers each source layer may not reach. */
const FORBIDDEN: Record<Layer, readonly Layer[]> = {
  'core': ['harness', 'spec-trace', 'extracted', 'frontend'],
  'harness': ['core', 'spec-trace', 'extracted'],
  'spec-trace': ['extracted'],
  'extracted': [],
  'frontend': [],
}

const FINDING_ORDER: Record<Finding['kind'], number> = {
  'refused': 0,
  'duplicate': 1,
  'missing-package': 2,
  'unmapped-manifest': 3,
  'schema-law-peer': 4,
  'forbidden-reach': 5,
}

const SCHEMA_LAW = '@systemfsoftware/effect-schema-law'
const VITEST_FORK = '@systemfsoftware/vitest'
const VITEST = 'vitest'

const Deps = Schema.Record(Schema.String, Schema.String)

const ManifestDoc = Schema.Struct({
  name: Schema.String,
  dependencies: Schema.optional(Deps),
  optionalDependencies: Schema.optional(Deps),
  peerDependencies: Schema.optional(Deps),
  devDependencies: Schema.optional(Deps),
  peerDependenciesMeta: Schema.optional(
    Schema.Record(Schema.String, Schema.Struct({ optional: Schema.optional(Schema.Boolean) })),
  ),
})

const MapDoc = Schema.Record(Schema.String, Schema.Array(Schema.String))

const decodeManifestDoc = Schema.decodeUnknownResult(ManifestDoc)
const decodeMapDoc = Schema.decodeUnknownResult(MapDoc)

/** The package an `npm:<name>@<range>` specifier installs; `undefined` for any other specifier. */
export const aliasTarget = (specifier: string): string | undefined => {
  if (!specifier.startsWith('npm:')) return undefined
  const rest = specifier.slice('npm:'.length)
  const at = rest.indexOf('@', rest.startsWith('@') ? 1 : 0)
  return at === -1 ? rest : rest.slice(0, at)
}

/** `package-layers.json` as a `LayerMap`: exactly the five layer keys, each an array of names. */
export const decodeMap = (doc: unknown): Result.Result<LayerMap, string> => {
  const decoded = decodeMapDoc(doc)
  if (Result.isFailure(decoded)) {
    return Result.fail(`package-layers.json is not a map of layer names to string arrays: ${decoded.failure.message}`)
  }
  const record = decoded.success
  const unknown = Object.keys(record).filter((key) => !(LAYERS as readonly string[]).includes(key))
  if (unknown.length > 0) return Result.fail(`package-layers.json has unknown layer keys: ${unknown.join(', ')}`)
  const missing = LAYERS.filter((layer) => !(layer in record))
  if (missing.length > 0) return Result.fail(`package-layers.json is missing layers: ${missing.join(', ')}`)
  return Result.succeed(record as LayerMap)
}

/** One manifest document, decoded against the fields the check reads. */
export const decodeManifest = (path: string, doc: unknown): Result.Result<Manifest, string> => {
  const decoded = decodeManifestDoc(doc)
  if (Result.isFailure(decoded)) {
    return Result.fail(`${path} is not a readable package manifest: ${decoded.failure.message}`)
  }
  const m = decoded.success
  const edges = (record: Readonly<Record<string, string>> | undefined, field: EdgeField): readonly Edge[] =>
    Object.entries(record ?? {}).map(([key, specifier]) => ({ key, to: aliasTarget(specifier) ?? key, field }))
  return Result.succeed({
    path,
    name: m.name,
    packed: [
      ...edges(m.dependencies, 'dependencies'),
      ...edges(m.optionalDependencies, 'optionalDependencies'),
      ...edges(m.peerDependencies, 'peerDependencies'),
    ],
    dev: Object.entries(m.devDependencies ?? {}).map(([key, specifier]) => aliasTarget(specifier) ?? key),
    optionalPeers: new Set(
      Object.entries(m.peerDependenciesMeta ?? {}).filter(([, meta]) => meta.optional === true).map(([name]) => name),
    ),
  })
}

/** One plain-text line per finding. */
export const message = (finding: Finding): string => {
  switch (finding.kind) {
    case 'refused':
      return finding.reason
    case 'duplicate':
    case 'schema-law-peer':
      return finding.detail
    case 'missing-package':
      return `package-layers.json lists ${finding.name} under '${finding.layer}', but no manifest under packages/ declares it`
    case 'unmapped-manifest':
      return `${finding.path}: ${finding.name} is not in package-layers.json`
    case 'forbidden-reach': {
      const [from, ...rest] = finding.path
      const hops = rest.map((name, i) => ` -[${finding.fields[i]}]-> ${name}`).join('')
      return `${finding.fromLayer} ${from} reaches ${finding.toLayer} ${rest.at(-1)}: ${from}${hops}`
    }
  }
}

const schemaLawFindings = (manifest: Manifest): readonly Finding[] =>
  manifest.packed
    .filter((edge) => edge.field === 'peerDependencies')
    .flatMap((edge): Finding[] => {
      const found: Finding[] = []
      if (edge.key === VITEST_FORK) {
        found.push({ kind: 'schema-law-peer', detail: `${SCHEMA_LAW} has a peer on the ${VITEST_FORK} fork` })
      }
      if (edge.key === VITEST && edge.to === VITEST_FORK) {
        found.push({
          kind: 'schema-law-peer',
          detail: `${SCHEMA_LAW} has a '${VITEST}' peer that aliases the ${VITEST_FORK} fork`,
        })
      }
      if (edge.key === VITEST && !manifest.optionalPeers.has(VITEST)) {
        found.push({
          kind: 'schema-law-peer',
          detail: `${SCHEMA_LAW} has a '${VITEST}' peer not marked optional in peerDependenciesMeta`,
        })
      }
      return found
    })

/**
 * The whole `layers` check as one decision over decoded inputs: identity
 * findings, forbidden reach (direct edges for harness and spec-trace, the
 * packed closure for core), the schema-law peer rule, and the cross-layer
 * dev-edge report. Findings come out in a deterministic order.
 */
export const decide = (map: LayerMap, manifests: readonly Manifest[]): Decision => {
  const findings: Finding[] = []

  const layerOf = new Map<string, Layer>()
  for (const layer of LAYERS) {
    for (const name of map[layer]) {
      const first = layerOf.get(name)
      if (first === undefined) layerOf.set(name, layer)
      else {
        findings.push({
          kind: 'duplicate',
          detail: first === layer
            ? `package-layers.json lists ${name} twice under '${layer}'`
            : `package-layers.json lists ${name} under both '${first}' and '${layer}'`,
        })
      }
    }
  }

  const manifestOf = new Map<string, Manifest>()
  for (const manifest of manifests) {
    const first = manifestOf.get(manifest.name)
    if (first === undefined) manifestOf.set(manifest.name, manifest)
    else {findings.push({
        kind: 'duplicate',
        detail: `${manifest.name} is declared by both ${first.path} and ${manifest.path}`,
      })}
    if (!layerOf.has(manifest.name)) {
      findings.push({ kind: 'unmapped-manifest', name: manifest.name, path: manifest.path })
    }
  }
  for (const [name, layer] of layerOf) {
    if (!manifestOf.has(name) && HOSTED[layer]) findings.push({ kind: 'missing-package', name, layer })
  }

  const mappedEdges = (name: string): readonly Edge[] =>
    (manifestOf.get(name)?.packed ?? []).filter((edge) => layerOf.has(edge.to))

  for (const [source, sourceLayer] of layerOf) {
    if (sourceLayer === 'core') {
      // Breadth-first through core packages only: the first non-core package a
      // path meets is where it leaves core, and BFS makes that path shortest.
      const via = new Map<string, Edge & { readonly from: string }>()
      const queue = [source]
      for (let i = 0; i < queue.length; i += 1) {
        const current = queue[i]
        for (const edge of mappedEdges(current)) {
          if (edge.to === source || via.has(edge.to)) continue
          via.set(edge.to, { ...edge, from: current })
          const toLayer = layerOf.get(edge.to)
          if (toLayer === 'core') {
            queue.push(edge.to)
            continue
          }
          if (toLayer === undefined || !FORBIDDEN.core.includes(toLayer)) continue
          const path = [edge.to]
          const fields: EdgeField[] = []
          for (let at = via.get(edge.to); at !== undefined; at = via.get(at.from)) {
            fields.unshift(at.field)
            path.unshift(at.from)
            if (at.from === source) break
          }
          findings.push({ kind: 'forbidden-reach', fromLayer: 'core', toLayer, path, fields })
        }
      }
    } else {
      for (const edge of mappedEdges(source)) {
        const toLayer = layerOf.get(edge.to)
        if (toLayer !== undefined && FORBIDDEN[sourceLayer].includes(toLayer)) {
          findings.push({
            kind: 'forbidden-reach',
            fromLayer: sourceLayer,
            toLayer,
            path: [source, edge.to],
            fields: [edge.field],
          })
        }
      }
    }
  }

  const schemaLaw = manifestOf.get(SCHEMA_LAW)
  if (schemaLaw !== undefined) findings.push(...schemaLawFindings(schemaLaw))

  const devEdges = [...layerOf].flatMap(([name, layer]) =>
    (manifestOf.get(name)?.dev ?? []).flatMap((to) => {
      const toLayer = layerOf.get(to)
      return toLayer === undefined || toLayer === layer ? [] : [`${name} (${layer}) -> ${to} (${toLayer})`]
    })
  ).toSorted()

  const keyed = findings.map((finding) => ({ finding, order: FINDING_ORDER[finding.kind], text: message(finding) }))
  keyed.sort((a, b) => a.order - b.order || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))

  return {
    findings: keyed.map(({ finding }) => finding),
    table: LAYERS.map((layer) => {
      const names = [...new Set(map[layer])].toSorted()
      return { layer, names, absent: new Set(names.filter((name) => !manifestOf.has(name))) }
    }),
    devEdges,
  }
}

const fail = (lines: readonly string[], code: number): never => {
  for (const line of lines) console.error(line)
  Deno.exit(code)
}

const readJson = async (file: string, label: string): Promise<unknown> => {
  let text: string
  try {
    text = await Deno.readTextFile(file)
  } catch (error) {
    return fail([
      `::error title=layers-refused::${label} cannot be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ], 1)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    return fail([
      `::error title=layers-refused::${label} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    ], 1)
  }
}

const layers = async (root: string): Promise<void> => {
  const map = decodeMap(await readJson(join(root, 'package-layers.json'), 'package-layers.json'))
  if (Result.isFailure(map)) return fail([`::error title=layers-refused::${map.failure}`], 1)

  const manifests: Manifest[] = []
  const refused: Finding[] = []
  for await (
    const entry of expandGlob('packages/**/package.json', {
      root,
      exclude: ['**/node_modules/**', '**/dist/**', '**/.*/**'],
    })
  ) {
    const path = relative(root, entry.path)
    const decoded = decodeManifest(path, await readJson(entry.path, path))
    if (Result.isFailure(decoded)) refused.push({ kind: 'refused', reason: decoded.failure })
    else manifests.push(decoded.success)
  }
  manifests.sort((a, b) => (a.path < b.path ? -1 : 1))

  const decision = decide(map.success, manifests)
  const findings = [...refused, ...decision.findings]
  if (findings.length > 0) {
    return fail([
      ...findings.map((finding) => `::error title=layers-${finding.kind}::${message(finding)}`),
      `layers: ${findings.length} findings`,
    ], 1)
  }

  for (const { layer, names, absent } of decision.table) {
    console.log(`${layer} (${names.length})`)
    for (const name of names) console.log(absent.has(name) ? `  ${name} (not in this repository)` : `  ${name}`)
  }
  console.log(`devDependencies across layers, reported only (${decision.devEdges.length})`)
  for (const edge of decision.devEdges) console.log(`  ${edge}`)
  const total = decision.table.reduce((n, { names }) => n + names.length, 0)
  const present = manifests.length
  console.log(
    `layers: ${total} mapped packages, ${present} present, each present package in exactly one of ${decision.table.length} layers; no forbidden edge`,
  )
}

if (import.meta.main) {
  const [command] = parseArgs(Deno.args)._
  if (command !== 'layers') {
    fail([`sfs-checks: unknown subcommand '${String(command ?? '')}'; usage: sfs-checks layers`], 2)
  }
  await layers(dirname(dirname(dirname(fromFileUrl(import.meta.url)))))
}
