/**
 * Parity-gate unit checks (the vitest half of the drift gates):
 *
 * 1. No MAPPING row cites a `src/…` path absent from disk — the matrix can
 *    never document a renamed-away file.
 * 2. Every `present` row's backticked rightsize symbol exists in the
 *    committed api-extractor surface — the mapping cannot claim parity for
 *    a symbol the package no longer exports.
 * 3. The modules subpath declares no phantom value exports — every value
 *    the rollup advertises is a real runtime export of the entry.
 * 4. Error-tag reverse closure — every `S.TaggedError` class the main
 *    rollup exports is in the 26-tag pin (type-level twin:
 *    test-types/Taxonomy.tst.ts).
 */
import { readdirSync, readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as modulesEntry from '../modules.js'

// Types come from the ambient scripts/parity-gates.d.mts.
import { MAPPING, staleMappingPathsFor } from '../../scripts/parity-gates.mjs'
const PKG_ROOT = path.resolve(import.meta.dirname, '../..')

const API_REPORTS = [
  'etc/rightsize.api.md',
  'etc/modules.api.md',
  'etc/backend-docker.api.md',
  'etc/backend-msb.api.md',
] as const

/** Declared top-level names in one api report (declarations + re-exports). */
const declaredNames = (report: string): Set<string> => {
  const names = new Set<string>()
  const text = readFileSync(path.join(PKG_ROOT, report), 'utf8')
  const decl = /^export\s+(?:declare\s+)?(?:const|function|class|interface|type|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm
  for (const match of text.matchAll(decl)) {
    const name = match[1]
    if (name !== undefined) names.add(name)
  }
  const reexport = /export\s*\{([^}]+)\}/g
  for (const match of text.matchAll(reexport)) {
    for (const part of (match[1] ?? '').split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name !== undefined && name !== '') names.add(name)
    }
  }
  // 4-space-indented members inside a declaration (interface/class members).
  const member = /^ {4}(?:readonly\s+)?([a-zA-Z_$][\w$]*)\s*[?(]?\s*(?::|\(|;)/gm
  for (const match of text.matchAll(member)) {
    const name = match[1]
    if (name !== undefined) names.add(name)
  }
  return names
}

const SURFACE = new Set<string>(API_REPORTS.flatMap((report) => [...declaredNames(report)]))

/** External namespaces whose members appear in `rs` prose; not ours to pin. */
const EXTERNAL_HEADS = new Set([
  'Effect',
  'Result',
  'Option',
  'Schema',
  'S',
  'Layer',
  'Scope',
  'Context',
  'Clock',
  'Match',
  'Fiber',
  'Cell',
  'Workflow',
  'Wire',
  'Promise',
  'JSON',
])

/** The leading identifier of every backticked span in a row's rs+note. */
const leadingSymbolsOf = (text: string): readonly string[] => {
  const heads: string[] = []
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const span = match[1] ?? ''
    const ident = span.match(/^[A-Za-z_$][\w$]*/)
    const head = ident?.[0]
    if (head !== undefined && !EXTERNAL_HEADS.has(head)) heads.push(head)
  }
  return heads
}

describe('parity gates', () => {
  it('Should_ListNoMappingPath_When_EveryCitedSrcPathExists', () => {
    expect([...staleMappingPathsFor(MAPPING)]).toEqual([])
  })

  it('Should_KeepPresentRowsHonest_When_TheSurfaceMoves', () => {
    const absent: string[] = []
    for (const [key, row] of Object.entries(MAPPING)) {
      if (row.status !== 'present') continue
      for (const head of leadingSymbolsOf(`${row.rs}\n${row.note}`)) {
        if (!SURFACE.has(head)) absent.push(`${key}: \`${head}\``)
      }
    }
    expect(absent).toEqual([])
  })

  it('Should_DeclareNoPhantomValues_When_ModulesRollupIsRead', () => {
    const text = readFileSync(path.join(PKG_ROOT, 'etc/modules.api.md'), 'utf8')
    const valueRe = /^export\s+declare\s+(?:const|function|class|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm
    const runtime = new Set<string>(Object.keys(modulesEntry))
    const phantoms: string[] = []
    for (const match of text.matchAll(valueRe)) {
      const name = match[1]
      if (name !== undefined && !runtime.has(name)) phantoms.push(name)
    }
    expect(phantoms).toEqual([])
  })

  it('Should_PinEveryExportedTaggedError_When_TheRollupIsClosed', () => {
    // The exported error-tag surface (kept equal to test-types/Taxonomy.tst.ts).
    const PIN = new Set([
      'BackendError',
      'PortBindConflictError',
      'ContainerLaunchError',
      'CheckpointBackendMismatchError',
      'CheckpointUnsupportedError',
      'CheckpointArtifactMissingError',
      'MalformedCheckpointArchiveError',
      'InvalidCheckpointNameError',
      'RelativeContainerPathError',
      'IncompatibleImageError',
      'IsolationRequiredError',
      'NetworkDisabledConflictError',
      'ProvisionError',
      'ReuseFromCheckpointError',
      'ReuseWithNetworkError',
      'RootDiskConflictError',
      'TmpfsRootCheckpointError',
      'TmpfsRootExceedsMemoryError',
      'UnsupportedByBackendError',
      'MalformedHandleError',
      'HandleBackendMismatchError',
      'UnreachableMsbAgentError',
      'ReapFactContradictionError',
      'BackendUnreachableError',
      'FreePortExhaustedError',
      'UnsupportedDockerHostError',
    ])
    const srcFiles = readdirSync(path.join(PKG_ROOT, 'src'), { recursive: true })
      .filter((file): file is string => typeof file === 'string')
      .map((file) => file.replaceAll('\\', '/'))
      .filter((file) => file.endsWith('.ts') && !file.includes('__tests__'))
    const exported = new Set<string>()
    for (const file of srcFiles) {
      const text = readFileSync(path.join(PKG_ROOT, 'src', file), 'utf8')
      for (const match of text.matchAll(/class\s+([A-Za-z_$][\w$]*)\s+extends\s+S\.TaggedError/g)) {
        const name = match[1]
        if (name !== undefined && SURFACE.has(name)) exported.add(name)
      }
    }
    expect(exported).toEqual(PIN)
  })
})
