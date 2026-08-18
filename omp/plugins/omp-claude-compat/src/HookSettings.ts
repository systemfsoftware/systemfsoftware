import { Effect, Match, Option, Schema as S } from 'effect'
import type { BridgedEvent, MatcherReach } from './HookCatalog.js'
import {
  ALL_CLAUDE_CODE_EVENTS,
  BRIDGED_EVENTS,
  DISABLED_ALL_REASON,
  MATCHER_REACH,
  NON_EVALUABLE_MATCHERS,
  TOOL_EVENTS,
  UNBRIDGED_REASONS,
  UNRECOGNIZED_KEY_REASON,
  WRAPPED_SHADOW_REASON,
} from './HookCatalog.js'
import {
  type DisableSource,
  type HookCoverage,
  type HookCoverageRow,
  type HookEntry,
  type HookSettings,
  type SettingsAnalysisCommand,
  SettingsJSON,
  type SettingsSource,
} from './HookSettings.schema.js'

export const parseSettings = S.decodeUnknownExit(SettingsJSON)

// ── Settings analysis ──

const ALL_HOOK_EVENTS: readonly BridgedEvent[] = BRIDGED_EVENTS
type HookEvent = BridgedEvent

const asRecord = S.decodeUnknownOption(S.Record(S.String, S.Unknown))

interface HookRow {
  readonly matcher?: string | undefined
  readonly hooks: readonly { readonly type?: string | undefined }[]
}

const NO_ROWS: readonly HookRow[] = []

const asHookRows = S.decodeUnknownOption(
  S.Array(
    S.Struct({
      matcher: S.optional(S.String),
      hooks: S.Array(S.Struct({ type: S.optional(S.String) })).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
    }),
  ),
)

/**
 * Settings come in two shapes: wrapped (`{ hooks: { ... } }`) puts the group
 * namespace under `hooks`, flat puts it at the top level beside a legitimate
 * `disableAllHooks`.
 */
function settingsNamespace(json: unknown): Option.Option<{
  namespace: Record<string, unknown>
  outer: Record<string, unknown>
  isWrapped: boolean
}> {
  return Option.map(asRecord(json), (record) =>
    Option.match(asRecord(record['hooks']), {
      onNone: () => ({ namespace: record, outer: record, isWrapped: false }),
      onSome: (namespace) => ({ namespace, outer: record, isWrapped: true }),
    }))
}

/**
 * Settings keys and matcher values are authored by whoever wrote the file, and
 * the report prints them to a terminal. A control or format character in one
 * must not move the cursor, clear the screen, or forge a line of its own.
 */
const displayable = (value: string): string => value.replaceAll(/[\p{Cc}\p{Cf}]/gu, '\uFFFD')

const EMPTY_COVERAGE: HookCoverage = {
  unrecognized: [],
  notCarried: [],
  matcherNotEvaluable: [],
  matcherOutOfReach: [],
  shadowed: [],
  disabled: [],
}

const CATALOG_EVENTS: readonly string[] = ALL_CLAUDE_CODE_EVENTS
const UNBRIDGED_LOOKUP: Readonly<Record<string, string>> = UNBRIDGED_REASONS
const NON_EVALUABLE_LOOKUP: Readonly<Record<string, string>> = NON_EVALUABLE_MATCHERS
const IF_EVALUATING_EVENTS: readonly string[] = TOOL_EVENTS
const REACH_LOOKUP: Readonly<Record<string, Readonly<Record<string, MatcherReach>>>> = MATCHER_REACH

const declaredMatchers = (value: unknown): readonly string[] =>
  Option.getOrElse(asHookRows(value), () => NO_ROWS)
    .flatMap((row) => row.matcher === undefined ? [] : [row.matcher])

const declaresMatcher = (value: unknown): boolean => declaredMatchers(value).length > 0

const reachGap = (reach: MatcherReach): Option.Option<string> =>
  Match.value(reach).pipe(
    Match.tag('Reachable', () => Option.none<string>()),
    Match.tag('Partial', (out) => Option.some(out.reason)),
    Match.tag('Unreachable', (out) => Option.some(out.reason)),
    Match.exhaustive,
  )

/**
 * Why a configured key will not run, in input order. The classes are distinct
 * answers a user needs told apart: a key this catalog never heard of, a real
 * event this bridge does not carry, a hook whose matcher this bridge cannot
 * read, and a matcher that names a moment OMP cannot reach. Collapsing them is
 * what made the old report call a correct settings file wrong.
 */
function hookCoverage(json: unknown): HookCoverage {
  return Option.match(settingsNamespace(json), {
    onNone: () => EMPTY_COVERAGE,
    onSome: ({ isWrapped, namespace, outer }) => {
      const unrecognized: HookCoverageRow[] = []
      const notCarried: HookCoverageRow[] = []
      const matcherNotEvaluable: HookCoverageRow[] = []
      const matcherOutOfReach: HookCoverageRow[] = []
      const shadowed: HookCoverageRow[] = []

      for (const event of Object.keys(namespace)) {
        if (!isWrapped && event === 'disableAllHooks') continue

        const unbridged = UNBRIDGED_LOOKUP[event]
        if (unbridged !== undefined) {
          notCarried.push({ event: displayable(event), reason: unbridged })
          continue
        }
        if (!CATALOG_EVENTS.includes(event)) {
          unrecognized.push({ event: displayable(event), reason: UNRECOGNIZED_KEY_REASON })
          continue
        }
        const unreadable = NON_EVALUABLE_LOOKUP[event]
        if (unreadable !== undefined && declaresMatcher(namespace[event])) {
          matcherNotEvaluable.push({ event: displayable(event), reason: unreadable })
        }
        const reach = REACH_LOOKUP[event]
        if (reach === undefined) continue
        matcherOutOfReach.push(
          ...declaredMatchers(namespace[event]).flatMap((matcher): readonly HookCoverageRow[] => {
            const value = reach[matcher]
            if (value === undefined) return []
            return Option.match(reachGap(value), {
              onNone: (): readonly HookCoverageRow[] => [],
              onSome: (reason) => [
                { event: `${displayable(event)} (matcher "${displayable(matcher)}")`, reason },
              ],
            })
          }),
        )
      }

      // A wrapped file still parses if a hook group sits at the top level too,
      // and both the loader and the loop above read only the wrapped namespace.
      if (isWrapped) {
        for (const event of Object.keys(outer)) {
          if (!CATALOG_EVENTS.includes(event)) continue
          shadowed.push({ event: displayable(event), reason: WRAPPED_SHADOW_REASON })
        }
      }

      return { unrecognized, notCarried, matcherNotEvaluable, matcherOutOfReach, shadowed, disabled: [] }
    },
  })
}

/**
 * Hooks a settings file switches off, which the per-file scan above cannot see:
 * `disableAllHooks` in any non-managed file drops the hooks of every other
 * non-managed file, so a hook can vanish because of a file its author never
 * opened. The merge is the only place that decision exists.
 */
function disabledCoverage(sources: readonly DisableSource[]): readonly HookCoverageRow[] {
  const disabler = sources.find((s) => !s.managed && s.settings.disableAllHooks === true)
  if (disabler === undefined) return []
  const reason = `${DISABLED_ALL_REASON} ${displayable(disabler.label)}`
  return sources.filter((source) => !source.managed).flatMap((source) =>
    ALL_HOOK_EVENTS.filter((event) => source.settings.hooks[event].length > 0)
      .map((event) => ({ event, reason }))
  )
}

/** Hook transports present in the settings that the dispatcher will skip. */
function unsupportedHookTypes(json: unknown): readonly string[] {
  return Option.match(settingsNamespace(json), {
    onNone: () => [],
    onSome: ({ namespace }) => {
      const found = new Set<string>()
      for (const event of ALL_HOOK_EVENTS) {
        const rows = Option.getOrElse(asHookRows(namespace[event]), () => NO_ROWS)
        for (const row of rows) {
          for (const hook of row.hooks) {
            if (hook.type !== undefined && hook.type !== 'command') found.add(displayable(hook.type))
          }
        }
      }
      return Array.from(found)
    },
  })
}

/**
 * Resolve one effective hook set. Claude Code protects managed hooks: a
 * `disableAllHooks` outside managed settings must not switch them off, and only
 * a managed one turns everything off. Disabling is settled here, so no caller
 * downstream has to re-check it.
 */
function mergeSettings(sources: readonly SettingsSource[]): HookSettings {
  /**
   * Annotation and `satisfies` guard opposite directions: a bridged event with
   * no `HookGroups` field fails the annotation, a `HookGroups` field no longer
   * bridged fails the `satisfies`. Either way the mismatch is a type error
   * rather than an event whose hooks silently stop being merged.
   */
  const hooks: Record<HookEvent, HookEntry[]> = {
    PreToolUse: [],
    PostToolUse: [],
    PostToolUseFailure: [],
    UserPromptSubmit: [],
    SessionStart: [],
    SessionEnd: [],
    Stop: [],
    PreCompact: [],
    PostCompact: [],
  } satisfies Record<keyof HookSettings['hooks'], HookEntry[]>
  if (sources.some((s) => s.managed && s.settings.disableAllHooks === true)) return { hooks }
  const disabledDownstream = sources.some((s) => !s.managed && s.settings.disableAllHooks === true)

  for (const source of sources) {
    if (disabledDownstream && !source.managed) continue
    for (const event of ALL_HOOK_EVENTS) {
      hooks[event] = hooks[event].concat(Array.from(source.settings.hooks[event]))
    }
  }

  return { hooks }
}

type SettingsAnalysisValue =
  | HookSettings
  | HookCoverage
  | readonly HookCoverageRow[]
  | readonly string[]
  | boolean

function analyzeSettingsCommand(cmd: SettingsAnalysisCommand): SettingsAnalysisValue {
  return Match.value(cmd).pipe(
    Match.tag('Merge', ({ sources }) => mergeSettings(sources)),
    Match.tag('Coverage', ({ json }) => hookCoverage(json)),
    Match.tag('DisabledCoverage', ({ sources }) => disabledCoverage(sources)),
    Match.tag('UnsupportedHookTypes', ({ json }) => unsupportedHookTypes(json)),
    Match.tag('MatcherUnreadable', ({ event }) => NON_EVALUABLE_LOOKUP[event] !== undefined),
    Match.tag('IfEvaluatingEvent', ({ event }) => IF_EVALUATING_EVENTS.includes(event)),
    Match.exhaustive,
  )
}

/**
 * Run one settings-analysis operation. The caller names the result schema so
 * the command's result type is checked against the value it actually returns.
 */
export function analyzeSettings<A>(
  cmd: SettingsAnalysisCommand,
  resultSchema: S.ConstraintDecoder<A>,
): A {
  return S.decodeUnknownSync(resultSchema)(analyzeSettingsCommand(cmd))
}
