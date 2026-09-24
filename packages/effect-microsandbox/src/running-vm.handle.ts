import { Handle } from '@systemfsoftware/effect-cell-types'
import { Effect, Option, Stream } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import type { Sandbox } from 'microsandbox'
import { ExecError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'
import type { PortBinding } from './render-sandbox-plan.schema.js'

export const TypeId = Symbol.for('~systemfsoftware/microvm/RunningVM')
export type TypeId = typeof TypeId

const RunningVM = Handle.make<
  { readonly name: string; readonly portBindings: ReadonlyArray<PortBinding> },
  Sandbox
>()(TypeId)

export type RunningVM = Handle.Of<typeof RunningVM>

export const isRunningVM = RunningVM.is

export interface ExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface LogLine {
  readonly source: string
  readonly text: string
}

export const make = (options: {
  readonly name: string
  readonly portBindings: ReadonlyArray<PortBinding>
  readonly sandbox: Sandbox
}): RunningVM => RunningVM.make({ name: options.name, portBindings: options.portBindings }, options.sandbox)

const hostPortOf = (bindings: ReadonlyArray<PortBinding>, guest: number) =>
  Option.map(
    Arr.findFirst(bindings, (binding) => binding.guest === guest),
    (binding) => binding.hostPort,
  )

export const port: {
  (guestPort: number): (self: RunningVM) => Effect.Effect<number, PortAllocationError>
  (self: RunningVM, guestPort: number): Effect.Effect<number, PortAllocationError>
} = dual(
  2,
  (self: RunningVM, guestPort: number): Effect.Effect<number, PortAllocationError> =>
    Effect.fromOption(
      hostPortOf(self.portBindings, guestPort),
      () =>
        new PortAllocationError({
          guestPort,
          cause: `Guest port ${guestPort} is not mapped to any host port on sandbox ${self.name}`,
        }),
    ),
)

const prefixSlash = (path: string) => {
  if (path.startsWith('/')) {
    return path
  }
  return `/${path}`
}

const normalizePath = (path: string | undefined) =>
  Option.match(Option.fromNullishOr(path), {
    onSome: prefixSlash,
    onNone: () => '',
  })
export const url: {
  (guestPort: number, path?: string): (self: RunningVM) => Effect.Effect<string, PortAllocationError>
  (self: RunningVM, guestPort: number, path?: string): Effect.Effect<string, PortAllocationError>
} = dual(
  (args) => isRunningVM(args[0]),
  (self: RunningVM, guestPort: number, path?: string): Effect.Effect<string, PortAllocationError> =>
    Effect.map(port(self, guestPort), (hostPort) => `http://127.0.0.1:${hostPort}${normalizePath(path)}`),
)

export const exec: {
  (cmd: string, args?: ReadonlyArray<string>): (self: RunningVM) => Effect.Effect<ExecResult, ExecError>
  (self: RunningVM, cmd: string, args?: ReadonlyArray<string>): Effect.Effect<ExecResult, ExecError>
} = dual(
  (args) => isRunningVM(args[0]),
  (self: RunningVM, cmd: string, args: ReadonlyArray<string> = []): Effect.Effect<ExecResult, ExecError> => {
    const argv = [cmd, ...args]
    return Effect.map(
      Effect.tryPromise({
        try: () => RunningVM.slot(self).exec(cmd, [...args]),
        catch: (cause) => new ExecError({ argv, cause }),
      }),
      (output): ExecResult => ({ code: output.status.code, stdout: output.stdout(), stderr: output.stderr() }),
    )
  },
)

export const logs = (self: RunningVM): Stream.Stream<LogLine, SandboxBootError> =>
  Stream.flatMap(
    Stream.fromEffect(
      Effect.tryPromise({
        try: () => RunningVM.slot(self).logStream({ follow: true }),
        catch: (cause) => new SandboxBootError({ sandboxName: self.name, cause }),
      }),
    ),
    (logStream) =>
      Stream.fromAsyncIterable(logStream, (cause) => new SandboxBootError({ sandboxName: self.name, cause })),
  ).pipe(
    Stream.map((entry): LogLine => ({ source: entry.source, text: entry.text() })),
  )

export const ping = (self: RunningVM): Effect.Effect<boolean> =>
  Effect.map(Effect.option(Effect.promise(() => RunningVM.slot(self).ping())), Option.isSome)

export const use: {
  <A>(f: (sandbox: Sandbox) => Promise<A>): (self: RunningVM) => Effect.Effect<A, SandboxBootError>
  <A>(self: RunningVM, f: (sandbox: Sandbox) => Promise<A>): Effect.Effect<A, SandboxBootError>
} = dual(
  2,
  <A>(self: RunningVM, f: (sandbox: Sandbox) => Promise<A>): Effect.Effect<A, SandboxBootError> =>
    Effect.tryPromise({
      try: () => f(RunningVM.slot(self)),
      catch: (cause) => new SandboxBootError({ sandboxName: self.name, cause }),
    }),
)

if (import.meta.vitest !== void 0) {
  // The test-only dependencies cannot be imported statically: `import.meta.vitest` is only
  // defined when vitest transforms this file, so a static import would land in the bundle.
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema } = await import('effect')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')
  const { GuestPort } = await import('./MicroVMSpec.schema.js')

  const declaredGuests = Schema.NonEmptyArray(GuestPort).pipe(Schema.check(Schema.isUnique()))
  const bindings = Arbitrary.map(
    Arbitrary.schema(declaredGuests),
    (guests) => guests.map((guest, index) => ({ guest, host: '127.0.0.1', hostPort: 49152 + index })),
  )
  const holdsAll = (clauses: ReadonlyArray<boolean>): boolean => clauses.every((clause) => clause)

  it.prop(
    '∀bg_PortLookup_≡Declared',
    { of: [bindings, GuestPort], subject: hostPortOf },
    (subject, [drawn, guest]) =>
      holdsAll([
        drawn.every((binding) => Option.contains(subject(drawn, binding.guest), binding.hostPort)),
        Option.match(subject(drawn, guest), {
          onNone: () => !drawn.some((binding) => binding.guest === guest),
          onSome: (hostPort) => drawn.some((binding) => binding.guest === guest && binding.hostPort === hostPort),
        }),
      ]),
  )

  it.prop(
    '∀p_PrefixSlash_≡Slashed',
    { of: [Schema.String], subject: prefixSlash },
    (subject, [path]) => subject(path) === (path.startsWith('/') ? path : `/${path}`),
  )

  it.prop(
    '∀p_PrefixSlash_=Idempotent',
    { of: [Schema.String], subject: prefixSlash },
    (subject, [path]) => subject(subject(path)) === subject(path),
  )

  it.prop(
    '∀p_Normalize_≡Prefix',
    { of: [Schema.String], subject: normalizePath },
    (subject, [path]) => subject(path) === prefixSlash(path) && subject(undefined) === '',
  )
}
