export const PRIMITIVE_CONSTRUCTORS: Record<string, true> = {
  Map: true,
  Set: true,
  WeakMap: true,
  WeakSet: true,
  Semaphore: true,
}

// Sync factories only — Ref.make returns an Effect and cannot hold escaping state at module scope.
// v4 renames the unsafe-suffixed constructors (`Ref.unsafeMake` -> `Ref.makeUnsafe`, `Deferred.unsafeMake`
// -> `Deferred.makeUnsafe`) and renames the TRef module to TxRef (`TRef.unsafeMake` -> `TxRef.makeUnsafe`).
// `Context.Reference` gains a synchronous function form in v4 (`Context.Reference(id, { defaultValue })`)
// alongside the v3 class-extends form; both construct the escaping reference at module scope. Each row
// carries the v3 spelling first, then its v4 spelling — v3 recognition stays, v4 recognition is additive.
export const PRIMITIVE_MAKERS = [
  ['Ref', 'unsafeMake'],
  ['Ref', 'makeUnsafe'],
  ['Deferred', 'unsafeMake'],
  ['Deferred', 'makeUnsafe'],
  ['Semaphore', 'make'],
  ['Semaphore', 'makeUnsafe'],
  ['TRef', 'unsafeMake'],
  ['TxRef', 'makeUnsafe'],
  ['ManagedRuntime', 'make'],
  ['Layer', 'toRuntime'],
  ['Context', 'Reference'],
] as const

// Class-based quarantine: `class X extends Context.Reference<X>()('id', { defaultValue })`.
// A Reference constructed at module scope is live state escaping a single interaction —
// exactly what the state cell exists to quarantine — so the cell may hold one.
export const PRIMITIVE_CLASS_SUPERS = [
  ['Context', 'Reference'],
] as const

export const RUNTIME_HANDLE_KINDS: ReadonlySet<string> = new Set(['ManagedRuntime.make', 'Layer.toRuntime'])

export const DEFAULT_EXPORT_PRIMITIVE_NAME = 'default export'
