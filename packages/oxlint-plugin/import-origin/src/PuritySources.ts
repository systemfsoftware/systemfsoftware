export const IO_SOURCES: ReadonlySet<string> = new Set([
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
  'http',
  'node:http',
  'https',
  'node:https',
  'http2',
  'node:http2',
  'process',
  'node:process',
  'console',
  'node:console',
  'timers',
  'timers/promises',
  'node:timers',
  'node:timers/promises',
  'child_process',
  'node:child_process',
  'net',
  'node:net',
  'tls',
  'node:tls',
  'dgram',
  'node:dgram',
  'dns',
  'dns/promises',
  'node:dns',
  'node:dns/promises',
  'readline',
  'readline/promises',
  'node:readline',
  'node:readline/promises',
  'tty',
  'node:tty',
  'worker_threads',
  'node:worker_threads',
  'cluster',
  'node:cluster',
  'effect/Effect',
  'effect/Layer',
  'effect/Service',
  'effect/Runtime',
])

export const EFFECT_ROOT_IO_NAMES: ReadonlySet<string> = new Set([
  'Effect',
  'Layer',
  'Service',
  'Runtime',
  'Scope',
  'Ref',
  'Deferred',
  'Queue',
  'PubSub',
  'SynchronizedRef',
  'SubscriptionRef',
  'Semaphore',
  'Pool',
  'Fiber',
  'FiberHandle',
  'FiberSet',
  'Schedule',
  'Metric',
  'Supervisor',
  'Clock',
  'Random',
  'Console',
  'Config',
  'ConfigProvider',
  'Logger',
  'Tracer',
  'CurrentTracer',
])

export const EFFECT_ROOT_PURE_NAMES: ReadonlySet<string> = new Set([
  'Array',
  'BigInt',
  'Boolean',
  'Cause',
  'Chunk',
  'Data',
  'Duration',
  'Equal',
  'Exit',
  'Filter',
  'Function',
  'Hash',
  'HashMap',
  'HashSet',
  'Iterable',
  'Match',
  'Number',
  'Option',
  'Order',
  'Ordering',
  'Pipeable',
  'PlatformError',
  'Predicate',
  'Record',
  'Result',
  'Schema',
  'String',
  'Struct',
  'Tuple',
  'flow',
  'identity',
  'pipe',
])

const SCHEMA_FILE_SUFFIXES: readonly string[] = ['.schema.js', '.schema.ts']

export const isRelativeSchemaSpecifier = (source: string): boolean => {
  if (!source.startsWith('./') && !source.startsWith('../')) return false
  const basename = source.slice(source.lastIndexOf('/') + 1)
  return SCHEMA_FILE_SUFFIXES.some((suffix) => basename.endsWith(suffix))
}

const EFFECT_PACKAGE = 'effect'
const EFFECT_SUBPATH_PREFIX = 'effect/'

const isAreaBarrelPath = (path: string): boolean =>
  path.length > 0 && !path.includes('/') && path[0] === path[0]?.toLowerCase()

export const isEffectBarrel = (source: string): boolean =>
  source === EFFECT_PACKAGE ||
  (source.startsWith(EFFECT_SUBPATH_PREFIX) && isAreaBarrelPath(source.slice(EFFECT_SUBPATH_PREFIX.length)))

export const effectModulePath = (source: string, importedName: string | null): string | null => {
  if (source === EFFECT_PACKAGE) return importedName
  if (!source.startsWith(EFFECT_SUBPATH_PREFIX)) return null
  const path = source.slice(EFFECT_SUBPATH_PREFIX.length)
  if (!isAreaBarrelPath(path)) return path
  return importedName === null ? null : `${path}/${importedName}`
}
