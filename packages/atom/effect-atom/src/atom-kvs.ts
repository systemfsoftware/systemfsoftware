import type { LazyArg } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as KeyValueStore from 'effect/unstable/persistence/KeyValueStore'
import * as AsyncResult from './async-result.js'
import type { AtomResultFn } from './atom-constructors.js'
import {
  type Atom,
  type AtomContext,
  type AtomRuntime,
  type Writable,
  writable,
  type WriteContext,
} from './atom.blueprint.js'

type Top<A = unknown> = A

function readKvs<S extends Schema.ConstraintCodec<Top, Top>, Mode extends 'sync' | 'async'>(
  get: AtomContext,
  options: {
    readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, Top>
    readonly key: string
    readonly schema: S
    readonly defaultValue: LazyArg<S['Type']>
    readonly mode?: Mode | undefined
  },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  resultAtom: Atom<Top>,
  isWritten: () => boolean,
  setWritten: (written: boolean) => void,
): AsyncResult.Result<S['Type']> | S['Type'] {
  if (options.mode === 'async') {
    return readKvsAsync(get, options, setAtom, resultAtom, isWritten, setWritten)
  }
  return readKvsSync(get, options, setAtom, resultAtom, isWritten, setWritten)
}

function readKvsAsync<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: {
    readonly defaultValue: LazyArg<S['Type']>
  },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  resultAtom: Atom<Top>,
  isWritten: () => boolean,
  setWritten: (written: boolean) => void,
): AsyncResult.Result<S['Type']> {
  setWritten(false)
  get.mount(setAtom)
  get.subscribe(resultAtom, (result) => onKvsAsyncResult(get, options, setAtom, isWritten, result))
  return kvsAsyncValue(get, options, resultAtom)
}

function kvsHasStoreOption(result: unknown): result is AsyncResult.Success<Option.Option<Top>, Top> {
  if (AsyncResult.isResult(result) === false) {
    return false
  }
  return kvsSuccessHasOption(result)
}

function kvsSuccessHasOption(
  result: AsyncResult.Result<unknown, unknown>,
): result is AsyncResult.Success<Option.Option<Top>, Top> {
  if (AsyncResult.isSuccess(result) === false) {
    return false
  }
  return Option.isOption(result.value)
}

function kvsAsyncValue<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  resultAtom: Atom<Top>,
): AsyncResult.Result<S['Type']> {
  const result = get.once(resultAtom)
  if (kvsHasStoreOption(result) === false) {
    return AsyncResult.initial<S['Type']>()
  }
  return kvsAsyncFromOption(options, result.value)
}

function kvsAsyncFromOption<S extends Schema.ConstraintCodec<Top, Top>>(
  options: { readonly defaultValue: LazyArg<S['Type']> },
  value: Option.Option<Top>,
): AsyncResult.Result<S['Type']> {
  if (Option.isSome(value)) {
    return AsyncResult.success(value.value)
  }
  return AsyncResult.success(options.defaultValue())
}

function onKvsAsyncResult<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  isWritten: () => boolean,
  result: Top,
): void {
  if (isWritten()) {
    return
  }
  applyKvsAsyncResult(get, options, setAtom, result)
}

function applyKvsAsyncResult<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  result: Top,
): void {
  if (kvsHasStoreOption(result) === false) {
    return
  }
  applyKvsAsyncOption(get, options, setAtom, result.value)
}

function applyKvsAsyncOption<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  value: Option.Option<Top>,
): void {
  if (Option.isSome(value)) {
    get.setSelf(AsyncResult.success(value.value))
    return
  }
  const next = options.defaultValue()
  get.set(setAtom, next)
  get.setSelf(AsyncResult.success(next))
}

function readKvsSync<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  resultAtom: Atom<Top>,
  isWritten: () => boolean,
  setWritten: (written: boolean) => void,
): S['Type'] {
  setWritten(false)
  get.mount(setAtom)
  get.subscribe(resultAtom, (result) => onKvsSyncResult(get, options, setAtom, isWritten, result), { immediate: true })
  return Option.getOrElse(get.self<S['Type']>(), options.defaultValue)
}

function onKvsSyncResult<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  isWritten: () => boolean,
  result: Top,
): void {
  if (kvsHasStoreOption(result) === false) {
    return
  }
  applyKvsSyncOption(get, options, setAtom, isWritten, result.value)
}

function applyKvsSyncOption<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  isWritten: () => boolean,
  value: Option.Option<Top>,
): void {
  if (isWritten()) {
    return
  }
  applyKvsSyncValue(get, options, setAtom, value)
}

function applyKvsSyncValue<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  value: Option.Option<Top>,
): void {
  if (Option.isSome(value)) {
    get.setSelf(value.value)
    return
  }
  const next = Option.getOrElse(get.self<S['Type']>(), options.defaultValue)
  get.setSelf(next)
  get.set(setAtom, next)
}

function writeKvs<S extends Schema.ConstraintCodec<Top, Top>>(
  ctx: WriteContext<AsyncResult.Result<S['Type']> | S['Type']>,
  options: { readonly mode?: 'sync' | 'async' | undefined },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  value: S['Type'],
): void {
  ctx.set(setAtom, value)
  ctx.setSelf(kvsWrittenValue(options.mode, value))
}

function kvsWrittenValue<A>(mode: 'sync' | 'async' | undefined, value: A): AsyncResult.Result<A> | A {
  if (mode === 'async') {
    return AsyncResult.success(value)
  }
  return value
}

// -----------------------------------------------------------------------------
// KeyValueStore
// -----------------------------------------------------------------------------
/**
 * Creates a writable atom backed by a `KeyValueStore` entry.
 *
 * **Details**
 *
 * Values are encoded and decoded with the supplied schema. In sync mode the atom
 * exposes the decoded value and writes the default value when the key is missing;
 * in async mode it exposes an `AsyncResult` of the decoded value.
 *
 * **Gotchas**
 *
 * Error surfacing differs by mode. Async mode reports a failed store read as an
 * `AsyncResult.failure`; sync mode has no error channel on its bare value, so a
 * failed read renders the default value instead. Writes are optimistic in both
 * modes: the value is shown immediately and the store write is fired in the
 * background, so a write the store later refuses is not reflected in the atom.
 * Use async mode when store failures must be observable.
 *
 * @since 4.0.0
 */
export function kvs<S extends Schema.ConstraintCodec<Top, Top>, const Mode extends 'sync' | 'async' = never>(
  options: {
    readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, Top>
    readonly key: string
    readonly schema: S
    readonly defaultValue: LazyArg<S['Type']>
    readonly mode?: Mode | undefined
  },
): Writable<'async' extends Mode ? AsyncResult.Result<S['Type']> : S['Type'], S['Type']>
export function kvs<S extends Schema.ConstraintCodec<Top, Top>, const Mode extends 'sync' | 'async' = never>(
  options: {
    readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, Top>
    readonly key: string
    readonly schema: S
    readonly defaultValue: LazyArg<S['Type']>
    readonly mode?: Mode | undefined
  },
): Writable<AsyncResult.Result<S['Type']> | S['Type'], S['Type']> {
  const setAtom = options.runtime.fn(
    (value: S['Type']) =>
      KeyValueStore.KeyValueStore.use((store) =>
        KeyValueStore.toSchemaStore(store, options.schema).set(options.key, value)
      ),
  )
  const resultAtom = options.runtime.atom(
    KeyValueStore.KeyValueStore.use((store) => KeyValueStore.toSchemaStore(store, options.schema).get(options.key)),
  )
  let written = false
  return writable(
    (get): AsyncResult.Result<S['Type']> | S['Type'] =>
      readKvs(get, options, setAtom, resultAtom, () => written, (next) => {
        written = next
      }),
    (ctx, value: S['Type']) => {
      written = true
      writeKvs(ctx, options, setAtom, value)
    },
  )
}

// -----------------------------------------------------------------------------
// conversions
// -----------------------------------------------------------------------------
