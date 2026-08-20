/**
 * The forked worker child announces itself. A whole unit suite once passed
 * green while this child was stone dead: the defect only exists in the BUILT
 * artifact's module layout, where the bundler hoists the worker's
 * self-detecting entry guard into a shared chunk and `import.meta.url` can
 * never equal the forked entry — so the child loads, constructs nothing, and
 * exits 0 with empty output, which the parent misreads as a crash. Unit tests
 * import `src/` and cannot see that seam; this gate forks the real emitted
 * `dist/` entry exactly like `src/worker-pool/child-process-proxy.ts` does and
 * requires the IPC handshake.
 *
 * The fork target is read out of the built parent chunk: the emitted
 * `childProcess.fork(fileURLToPath(new URL(..., import.meta.url)))` literal IS
 * the parent's resolution — nothing is hard-coded here, so a rename of the
 * entry (e.g. to `child-process-proxy-worker-main.mjs`) is followed
 * automatically and a stale legacy file cannot silently become the fork
 * target. The dist must exist, or the gate fails loudly.
 */
import { fail } from 'node:assert'
import childProcess from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

const Feature = makeFeature({ it, layer })

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))

/**
 * The parent's fork call as emitted into a built chunk:
 * `childProcess.fork(fileURLToPath(new URL("./<entry>.mjs", import.meta.url)), ...)`.
 */
const FORK_TARGET_PATTERN =
  /(?:childProcess\s*\.\s*)?fork\s*\(\s*fileURLToPath\s*\(\s*new URL\s*\(\s*(["'])(\.\/[^"']+\.mjs)\1\s*,\s*import\.meta\.url\s*\)\s*\)/g

/**
 * Upper bound on the handshake wait. This is the outermost deadline of the
 * gate: a healthy child announces in milliseconds, a dead child closes within
 * milliseconds. Real time is deliberate here — fake timers cannot drive the
 * clock of a forked OS process; only the child itself can deliver
 * `message`/`close`, and the deadline turns a hang into the `timedOut`
 * outcome the gate's diagnostic acts on.
 */
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

const collectMjsFiles = async (dir: string): Promise<readonly string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: Array<string> = []
  for (const entry of entries) {
    const fullPath = resolvePath(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectMjsFiles(fullPath)))
    } else if (entry.name.endsWith('.mjs')) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * Resolves the entry the parent actually forks, by reading the fork literal
 * out of the built parent chunk — the same module the parent executes and the
 * same resolution it performs at runtime. There is exactly one such call in
 * the whole bundle (checker and test-runner workers are subject modules
 * loaded by named export from a runtime-selected module path via
 * `ChildProcessProxy.create`, never forked).
 */
const resolveForkedEntry = async (): Promise<string> => {
  let chunks: readonly string[]
  try {
    chunks = await collectMjsFiles(DIST_DIR)
  } catch {
    throw new Error(
      `The built worker entry is missing: ${DIST_DIR} does not exist. This gate deliberately forks the BUILT artifact — the regression it guards only exists in the emitted module layout — so run pnpm --filter @systemfsoftware/stryker-js-mutation-run build first. A gate that skips when dist is absent is not a gate.`,
    )
  }
  const targets = new Set<string>()
  for (const chunkPath of chunks) {
    const chunk = await readFile(chunkPath, 'utf8')
    for (const match of chunk.matchAll(FORK_TARGET_PATTERN)) {
      const target = match[2]
      if (target !== undefined) {
        targets.add(target)
      }
    }
  }
  if (targets.size !== 1) {
    const found = [...targets].join(', ') || 'none'
    throw new Error(
      `Could not locate the worker fork call in the built chunks (found ${targets.size} candidate(s): ${found}). Expected exactly one childProcess.fork(fileURLToPath(new URL("./<entry>.mjs", import.meta.url)), ...) under ${DIST_DIR}. Rebuild with pnpm --filter @systemfsoftware/stryker-js-mutation-run build; if the bundler changed the emitted call shape, adjust FORK_TARGET_PATTERN in this test.`,
    )
  }
  const [target] = [...targets]
  if (target === undefined) {
    throw new Error(
      `Internal error: the fork-target set was validated to hold exactly one entry but yielded none under ${DIST_DIR}.`,
    )
  }
  const entryPath = resolvePath(DIST_DIR, target.slice(2))
  if (!existsSync(entryPath)) {
    throw new Error(
      `The fork target ${entryPath} is named by the built parent chunk but does not exist. The emitted entry map and the parent disagree — rebuild with pnpm --filter @systemfsoftware/stryker-js-mutation-run build.`,
    )
  }
  return entryPath
}

/** Terminates the forked child and waits for its actual exit — no leaked processes. */
const killAndReap = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill()
  // Await the real exit signal, not a guessed delay: SIGTERM delivery is a
  // macrotask, so the `once` registration below cannot miss a termination
  // that happens in the same tick as the check above.
  await once(child, 'exit')
}

/**
 * Forks the resolved entry exactly like the parent (`src/worker-pool/
 * child-process-proxy.ts`): same fork options, same env shape. Resolves with
 * the first settled signal — an IPC message (pass), a close without one, the
 * deadline, or a fork error — so the scenario can fail with a full
 * diagnostic instead of a bare assertion.
 */
const observeForkedWorker = (entry: string): Promise<Announcement> => {
  const child = childProcess.fork(entry, {
    silent: true,
    execArgv: [],
    env: { STRYKER_MUTATOR_WORKER: '0', ...process.env },
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk)
  })
  return new Promise<Announcement>((resolve) => {
    const settle = (announcement: Announcement): void => {
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('close', onClose)
      child.off('error', onError)
      // Kill synchronously (before the promise settles) so the suite cannot
      // leak a live worker — on the healthy path the child would otherwise
      // keep waiting for an Init message that never comes.
      void killAndReap(child)
      resolve(announcement)
    }
    const onMessage = (message: unknown): void => {
      settle({ kind: 'announced', entry, message })
    }
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      settle({ kind: 'closed', entry, exitCode: code, signal, stdout, stderr })
    }
    const onError = (error: Error): void => {
      settle({ kind: 'errored', entry, error, stdout, stderr })
    }
    const timer = setTimeout(() => {
      settle({ kind: 'timedOut', entry, stdout, stderr })
    }, HANDSHAKE_TIMEOUT_MS)
    child.once('message', onMessage)
    child.once('close', onClose)
    child.once('error', onError)
  })
}

const announcementDiagnostic = (
  announcement: Extract<Announcement, { kind: 'closed' | 'timedOut' | 'errored' }>,
): string => {
  const lines = [
    'The forked worker child did not announce itself: the bootstrap did not execute.',
    `Forked entry: ${announcement.entry}`,
  ]
  switch (announcement.kind) {
    case 'closed':
      lines.push(
        'The child closed without sending a single IPC message.',
        `Observed exit code: ${announcement.exitCode ?? 'null'} (signal: ${announcement.signal ?? 'null'})`,
        `Captured stdout: ${JSON.stringify(announcement.stdout)}`,
        `Captured stderr: ${JSON.stringify(announcement.stderr)}`,
      )
      break
    case 'timedOut':
      lines.push(
        `The child neither announced nor closed within ${HANDSHAKE_TIMEOUT_MS}ms.`,
        `Captured stdout: ${JSON.stringify(announcement.stdout)}`,
        `Captured stderr: ${JSON.stringify(announcement.stderr)}`,
      )
      break
    case 'errored':
      lines.push(`The fork itself errored: ${announcement.error.message}`)
      break
  }
  lines.push(
    'Diagnosis: the emitted entry contains no composition root. When the bundler hoists a',
    'self-detecting guard (if (fileURLToPath(import.meta.url) === process.argv[1]) {',
    'new ChildProcessProxyWorker(createInjector) }) into a shared chunk that other entries also',
    'import, import.meta.url can never equal the forked entry, so node loads the module,',
    'constructs nothing, and exits silently — with no handshake, the parent reports',
    'ChildProcessCrashedError. The entry must construct its worker unconditionally; a dedicated',
    'bootstrap entry (e.g. src/worker-pool/child-process-proxy-worker-main.ts) needs no guard',
    'because being executed as that entry IS the declaration.',
  )
  return lines.join('\n')
}

Feature('The forked worker child announces itself')
  .body(({ scenario }) => {
    scenario(
      'Should_SendTheReadyHandshake_When_ForkedAsTheBuiltEntry',
      Gherkin.Do.pipe(
        When('the built worker entry is forked exactly like the parent does')(
          'announcement',
          () => Effect.tryPromise(async () => observeForkedWorker(await resolveForkedEntry())),
        ),
        Then('the child sent at least one IPC message within the handshake window')((step) => {
          if (step.announcement.kind !== 'announced') {
            fail(announcementDiagnostic(step.announcement))
          }
        }),
      ),
    )
  })
