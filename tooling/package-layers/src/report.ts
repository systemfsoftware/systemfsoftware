import { Match } from 'effect'
import { type Decision, SCHEMA_LAW, VITEST_FORK } from './layers/check.ts'
import type { Finding, SchemaLawPeer } from './layers/layers.schema.ts'
import type { Assignment } from './layers/list.ts'

const SCHEMA_LAW_MESSAGE: Record<SchemaLawPeer['peer'], string> = {
  'fork': `${SCHEMA_LAW} has a peer on the ${VITEST_FORK} fork`,
  'fork-alias': `${SCHEMA_LAW} has a 'vitest' peer that aliases the ${VITEST_FORK} fork`,
  'required': `${SCHEMA_LAW} has a 'vitest' peer not marked optional in peerDependenciesMeta`,
}

export const findingMessage = (finding: Finding): string =>
  Match.valueTags(finding, {
    MapRefused: (f) => `${f.path}: ${f.reason}`,
    ManifestRefused: (f) => `${f.path}: ${f.reason}`,
    DuplicateName: (f) =>
      f.layers[0] === f.layers[1]
        ? `package-layers.json lists ${f.name} twice under '${f.layers[0]}'`
        : `package-layers.json lists ${f.name} under both '${f.layers[0]}' and '${f.layers[1]}'`,
    DuplicateManifest: (f) => `${f.name} is declared by both ${f.paths[0]} and ${f.paths[1]}`,
    MissingPackage: (f) =>
      `package-layers.json lists ${f.name} under '${f.layer}', but no manifest under packages/ declares it`,
    UnmappedPackage: (f) => `${f.path}: ${f.name} is not in package-layers.json`,
    SchemaLawPeer: (f) => SCHEMA_LAW_MESSAGE[f.peer],
    ForbiddenEdge: (f) => {
      const hops = f.path.slice(1).map((name, i) => ` -[${f.fields[i]}]-> ${name}`).join('')
      return `${f.fromLayer} ${f.path[0]} reaches ${f.toLayer} ${f.path.at(-1)}: ${f.path[0]}${hops}`
    },
  })

export const failureLines = (findings: readonly Finding[]): readonly string[] => [
  ...findings.map((finding) => `::error title=layers-${finding._tag}::${findingMessage(finding)}`),
  `layers: ${findings.length} findings`,
]

export const passLines = (decision: Decision): readonly string[] => {
  const total = decision.table.reduce((n, row) => n + row.names.length, 0)
  return [
    ...decision.table.flatMap((row) => [
      `${row.layer} (${row.names.length})`,
      ...row.names.map((name) => (row.absent.includes(name) ? `  ${name} (not in this repository)` : `  ${name}`)),
    ]),
    `devDependencies across layers, reported only (${decision.devEdges.length})`,
    ...decision.devEdges.map((edge) => `  ${edge.from} (${edge.fromLayer}) -> ${edge.to} (${edge.toLayer})`),
    `layers: ${total} mapped packages, ${decision.present} present, each present package in exactly one of ${decision.table.length} layers; no forbidden edge`,
  ]
}

export const listLines = (rows: readonly Assignment[]): readonly string[] => {
  const width = rows.reduce((max, row) => Math.max(max, row.package.length), 0)
  return rows.map((row) => `${row.package.padEnd(width)}  ${row.category}`)
}

export const listJson = (rows: readonly Assignment[]): string => JSON.stringify(rows, undefined, 2)
