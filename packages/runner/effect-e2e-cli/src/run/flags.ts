/// <reference types="vitest/importMeta" />
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

import { RUN_OVERRIDE_ENV } from '@systemfsoftware/effect-e2e'

import { RunRefused } from './run-failure.schema.js'

/** The reporters `effect-e2e run` renders after the run (requirements FR-10). */
export const REPORTERS = ['list', 'json', 'junit', 'markdown'] as const
export type Reporter = typeof REPORTERS[number]

/** The trace modes the config carries, as the `--trace` flag names them. */
export const TRACE_MODES = ['off', 'on', 'retain-on-failure'] as const
export type TraceMode = typeof TRACE_MODES[number]

/** The flags `effect-e2e run` parses, before they are mapped onto the run (design §15.2). */
export interface RunFlagValues {
  readonly target: Option.Option<string>
  readonly agent: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly reporter: Reporter
  readonly noCache: boolean
  readonly strictCache: boolean
  readonly workers: Option.Option<number>
  readonly retries: Option.Option<number>
  readonly timeout: Option.Option<number>
  readonly output: Option.Option<string>
  readonly trace: Option.Option<TraceMode>
  readonly lastFailed: boolean
  readonly files: ReadonlyArray<string>
}

/** The Vitest options the flags carry: pool width, per-test retries, tag selection, and the whole-test deadline. */
export interface VitestChannels {
  readonly maxWorkers?: number
  readonly retry?: number
  readonly tagsFilter?: Array<string>
  readonly testTimeout?: number
}

/** Where each flag lands: the suite environment, the Vitest options, and the run's own choices. */
export interface RunChannels {
  readonly env: Readonly<Record<string, string>>
  readonly vitest: VitestChannels
  readonly reporter: Reporter
  readonly lastFailed: boolean
  readonly files: ReadonlyArray<string>
}

const entryOf = (name: string) => (value: Option.Option<string>): ReadonlyArray<readonly [string, string]> =>
  Option.match(value, { onNone: () => [], onSome: (held) => [[name, held]] })

const whenTrue = (holds: boolean, value: string): Option.Option<string> => holds ? Option.some(value) : Option.none()

const cacheValueOf = (noCache: boolean, strictCache: boolean): Option.Option<string> =>
  Option.orElse(whenTrue(noCache, 'off'), () => whenTrue(strictCache, 'read-only'))

const envOf = (flags: RunFlagValues): Readonly<Record<string, string>> =>
  Object.fromEntries([
    ...entryOf(RUN_OVERRIDE_ENV.target)(flags.target),
    ...entryOf(RUN_OVERRIDE_ENV.agent)(flags.agent),
    ...entryOf(RUN_OVERRIDE_ENV.cache)(cacheValueOf(flags.noCache, flags.strictCache)),
    ...entryOf(RUN_OVERRIDE_ENV.timeout)(Option.map(flags.timeout, String)),
    ...entryOf(RUN_OVERRIDE_ENV.output)(flags.output),
    ...entryOf(RUN_OVERRIDE_ENV.trace)(flags.trace),
  ])

const keyed = <K extends keyof VitestChannels>(key: K) => (value: Option.Option<VitestChannels[K]>): VitestChannels =>
  Option.match(value, { onNone: () => ({}), onSome: (held) => ({ [key]: held }) })

const vitestOf = (flags: RunFlagValues): VitestChannels => ({
  ...keyed('maxWorkers')(flags.workers),
  ...keyed('retry')(flags.retries),
  ...keyed('tagsFilter')(Option.map(flags.tag, (tag) => [tag])),
  ...keyed('testTimeout')(flags.timeout),
})

const CACHE_CONFLICT = '--no-cache and --strict-cache both choose the cache mode; pass one'
const SELECTION_CONFLICT = '--last-failed selects the previous failures; pass either it or file filters, not both'

const when = (holds: boolean, message: string): ReadonlyArray<string> => holds ? [message] : []

const bothCacheModes = (flags: RunFlagValues): boolean => flags.noCache && flags.strictCache

const lastFailedWithFiles = (flags: RunFlagValues): boolean => flags.lastFailed && flags.files.length > 0

const refusalsOf = (flags: RunFlagValues): ReadonlyArray<string> => [
  ...when(bothCacheModes(flags), CACHE_CONFLICT),
  ...when(lastFailedWithFiles(flags), SELECTION_CONFLICT),
]

const channelsAt = (flags: RunFlagValues): RunChannels => ({
  env: envOf(flags),
  vitest: vitestOf(flags),
  reporter: flags.reporter,
  lastFailed: flags.lastFailed,
  files: flags.files,
})

/**
 * Maps the parsed flags onto the run (design §15.2): the suite environment the CLI writes before starting Vitest,
 * the Vitest options it overrides, and the reporter it renders after. Flags that cannot hold together refuse
 * before anything starts.
 */
export const channelsOf = (flags: RunFlagValues): Result.Result<RunChannels, RunRefused> =>
  Arr.match(refusalsOf(flags), {
    onEmpty: () => Result.succeed(channelsAt(flags)),
    onNonEmpty: (messages) => Result.fail(new RunRefused({ message: messages.join('; ') })),
  })

if (import.meta.vitest !== void 0) {
  // tsdown defines `import.meta.vitest` as `undefined`, so a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema } = await import('effect')

  const none = <A>(): Option.Option<A> => Option.none()

  const unset = (reporter: Reporter): RunFlagValues => ({
    target: none(),
    agent: none(),
    tag: none(),
    reporter,
    noCache: false,
    strictCache: false,
    workers: none(),
    retries: none(),
    timeout: none(),
    output: none(),
    trace: none(),
    lastFailed: false,
    files: [],
  })

  const NO_CHANNELS: RunChannels = { env: {}, vitest: {}, reporter: 'list', lastFailed: false, files: [] }

  const succeeded = (decided: Result.Result<RunChannels, RunRefused>): RunChannels =>
    Result.match(decided, { onFailure: () => NO_CHANNELS, onSuccess: (channels) => channels })

  it.prop(
    '∀r_UnsetFlags_≡NoEnvAndTheReporter',
    { of: [Schema.Literals([...REPORTERS])], subject: channelsOf },
    (channels, [reporter]) => {
      const decided = succeeded(channels(unset(reporter)))
      return decided.reporter === reporter && Object.keys(decided.env).length === 0
    },
  )

  it.prop(
    '∀s_TargetFlag_≡ItsEnvEntry',
    { of: [Schema.String], subject: channelsOf },
    (channels, [target]) => {
      const decided = succeeded(channels({ ...unset('list'), target: Option.some(target) }))
      return decided.env[RUN_OVERRIDE_ENV.target] === target
    },
  )

  it.prop(
    '∀s_TagFlag_≡ItsTagsFilter',
    { of: [Schema.String], subject: channelsOf },
    (channels, [tag]) => {
      const decided = succeeded(channels({ ...unset('list'), tag: Option.some(tag) }))
      return decided.vitest.tagsFilter?.[0] === tag
    },
  )

  it.prop(
    '∀n_TimeoutFlag_≡StringEnvAndNumberDeadline',
    { of: [Schema.Int], subject: channelsOf },
    (channels, [milliseconds]) => {
      const decided = succeeded(channels({ ...unset('list'), timeout: Option.some(milliseconds) }))
      return decided.env[RUN_OVERRIDE_ENV.timeout] === String(milliseconds) &&
        decided.vitest.testTimeout === milliseconds
    },
  )

  it.prop(
    '∀b_NoCacheFlag_≡OffOrUnset',
    { of: [Schema.Boolean], subject: channelsOf },
    (channels, [noCache]) => {
      const decided = succeeded(channels({ ...unset('list'), noCache }))
      return decided.env[RUN_OVERRIDE_ENV.cache] === (noCache ? 'off' : undefined)
    },
  )

  it.prop(
    '∀x,y_BothCacheModes_≡RefusedExactlyWhenBoth',
    { of: [Schema.Boolean, Schema.Boolean], subject: channelsOf },
    (channels, [noCache, strictCache]) =>
      Result.isFailure(channels({ ...unset('list'), noCache, strictCache })) === (noCache && strictCache),
  )

  it.prop(
    '∀s_LastFailedWithFiles_≡RefusedOnlyTogether',
    { of: [Schema.String], subject: channelsOf },
    (channels, [file]) =>
      Result.isFailure(channels({ ...unset('list'), lastFailed: true, files: [file] })) &&
      Result.isSuccess(channels({ ...unset('list'), files: [file] })),
  )
}
