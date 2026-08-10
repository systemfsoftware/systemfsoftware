export interface CellException {
  readonly segment: string
  readonly cells: readonly string[]
}

export interface CellEdge {
  readonly forbid: readonly string[]
  readonly forbidValue?: readonly string[]
  readonly exceptVia?: CellException
  readonly forbidRuntime?: RegExp
}

export const RUNTIME_MODULE = /^(?:node:.+|fs|path|crypto|http|https|os|child_process)$/

export const RUNTIME_MODULE_WITH_PROMISES = /^(?:node:.+|fs|fs\/promises|path|crypto|http|https|os|child_process)$/

export const CELL_IMPORT_TABLE: Readonly<Record<string, CellEdge>> = {
  '.workflow.ts': {
    forbid: [
      '.store',
      '.adapter',
      '.executor',
      '.handler',
      '.middleware',
      '.policy',
      '.state',
      '.shape',
      '.observer',
    ],
    forbidRuntime: RUNTIME_MODULE,
  },
  '.executor.ts': {
    forbid: ['.shape', '.executor'],
    forbidValue: ['.adapter'],
    exceptVia: { segment: 'internal', cells: ['.executor'] },
  },
  // Domain-TYPED composition over domain-BLIND kernels: unlike `.kernel` it may name
  // the domain, which is why `.schema` is absent from this row and present in that one.
  '.combinator.ts': {
    forbid: [
      '.shape',
      '.state',
      '.executor',
      '.acl',
      '.handler',
      '.middleware',
      '.adapter',
      '.policy',
      '.observer',
      '.store',
    ],
    forbidRuntime: RUNTIME_MODULE_WITH_PROMISES,
  },
  '.kernel.ts': {
    forbid: [
      '.schema',
      '.shape',
      '.state',
      '.workflow',
      '.executor',
      '.acl',
      '.handler',
      '.middleware',
      '.adapter',
      '.policy',
      '.observer',
      '.store',
    ],
    forbidRuntime: RUNTIME_MODULE_WITH_PROMISES,
  },
  '.store.ts': {
    forbid: ['.store', '.executor', '.handler', '.middleware', '.adapter'],
  },
  '.handler.ts': {
    forbid: [
      '.store',
      '.adapter',
      '.workflow',
      '.acl',
      '.state',
      '.middleware',
      '.policy',
      '.shape',
      '.observer',
      '.handler',
    ],
    forbidRuntime: RUNTIME_MODULE,
  },
  '.middleware.ts': {
    forbid: ['.executor', '.workflow', '.store'],
  },
  '.adapter.ts': {
    forbid: [
      '.workflow',
      '.state',
      '.handler',
      '.policy',
      '.store',
      '.acl',
      '.observer',
      '.adapter',
      '.middleware',
    ],
  },
  '.policy.ts': {
    forbid: [
      '.schema',
      '.shape',
      '.state',
      '.workflow',
      '.executor',
      '.store',
      '.acl',
      '.handler',
      '.middleware',
      '.adapter',
      '.service',
      '.shell',
      '.use-case',
      '.daemon',
      '.repository',
    ],
  },
  '.shape.ts': {
    forbid: [
      '.schema',
      '.workflow',
      '.executor',
      '.store',
      '.acl',
      '.adapter',
      '.handler',
      '.middleware',
      '.policy',
      '.state',
      '.observer',
      '.kernel',
    ],
  },
  '.state.ts': {
    forbid: [],
    forbidValue: ['.adapter'],
  },
  '.observer.ts': {
    forbid: [
      '.schema',
      '.workflow',
      '.executor',
      '.store',
      '.acl',
      '.adapter',
      '.handler',
      '.middleware',
      '.policy',
      '.state',
      '.shape',
    ],
  },
  '.harness.ts': {
    forbid: [
      '.executor',
      '.handler',
      '.middleware',
      '.adapter',
      '.store',
      '.state',
      '.policy',
      '.acl',
      '.observer',
    ],
  },
  // Every cell may import a declaration cell, so forbid carries only the impure
  // cells - a runtime reach from here would launder behavior into every importer.
  '.type.ts': {
    forbid: ['.executor', '.adapter', '.store', '.handler', '.middleware', '.state', '.observer', '.harness'],
  },
  '.integration.test.ts': {
    forbid: ['.kernel', '.workflow', '.schema', '.acl'],
  },
}

export const OBSERVER_MODULE = /\.observer(?:\.(?:[cm]?[tj]sx?))?$/

export const NON_PRODUCTION_CALLER: readonly RegExp[] = [
  /\.observer(?:\.(?:[cm]?[tj]sx?))?$/u,
  /\.(?:test|spec)(?:\.d)?\.(?:[cm]?[tj]sx?)$/u,
  /(?:^|\/)(?:__tests__|tests|test|__fixtures__)(?:\/|$)/u,
  /(?:^|\/)(?:scripts|tools|tooling|bin)(?:\/|$)/u,
]

export const MODULE_EXTENSION = /\.(?:[cm]?[tj]sx?)$/

/**
 * The final path segment of a module specifier, with the optional module
 * extension stripped. This is the single shared derivation behind every
 * specifier judgement the plugin makes: `cellOf` reads the cell suffix off
 * the stem, and `no-barrel-import-in-cell` reads whether the stem names a
 * barrel. One copy — the two rules cannot drift on what a specifier means.
 */
export const finalPathStem = (specifier: string): string | null => {
  const segments = specifier.split('/').filter((segment) => segment.length > 0)
  const last = segments.at(-1)
  if (last === undefined) return null
  return last.replace(MODULE_EXTENSION, '')
}
