/**
 * The spawned worker child announces itself via TCP. A whole unit suite once
 * passed green while this child was stone dead: the defect only exists in the
 * BUILT artifact's module layout, where the bundler hoists the worker's
 * self-detecting entry guard into a shared chunk and `import.meta.url` can
 * never equal the spawned entry — so the child loads, constructs nothing, and
 * exits 0 with empty output, which the parent misreads as a crash. Unit tests
 * import `src/` and cannot see that seam; this gate spawns the real emitted
 * `dist/` entry exactly like `src/worker-pool/child-process-proxy.ts` does and
 * requires the TCP handshake.
 *
 * The entry is resolved by `require.resolve` on the package's own published
 * subpath `@systemfsoftware/stryker-js-mutation-run/child-process-proxy-worker-main`
 * — the same specifier the parent resolves at runtime. The subpath IS the
 * contract, so renaming the entry file moves this resolution with it and there
 * is no bundle-scanning pattern left to go stale. The gate then asserts the
 * resolved path ends in `.mjs` and lives under `dist/`; a resolution that falls
 * back to `src/` is a missing-build failure, not a passing gate.
 *
 * The built entry runs `main` unconditionally at module scope
 * (`void Effect.runPromise(main)`) with no `import.meta.url === process.argv[1]`
 * guard — that unconditional construction is the property this gate defends.
 * The observable bootstrap signal is the TCP CONNECTION ITSELF: the child opens
 * a `net.createConnection` to the parent's ephemeral port. It sends no
 * greeting; a connection within the deadline is the pass signal.
 */
import { fail } from 'node:assert'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

import { Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

const Feature = makeFeature({ it, layer })

// Warrant: regression guard for the built-artifact seam — only the emitted
// `dist/` layout can exhibit the hoisted-guard bug; unit tests import `src/`.
// Refusal check: not a tautology (the child is a real OS process whose TCP
// connect proves the entry's composition root executed), not a restatement of a
// constructor, and not covered by the type system. Trophy layer: integration/
// regression — drives the built artifact through the real `spawn` + TCP
// transport, exactly like the parent does.

/**
 * Upper bound on the handshake wait. This is the outermost deadline of the
 * gate: a healthy child connects in milliseconds, a dead child closes within
 * milliseconds. Real time is deliberate here — fake timers cannot drive the
 * clock of a spawned OS process; only the child itself can deliver
 * `connection`/`close`, and the deadline turns a hang into the `timedOut`
 * outcome the gate's diagnostic acts on.
 *
 * Genuine outermost deadline — its `timedOut` announcement propagates to the
 * scenario which fails with `announcementDiagnostic`. Human-paced product
 * timing is not involved; the stall IS the defect being guarded.
 * Deterministic time control cannot replace it: the awaited signal is a TCP
 * connection from a separate OS process, not a timer or microtask.
 */
// oxlint-disable-next-line no-magic-numbers
const HANDSHAKE_TIMEOUT_MS = 5_000

type Announcement =
  | { readonly kind: 'announced'; readonly entry: string; readonly message: unknown }
  | {
    readonly kind: 'closed'
    readonly entry: string
    readonly exitCode: number | null
    readonly signal: NodeJS.Signals | null
    readonly stdout: string
    readonly stderr: string
  }
  | { readonly kind: 'timedOut'; readonly entry: string; readonly stdout: string; readonly stderr: string }
  | {
    readonly kind: 'errored'
    readonly entry: string
    readonly error: Error
    readonly stdout: string
    readonly stderr: string
  }

/**
 * Resolves the entry the parent actually spawns, through the parent's own
 * exported resolver. Asserts the result is the BUILT artifact under `dist/`.
 */

const WORKER_MAIN_SPECIFIER = '@systemfsoftware/stryker-js-mutation-run/child-process-proxy-worker-main'

const resolveBuiltEntry = (): string => {
  // Resolve the worker entry through the package's own `exports` map, which is
  // exactly what the parent does (`resolveWorkerMainPath` in
  // `src/worker-pool/ipc-transport.ts` calls `require.resolve` on this same
  // specifier). Going through the published subpath rather than reaching into
  // `src` keeps this gate on the package's public surface, and the subpath IS
  // the contract — renaming the entry file moves this resolution with it, so
  // there is nothing here to go stale.
  let resolved: string
  try {
    resolved = createRequire(import.meta.url).resolve(WORKER_MAIN_SPECIFIER)
  } catch (cause) {
    throw new Error(
      `The worker entry subpath ${WORKER_MAIN_SPECIFIER} does not resolve. Rebuild with pnpm --filter @systemfsoftware/stryker-js-mutation-run exec tsdown.`,
      { cause },
    )
  }
  // `require.resolve` uses Node's conditions, so it lands on the `default`
  // export — the emitted `.mjs`. The assertion is what keeps the gate honest:
  // the regression it guards exists ONLY in the built module layout, so a run
  // that quietly resolved `src/*.ts` would prove nothing.
  const isMjs = resolved.endsWith('.mjs')
  const isDist = resolved.includes('dist/')
  if (!isMjs || !isDist) {
    throw new Error(
      `${WORKER_MAIN_SPECIFIER} resolved to ${
        JSON.stringify(resolved)
      }, which is not the BUILT artifact (endsWith .mjs: ${String(isMjs)}, includes dist/: ${
        String(isDist)
      }). This gate deliberately exercises the emitted module layout, so run pnpm --filter @systemfsoftware/stryker-js-mutation-run exec tsdown first. A gate that silently degrades to testing src/ is not a gate.`,
    )
  }
  if (!existsSync(resolved)) {
    throw new Error(
      `The built worker entry ${resolved} does not exist. Rebuild with pnpm --filter @systemfsoftware/stryker-js-mutation-run exec tsdown.`,
    )
  }
  return resolved
}

// Fixture subject module — `src/worker-pool/test-echo-worker.mjs` exports
// `TestEchoWorker` (verified by reading the file: `export const TestEchoWorker = { echo... }`).
const FIXTURE_MODULE_PATH = fileURLToPath(new URL('../src/worker-pool/test-echo-worker.mjs', import.meta.url))
const FIXTURE_NAMED_EXPORT = 'TestEchoWorker'

/** Terminates the spawned child and waits for its actual exit — no leaked processes. */
const killAndReap = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill()
  // Await the real exit signal, not a guessed delay: SIGTERM delivery is a
  // macrotask, so the `once` registration below cannot miss a termination
  // that happens in the same tick as the check above.
  await once(child, 'exit')
}

/**
 * Spawns the resolved BUILT entry exactly like the parent
 * (`src/worker-pool/child-process-proxy.ts`): same `spawn` shape, same argv
 * contract (modulePath, namedExport, port), same env shape (WORKER_IPC_PORT).
 * The parent awaits a TCP connection from the child; this helper does the same.
 * Resolves with the first settled signal — a TCP connection (pass), a close
 * without one, the deadline, or a spawn error — so the scenario can fail with
 * a full diagnostic instead of a bare assertion.
 *
 * NEVER passes port 0 — the entry returns immediately on 0 and the gate would
 * pass against a child that did nothing.
 */
const observeSpawnedWorker = async (entry: string): Promise<Announcement> => {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
    server.once('error', (cause: Error) => {
      reject(cause)
    })
  })
  const addr = server.address()
  if (addr === null || typeof addr === 'string') {
    server.close()
    throw new Error(`Expected TCP server address, got ${String(addr)}`)
  }
  const port = addr.port
  // Guard: ephemeral port must be non-zero; 0 would make the entry return
  // immediately and prove nothing.
  if (port === 0) {
    server.close()
    throw new Error('Ephemeral port unexpectedly 0 — entry would no-op')
  }

  const child = spawn(process.execPath, [entry, FIXTURE_MODULE_PATH, FIXTURE_NAMED_EXPORT, String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { STRYKER_MUTATOR_WORKER: '0', WORKER_IPC_PORT: String(port), ...process.env },
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdout += String(chunk)
  })
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderr += String(chunk)
  })

  return new Promise<Announcement>((resolve) => {
    let settled = false
    const settle = (announcement: Announcement): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.off('connection', onConnection)
      server.off('error', onServerError)
      child.off('close', onClose)
      child.off('error', onError)
      server.close()
      // Kill synchronously (before the promise settles) so the suite cannot
      // leak a live worker — on the healthy path the child `Effect.never`s
      // after connecting and must be killed.
      void killAndReap(child)
      resolve(announcement)
    }
    const onConnection = (socket: net.Socket): void => {
      // The observable bootstrap signal is the TCP connection itself — the
      // entry sends no greeting. A single connection proves the composition
      // root executed.
      socket.destroy()
      settle({ kind: 'announced', entry, message: `tcp-connected:${port}` })
    }
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      settle({ kind: 'closed', entry, exitCode: code, signal, stdout, stderr })
    }
    const onError = (error: Error): void => {
      settle({ kind: 'errored', entry, error, stdout, stderr })
    }
    const onServerError = (error: Error): void => {
      settle({ kind: 'errored', entry, error, stdout, stderr })
    }
    // Genuine outermost deadline — see HANDSHAKE_TIMEOUT_MS comment. Real
    // wall-clock time is required: the awaited signal is a TCP connection
    // from a spawned OS process, not a JS timer that fake timers can drive.
    const timer = setTimeout(() => {
      settle({ kind: 'timedOut', entry, stdout, stderr })
    }, HANDSHAKE_TIMEOUT_MS)
    server.once('connection', onConnection)
    server.once('error', onServerError)
    child.once('close', onClose)
    child.once('error', onError)
  })
}

const announcementDiagnostic = (
  announcement: Extract<Announcement, { kind: 'closed' | 'timedOut' | 'errored' }>,
): string => {
  const lines = [
    'The spawned worker child did not announce itself: the bootstrap did not execute.',
    `Spawned entry: ${announcement.entry}`,
    `Subject module: ${FIXTURE_MODULE_PATH} (export: ${FIXTURE_NAMED_EXPORT})`,
  ]
  switch (announcement.kind) {
    case 'closed':
      lines.push(
        'The child closed without establishing a TCP connection to the parent.',
        `Observed exit code: ${announcement.exitCode ?? 'null'} (signal: ${announcement.signal ?? 'null'})`,
        `Captured stdout: ${JSON.stringify(announcement.stdout)}`,
        `Captured stderr: ${JSON.stringify(announcement.stderr)}`,
      )
      break
    case 'timedOut':
      lines.push(
        `The child neither connected nor closed within ${HANDSHAKE_TIMEOUT_MS}ms.`,
        `Captured stdout: ${JSON.stringify(announcement.stdout)}`,
        `Captured stderr: ${JSON.stringify(announcement.stderr)}`,
      )
      break
    case 'errored':
      lines.push(`The spawn itself errored: ${announcement.error.message}`)
      break
  }
  lines.push(
    'Diagnosis: the emitted entry contains no composition root. When the bundler hoists a',
    'self-detecting guard (if (fileURLToPath(import.meta.url) === process.argv[1]) {',
    'new ChildProcessProxyWorker(createInjector) }) into a shared chunk that other entries also',
    'import, import.meta.url can never equal the spawned entry, so node loads the module,',
    'constructs nothing, and exits silently — with no TCP connection, the parent reports',
    'ChildProcessCrashedError / WorkerConnectTimeoutError. The entry must construct its worker',
    'unconditionally; a dedicated bootstrap entry (e.g. src/worker-pool/child-process-proxy-worker-main.ts)',
    'needs no guard because being executed as that entry IS the declaration. The observable',
    'bootstrap signal is the TCP CONNECTION ITSELF — the entry sends no greeting.',
  )
  return lines.join('\n')
}

Feature('The spawned worker child announces itself')
  .body(({ scenario }) => {
    scenario(
      'Should_EstablishTcpConnection_When_SpawnedAsTheBuiltEntry',
      Gherkin.Do.pipe(
        When('the built worker entry is spawned exactly like the parent does')(
          'announcement',
          () => Effect.tryPromise(() => observeSpawnedWorker(resolveBuiltEntry())),
        ),
        Then('the child established a TCP connection within the handshake window')((step) => {
          if (step.announcement.kind !== 'announced') {
            fail(announcementDiagnostic(step.announcement))
          }
        }),
      ),
    )
  })
