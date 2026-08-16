/**
 * Leaf-context — handler integration test.
 *
 * A real memfs fixture tree and the recording `ExtensionAPI` harness stand in
 * for the host (there is no OMP runtime in the test process). Each scenario
 * fires synthetic `tool_call` / `tool_result` pairs and asserts on the
 * recorded result modification — the exact surface a live agent would see.
 */
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import type { LeafFs } from '../src/leaf-context.executor.js'
import { buildSession, memfsLeafFs, SESSION_A, SESSION_B } from './leaf-context-fixture.observer.js'

const Feature = makeFeature({ it, layer })

const ATOM_LEAF = '# AGENTS.md — effect-atom/\n\nOwned atom/atom-react.\n'
const MEMFS_LEAF = '# AGENTS.md — effect-memfs/\n\nOwned memfs port.\n'
const REPOS_AGENTS = '# vendored tree\n\nRead-only third-party reference.\n'
const BIG_LEAF = `# big leaf\n\n${'line of guidance\n'.repeat(700)}`

const PROJECT_ROOT = '/project'

const TREE: Record<string, string> = {
  [`${PROJECT_ROOT}/packages/effect-atom/AGENTS.md`]: ATOM_LEAF,
  [`${PROJECT_ROOT}/packages/effect-atom/src/index.ts`]: 'export const atom = 1\n',
  [`${PROJECT_ROOT}/packages/effect-atom/src/other.ts`]: 'export const other = 2\n',
  [`${PROJECT_ROOT}/packages/effect-memfs/AGENTS.md`]: MEMFS_LEAF,
  [`${PROJECT_ROOT}/packages/effect-memfs/src/index.ts`]: 'export const mem = 1\n',
  [`${PROJECT_ROOT}/packages/oxlint-plugins/AGENTS.md`]: BIG_LEAF,
  [`${PROJECT_ROOT}/packages/oxlint-plugins/core/src/index.ts`]: 'export const core = 1\n',
  [`${PROJECT_ROOT}/repos/oh-my-pi/AGENTS.md`]: REPOS_AGENTS,
  [`${PROJECT_ROOT}/repos/oh-my-pi/packages/coding-agent/src/discovery/agents-md.ts`]: 'export const discover = 1\n',
  [`${PROJECT_ROOT}/README.md`]: '# project\n',
}

const lastText = (result: unknown): string => {
  if (result === undefined) return ''
  const modified = result as { readonly content: readonly { type: 'text'; text: string }[] }
  const last = modified.content[modified.content.length - 1]
  return last === undefined ? '' : last.text
}

const readCall = (toolCallId: string, target: string) => ({
  type: 'tool_call' as const,
  toolName: 'read',
  toolCallId,
  input: { path: target },
})

const editCall = (toolCallId: string, target: string) => ({
  type: 'tool_call' as const,
  toolName: 'edit',
  toolCallId,
  input: { file_path: target },
})

const readResult = (toolCallId: string, content: string): Record<string, unknown> => ({
  type: 'tool_result',
  toolName: 'read',
  toolCallId,
  input: {},
  content: [{ type: 'text', text: content }],
  isError: false,
})

/**
 * Registers one or more sessions against a SINGLE handler module — the host
 * imports each plugin entry once per session, so per-session state (the
 * injected map) lives in the module; scenarios share one instance to exercise
 * it. `vi.resetModules` gives each scenario a fresh module: this is the
 * module-loading-boundary exception (tests intentionally reproduce the host's
 * per-session import semantics).
 */
const setupSessions = async (
  sessionIds: readonly string[],
  fs?: LeafFs,
): Promise<ReturnType<typeof buildSession>[]> => {
  vi.resetModules()
  const mod = await import('../src/leaf-context.handler.js')
  const { runSafe } = await import('../src/run-safe.policy.js')
  const treeFs = memfsLeafFs(TREE)
  return sessionIds.map((id) => {
    const session = buildSession({ sessionId: id, cwd: PROJECT_ROOT })
    mod.LeafContextExtension(session.api as never, runSafe, fs ?? treeFs)
    return session
  })
}

/** Index guard: `noUncheckedIndexedAccess` forces the undefined check. */
const requireSession = (
  sessions: readonly ReturnType<typeof buildSession>[],
  index: number,
  label: string,
): ReturnType<typeof buildSession> => {
  const session = sessions[index]
  if (session === undefined) throw new Error(`expected a session at '${label}'`)
  return session
}

const fireReadPair = async (
  session: ReturnType<typeof buildSession>,
  toolCallId: string,
  target: string,
  resultText = 'RESULT',
): Promise<{ readonly callReturn: unknown; readonly result: unknown }> => {
  const callReturn = await session.fireAsync('tool_call', readCall(toolCallId, target))
  const result = await session.fireAsync('tool_result', readResult(toolCallId, resultText))
  return { callReturn, result }
}

Feature('Leaf AGENTS.md delivery — handler integration').body(({ scenario }) => {
  scenario(
    'Injects the governing leaf into the first read result under a leaf',
    Gherkin.Do.pipe(
      Given('a fresh session over the memfs tree with the extension registered')(
        'setup',
        () =>
          Effect.promise(async () => ({
            session: requireSession(await setupSessions([SESSION_A], memfsLeafFs(TREE)), 0, 'session'),
          })),
      ),
      When('a read under packages/effect-atom fires')(
        'verdict',
        (s) =>
          Effect.promise(() =>
            fireReadPair(s.setup.session, 'tc-1', `${PROJECT_ROOT}/packages/effect-atom/src/index.ts`)
          ),
      ),
      Then('the tool_call handler returned nothing (never blocks or revises)')((s) =>
        Effect.sync(() => {
          expect(s.verdict.callReturn).toBeUndefined()
        })
      ),
      And('the result content ends with the effect-atom leaf wrapper containing its verbatim text')((s) =>
        Effect.sync(() => {
          expect(lastText(s.verdict.result)).toBe(
            `\n\n<leaf-agents-md path="packages/effect-atom/AGENTS.md">\n${ATOM_LEAF}\n</leaf-agents-md>`,
          )
        })
      ),
    ),
  )

  scenario(
    'Does not inject again for a second touch under the same leaf in the same session',
    Gherkin.Do.pipe(
      Given('a fresh session after the effect atom leaf was injected')('setup', () =>
        Effect.promise(async () => {
          const session = requireSession(await setupSessions([SESSION_A]), 0, 'session')
          await fireReadPair(session, 'tc-1', `${PROJECT_ROOT}/packages/effect-atom/src/index.ts`)
          return { session }
        })),
      When('a second read under the same leaf fires')(
        'verdict',
        (s) =>
          Effect.promise(() =>
            fireReadPair(s.setup.session, 'tc-2', `${PROJECT_ROOT}/packages/effect-atom/src/other.ts`, 'SECOND')
          ),
      ),
      Then('the second result is unmodified')((s) =>
        Effect.sync(() => {
          expect(s.verdict.callReturn).toBeUndefined()
          expect(s.verdict.result).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Injects a different leaf for a touch under another leaf (file_path key)',
    Gherkin.Do.pipe(
      Given('a fresh session after a first inject under packages/effect-atom')(
        'setup',
        () =>
          Effect.promise(async () => {
            const session = requireSession(await setupSessions([SESSION_A]), 0, 'session')
            await fireReadPair(session, 'tc-1', `${PROJECT_ROOT}/packages/effect-atom/src/index.ts`)
            return { session }
          }),
      ),
      When('an edit under packages/effect-memfs fires (file_path key)')('verdict', (s) =>
        Effect.promise(async () => {
          const callReturn = await s.setup.session.fireAsync(
            'tool_call',
            editCall('tc-2', `${PROJECT_ROOT}/packages/effect-memfs/src/index.ts`),
          )
          const result = await s.setup.session.fireAsync('tool_result', readResult('tc-2', 'SECOND'))
          return { callReturn, result }
        })),
      Then('the memfs leaf is injected')((s) =>
        Effect.sync(() => {
          expect(lastText(s.verdict.result)).toBe(
            `\n\n<leaf-agents-md path="packages/effect-memfs/AGENTS.md">\n${MEMFS_LEAF}\n</leaf-agents-md>`,
          )
        })
      ),
    ),
  )

  scenario(
    'Never injects under the vendored repos tree',
    Gherkin.Do.pipe(
      Given('a fresh session over the memfs tree')('setup', () =>
        Effect.promise(async () => ({
          session: requireSession(await setupSessions([SESSION_A]), 0, 'session'),
        }))),
      When('a read under repos/oh-my-pi fires')('verdict', (s) =>
        Effect.promise(() =>
          fireReadPair(
            s.setup.session,
            'tc-1',
            `${PROJECT_ROOT}/repos/oh-my-pi/packages/coding-agent/src/discovery/agents-md.ts`,
            'VENDORED',
          )
        )),
      Then('the result is unmodified')((s) =>
        Effect.sync(() => {
          expect(s.verdict.result).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Does not inject for targets outside the project root',
    Gherkin.Do.pipe(
      Given('a fresh session over the memfs tree')('setup', () =>
        Effect.promise(async () => ({
          session: requireSession(await setupSessions([SESSION_A]), 0, 'session'),
        }))),
      When('a read outside the project root fires')(
        'verdict',
        (s) => Effect.promise(() => fireReadPair(s.setup.session, 'tc-1', '/elsewhere/x.ts', 'OUTSIDE')),
      ),
      Then('the result is unmodified')((s) =>
        Effect.sync(() => {
          expect(s.verdict.result).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Injects again for a distinct session id (per-session state)',
    Gherkin.Do.pipe(
      Given('a shared module where session A has already injected the effect-atom leaf')(
        'setup',
        () =>
          Effect.promise(async () => {
            const sessions = await setupSessions([SESSION_A, SESSION_B])
            const a = requireSession(sessions, 0, 'a')
            const b = requireSession(sessions, 1, 'b')
            await fireReadPair(a, 'tc-1', `${PROJECT_ROOT}/packages/effect-atom/src/index.ts`)
            return { a, b }
          }),
      ),
      When('session B reads a different file under the same leaf')(
        'verdict',
        (s) =>
          Effect.promise(() =>
            fireReadPair(s.setup.b, 'tc-2', `${PROJECT_ROOT}/packages/effect-atom/src/other.ts`, 'B-FIRST')
          ),
      ),
      Then('session B receives the leaf again')((s) =>
        Effect.sync(() => {
          const text = lastText(s.verdict.result)
          expect(text).toContain('<leaf-agents-md path="packages/effect-atom/AGENTS.md">')
          expect(text).toContain(ATOM_LEAF)
        })
      ),
    ),
  )

  scenario(
    'Touches nothing when the tool input has no string target key',
    Gherkin.Do.pipe(
      Given('a fresh session over the memfs tree')('setup', () =>
        Effect.promise(async () => ({
          session: requireSession(await setupSessions([SESSION_A]), 0, 'session'),
        }))),
      When('a tool_call with a non-string path fires')('verdict', (s) =>
        Effect.promise(async () => {
          const callReturn = await s.setup.session.fireAsync('tool_call', {
            type: 'tool_call',
            toolName: 'read',
            toolCallId: 'tc-1',
            input: { path: 42 },
          })
          const result = await s.setup.session.fireAsync('tool_result', readResult('tc-1', 'PLAIN'))
          return { callReturn, result }
        })),
      Then('nothing is recorded and the result is unmodified')((s) =>
        Effect.sync(() => {
          expect(s.verdict.callReturn).toBeUndefined()
          expect(s.verdict.result).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Renders a pointer block for a leaf above the inline threshold',
    Gherkin.Do.pipe(
      Given('the memfs tree carries a >6KiB leaf under oxlint-plugins')('setup', () =>
        Effect.promise(async () => ({
          session: requireSession(await setupSessions([SESSION_A]), 0, 'session'),
        }))),
      When('a read under packages/oxlint-plugins fires')(
        'verdict',
        (s) =>
          Effect.promise(() =>
            fireReadPair(s.setup.session, 'tc-1', `${PROJECT_ROOT}/packages/oxlint-plugins/core/src/index.ts`, 'BIG')
          ),
      ),
      Then('the result carries pointer="true" and no leaf body')((s) =>
        Effect.sync(() => {
          const text = lastText(s.verdict.result)
          expect(text).toContain('<leaf-agents-md path="packages/oxlint-plugins/AGENTS.md" pointer="true">')
          expect(text).toContain(
            'Leaf governance not inlined (over 6 KiB) — read packages/oxlint-plugins/AGENTS.md before further changes under packages/oxlint-plugins/.',
          )
          expect(text).not.toContain(BIG_LEAF)
        })
      ),
    ),
  )

  scenario(
    'Logs a handler fault and leaves the result untouched when the leaf read fails',
    Gherkin.Do.pipe(
      Given('a session bound to a LeafFs that throws on the leaf read')('setup', () =>
        Effect.promise(async () => {
          const base = memfsLeafFs(TREE)
          const failingFs: LeafFs = {
            ...base,
            readFile: async (p) => {
              if (p.endsWith('/packages/effect-atom/AGENTS.md')) throw new Error('read denied')
              return base.readFile(p)
            },
          }
          return { session: requireSession(await setupSessions([SESSION_A], failingFs), 0, 'session') }
        })),
      When('a read under packages/effect-atom fires')(
        'verdict',
        (s) =>
          Effect.promise(() =>
            fireReadPair(s.setup.session, 'tc-1', `${PROJECT_ROOT}/packages/effect-atom/src/index.ts`)
          ),
      ),
      Then('the result is untouched and the fault is logged')((s) =>
        Effect.sync(() => {
          expect(s.verdict.result).toBeUndefined()
          expect(s.setup.session.recordedLogs.some((l) => l.message === 'leaf_context.handler_fault')).toBe(true)
        })
      ),
    ),
  )
})
