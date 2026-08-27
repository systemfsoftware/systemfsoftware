import { parse } from '@std/toml'
import { Context, Effect, Exit, Layer, MutableHashMap, Option, Ref, Schema, SchemaIssue } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import os from 'node:os'
import { Policy } from './Policy.schema.js'

const PROJECT_POLICY_FILE = 'systemfsoftware.toml'
const LOCAL_POLICY_FILE = 'systemfsoftware.local.toml'
const USER_POLICY_DIR = '.config/systemfsoftware'

const emptyPolicyExit = Schema.decodeExit(Policy)({})
const EMPTY_POLICY: Policy = Exit.match(emptyPolicyExit, {
  onFailure: () => {
    throw new Error('the empty record always satisfies the Policy schema')
  },
  onSuccess: (policy) => policy,
})

/**
 * Port: what the harness policy says. A plugin asks this capability; it never
 * learns where the answer came from. The live adapter below resolves the
 * layered `systemfsoftware.toml` files — that is one implementation, not the
 * port's contract.
 */
export class HarnessPolicy extends Context.Service<
  HarnessPolicy,
  {
    readonly load: (cwd: string) => Effect.Effect<Policy, PlatformError, never>
  }
>()('@systemfsoftware/effect-harness-policy/HarnessPolicy') {}

/**
 * Per-key merge for the layered policy.
 *
 * Precedence (gitconfig model): a later layer replaces a key's whole value;
 * arrays are NEVER concatenated. Folded left-to-right so `user → project →
 * local` gives `local` the final word.
 */
const mergeLayers = <V>(
  layers: readonly Readonly<Record<string, readonly V[]>>[],
): Record<string, readonly V[]> => {
  const out: Record<string, readonly V[]> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      out[key] = value
    }
  }
  return out
}

/**
 * One policy layer, fail-open: a missing file, an unreadable file, or a
 * document that does not decode all resolve to the empty policy.
 */
const readLayer = (
  fs: FileSystem.FileSystem,
  pathService: PathModule.Path,
  filePath: string,
): Effect.Effect<Policy, never, never> =>
  fs.exists(filePath).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs.readFileString(filePath).pipe(
          Effect.flatMap(parsePolicyText),
          Effect.orElseSucceed(() => EMPTY_POLICY),
        )
        : Effect.succeed(EMPTY_POLICY)
    ),
    Effect.orElseSucceed(() => EMPTY_POLICY),
  )
/** TOML text → `Policy`. The foreign parse is owned here, at the adapter's one boundary. */
const parsePolicyText = (text: string) =>
  Effect.try({
    try: () => parse(text),
    catch: (e) =>
      new SchemaIssue.InvalidValue({
        message: e instanceof Error ? `TOML parse error: ${e.message}` : 'TOML parse error',
      }),
  }).pipe(Effect.flatMap((parsed) => Schema.decodeUnknownEffect(Policy)(parsed)))

const userHomeAnchor = (): string => {
  const override = process.env['HARNESS_POLICY_HOME']
  return typeof override === 'string' && override.length > 0 ? override : os.homedir()
}

/**
 * Build the adapter for an explicit home. `HarnessPolicyLive` resolves the
 * anchor when the layer is built, so tests can point it at an isolated
 * directory via `HARNESS_POLICY_HOME` before building.
 */
const makeHarnessPolicy = (home: string) =>
  Effect.gen(function*() {
    const cache = yield* Ref.make(MutableHashMap.empty<string, Policy>())
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* PathModule.Path

    const userPath = pathService.join(home, USER_POLICY_DIR, PROJECT_POLICY_FILE)

    return HarnessPolicy.of({
      load: Effect.fn('HarnessPolicy.load')(function*(cwd: string) {
        const cached = yield* Ref.get(cache)
        const existing = MutableHashMap.get(cached, cwd)
        if (Option.isSome(existing)) return existing.value

        const projectPath = pathService.join(cwd, PROJECT_POLICY_FILE)
        const localPath = pathService.join(cwd, LOCAL_POLICY_FILE)

        const userLayer = yield* readLayer(fs, pathService, userPath)
        const projectLayer = yield* readLayer(fs, pathService, projectPath)
        const localLayer = yield* readLayer(fs, pathService, localPath)

        const merged = yield* Schema.decodeEffect(Policy)(
          mergeLayers([userLayer, projectLayer, localLayer]),
        ).pipe(Effect.orDie)

        yield* Ref.update(cache, (m) => (MutableHashMap.set(m, cwd, merged), m))
        return merged
      }),
    })
  })

/**
 * Live `HarnessPolicy` layer anchored at `HARNESS_POLICY_HOME` when set, else
 * `os.homedir()`, resolved at layer-build time.
 */
export const HarnessPolicyLive: Layer.Layer<HarnessPolicy, never, FileSystem.FileSystem | PathModule.Path> = Layer
  .effect(
    HarnessPolicy,
    Effect.flatMap(Effect.sync(userHomeAnchor), makeHarnessPolicy),
  )
