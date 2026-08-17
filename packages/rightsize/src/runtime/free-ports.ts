/**
 * FreePorts — the in-process host-port allocator (R7). The core invariant of
 * the library is that host ports are chosen BEFORE boot by an in-process
 * allocator; a backend binds what it is given and never allocates its own.
 *
 * The kernel half is pure: given the ordered candidate ports and the
 * allocator's observed state (issued + busy), it names the next port to try
 * and derives the successor states. The adapter half is the effectful edge —
 * the bind-check (`net` listen/close on 127.0.0.1, the same conservative
 * loopback-only choice upstream makes everywhere) and the allocation loop
 * that drives the kernel until `count` ports are issued or the attempt
 * budget for a port is spent.
 *
 * Two guarantees, matching upstream `src/core/free-ports.ts`:
 * - in-process uniqueness: a port is never returned twice while still
 *   issued (allocation checks the issued set before every return);
 * - `release` of a port this process never issued is a harmless no-op, and
 *   a released port becomes allocatable again.
 *
 * The bind-check runs at allocation time, so a port another process grabbed
 * mid-flight is caught by the check, not assumed; the launch workflow's
 * conflict-retry loop (U4) remains the mitigation for the bind-then-use
 * window, exactly as upstream documents.
 */
import { Effect, HashSet, Schema as S } from 'effect'
import * as net from 'node:net'

// =============================================================================
// Pure kernel
// =============================================================================

/** The allocator's observed state: every port issued (not yet released) and every candidate observed busy this process. */
export interface FreePortState {
  /** Host ports currently issued to callers. */
  readonly issued: HashSet.HashSet<number>
  /** Candidate ports a bind-check observed occupied. */
  readonly busy: HashSet.HashSet<number>
}

/** The empty state — no ports issued, no observations. */
export const emptyFreePortState = (): FreePortState => ({ issued: HashSet.empty(), busy: HashSet.empty() })

/**
 * The ordered candidate ports in `[min, max]`, ascending. Callers choose the
 * range; the allocator never fabricates ports outside it.
 */
export const hostPortRange = (min: number, max: number): ReadonlyArray<number> => {
  const ports: Array<number> = []
  for (let port = Math.trunc(min); port <= Math.trunc(max); port++) {
    ports.push(port)
  }
  return ports
}

/**
 * The pure decision: the first candidate not yet issued and not observed
 * busy — i.e. the next port worth a bind-check. `undefined` means the
 * candidate pool is exhausted given the observed state.
 */
export const nextCandidate = (candidates: ReadonlyArray<number>, state: FreePortState): number | undefined =>
  candidates.find((port) => !HashSet.has(state.issued, port) && !HashSet.has(state.busy, port))

/** The state with `port` issued. The kernel guard (never issued twice) is the caller's invariant. */
export const withIssued = (state: FreePortState, port: number): FreePortState => ({
  issued: HashSet.add(state.issued, port),
  busy: state.busy,
})

/** The state with `port` recorded busy. */
export const withBusy = (state: FreePortState, port: number): FreePortState => ({
  issued: state.issued,
  busy: HashSet.add(state.busy, port),
})

/** The state with `port` released — removing a port that was never issued is a harmless no-op. */
export const withReleased = (state: FreePortState, port: number): FreePortState => ({
  issued: HashSet.remove(state.issued, port),
  busy: state.busy,
})

// =============================================================================
// Effect edge — bind-check + allocation loop
// =============================================================================

/** Broken attempts for one port before giving up (upstream's budget). */
export const MAX_ALLOCATE_ATTEMPTS = 100

/** The loopback host every bind-check and publish binds to. */
export const BIND_HOST = '127.0.0.1'

/**
 * The bind-check: `true` when a server can actually bind `BIND_HOST:port`
 * right now (loopback only — the same conservative choice upstream makes for
 * publishing and wait probes). Any bind failure scores `false`; a port held
 * by another process is simply occupied.
 */
export const isPortFree = (port: number): Effect.Effect<boolean> => {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const server = net.createServer()
  server.once('error', () => {
    server.close()
    resolve(false)
  })
  server.listen(port, BIND_HOST, () => {
    server.close(() => {
      resolve(true)
    })
  })
  return Effect.promise(() => promise)
}

/** The bind-check the allocation loop drives; tests inject recorded verdicts. */
export type BindCheck = (port: number) => Effect.Effect<boolean>

/** The live bind-check; the default for `allocate`. */
export const realBindCheck: BindCheck = isPortFree

/**
 * The OS's own free-port oracle: bind `0` on loopback, read the chosen port,
 * close. `undefined` on a bind failure (extremely rare on loopback); the
 * allocation loop counts it as an attempt and tries again.
 */
const ephemeralPort = (): Effect.Effect<number | undefined> => {
  const { promise, resolve } = Promise.withResolvers<number | undefined>()
  const server = net.createServer()
  server.once('error', () => {
    server.close()
    resolve(undefined)
  })
  server.listen(0, BIND_HOST, () => {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      server.close()
      resolve(undefined)
      return
    }
    const port = address.port
    server.close(() => {
      resolve(port)
    })
  })
  return Effect.promise(() => promise)
}

/** The allocator's options. Every knob exists so the kernel's decision is testable against recorded verdicts. */
export interface AllocateOptions {
  /**
   * The candidate pool to hunt over, in priority order. Default: an
   * OS-chosen ephemeral port per attempt (the upstream mechanism — the OS
   * knows a port is free at bind time, and the issued-set check backs out
   * of the rare duplicate the OS hands back).
   */
  readonly candidates?: ReadonlyArray<number> | undefined
  /** Overrides the bind-check effect (tests inject recorded verdicts). */
  readonly bindCheck?: BindCheck | undefined
  /** Attempt budget per candidate slot; default `MAX_ALLOCATE_ATTEMPTS`. */
  readonly maxAttempts?: number | undefined
}

/** The attempt budget for a candidate was spent without a free candidate. */
export class FreePortExhaustedError extends S.TaggedError<FreePortExhaustedError>()('FreePortExhaustedError', {
  requested: S.Finite,
  allocated: S.Array(S.Finite),
}) {}

// One process-wide allocator state (as upstream), written only by the
// allocation loop and the release edge.
let pool: FreePortState = emptyFreePortState()

/** The allocator's promise chain — the same withChain pattern as the hygiene ledger. */
let chain: Promise<void> = Promise.resolve()

/** Runs `fn` behind the process-wide chain: failures do not poison the chain. */
function withChain<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/** Runs an effect inside the chain — the allocator's entire check-bind-issue region is one critical section, so two concurrent allocate fibers can never double-issue a port across the bind-check suspension. */
const withExclusive = (
  effect: Effect.Effect<ReadonlyArray<number>, FreePortExhaustedError>,
): Effect.Effect<ReadonlyArray<number>, FreePortExhaustedError> =>
  Effect.tryPromise({
    try: () => withChain(() => Effect.runPromise(effect)),
    catch: (error) =>
      S.is(FreePortExhaustedError)(error)
        ? error
        : FreePortExhaustedError.make({ requested: 1, allocated: [] }),
  })

/**
 * Allocates `count` host ports, never handing the same port out twice while
 * it is issued. Each port is bind-checked before issue; a busy candidate is
 * recorded and the next candidate tried, up to `maxAttempts` per candidate.
 * On exhaustion the ports already allocated in this call are released back
 * to the pool before the typed failure is returned — a failed batch must not
 * leak allocations (R7: ports release on every failure path).
 *
 * The whole body runs under the process-wide chain: the issue-check, the
 * bind-check's suspension, and the issue itself are serialized, so two
 * concurrent allocate fibers can never observe the same port un-issued and
 * both hand it out (the FREEPORTS race).
 */
export const allocate = (count = 1, options: AllocateOptions = {}): Effect.Effect<
  ReadonlyArray<number>,
  FreePortExhaustedError
> =>
  withExclusive(
    Effect.gen(function*() {
      const bindCheck = options.bindCheck ?? realBindCheck
      const maxAttempts = options.maxAttempts ?? MAX_ALLOCATE_ATTEMPTS
      const allocated: Array<number> = []
      for (let slot = 0; slot < count; slot++) {
        let attempts = 0
        let issued: number | undefined
        while (issued === undefined) {
          attempts++
          if (attempts > maxAttempts) {
            for (const port of allocated) {
              pool = withReleased(pool, port)
            }
            return yield* FreePortExhaustedError.make({ requested: count, allocated: [...allocated] })
          }
          const port = options.candidates === undefined
            ? yield* ephemeralPort()
            : nextCandidate(options.candidates, pool)
          if (port === undefined) {
            continue // candidate pool drained or ephemeral bind failed; count the attempt
          }
          if (HashSet.has(pool.issued, port)) {
            continue // already issued to a caller; never hand it out twice
          }
          if (yield* bindCheck(port)) {
            pool = withIssued(pool, port)
            issued = port
          } else {
            pool = withBusy(pool, port)
          }
        }
        allocated.push(issued)
      }
      return allocated
    }),
  )

/**
 * Releases a port back to the pool. Releasing a port never issued by this
 * process is a harmless no-op; a released port becomes allocatable again.
 */
export const release = (port: number): Effect.Effect<void> =>
  Effect.sync(() => {
    pool = withReleased(pool, port)
  })

/** Test-only observability: the ports currently considered issued. */
export const issuedView = (): ReadonlySet<number> => new Set(pool.issued)

/** The upstream-shaped facade: allocate/release/issuedView. */
export const FreePorts = {
  /** Allocates `count` host ports this process has not already handed out. */
  allocate,
  /** Releases a port back to the pool — see `release`. */
  release,
  /** Test-only observability seam — see `issuedView`. */
  issuedView,
}
