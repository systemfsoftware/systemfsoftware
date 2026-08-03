export const PRIMITIVE_CONSTRUCTORS: Record<string, true> = {
  Map: true,
  Set: true,
  WeakMap: true,
  WeakSet: true,
  Semaphore: true,
}

// Sync factories only — Ref.make returns an Effect and cannot hold escaping state at module scope.
export const PRIMITIVE_MAKERS = [
  ['Ref', 'unsafeMake'],
  ['Deferred', 'unsafeMake'],
  ['Semaphore', 'make'],
  ['TRef', 'unsafeMake'],
  ['ManagedRuntime', 'make'],
  ['Layer', 'toRuntime'],
] as const

// Class-based quarantine: `class X extends Context.Reference<X>()('id', { defaultValue })`.
// A Reference constructed at module scope is live state escaping a single interaction —
// exactly what the state cell exists to quarantine — so the cell may hold one.
export const PRIMITIVE_CLASS_SUPERS = [
  ['Context', 'Reference'],
] as const

export const RUNTIME_HANDLE_KINDS: ReadonlySet<string> = new Set(['ManagedRuntime.make', 'Layer.toRuntime'])

export const DEFAULT_EXPORT_PRIMITIVE_NAME = 'default export'
