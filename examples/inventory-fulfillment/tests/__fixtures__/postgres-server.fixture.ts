import { Effect, Redacted, Schema, type Scope } from 'effect'
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const RUNS_AS_ROOT = process.getuid?.() === 0

class PostgresUnavailable extends Schema.TaggedError<PostgresUnavailable>()('PostgresUnavailable', {
  step: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return `The Postgres race needs a throwaway PostgreSQL 17 from \`nix build .#postgresql_17\`; ${this.step} failed`
  }
}

const attempt = <A>(step: string, promise: () => Promise<A>): Effect.Effect<A, PostgresUnavailable> =>
  Effect.tryPromise({ try: promise, catch: (cause) => new PostgresUnavailable({ step, cause }) })

const run = (file: string, args: ReadonlyArray<string>): Promise<string> => {
  const { promise, resolve, reject } = Promise.withResolvers<string>()
  execFile(
    file,
    args,
    { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 },
    (error, stdout, stderr) =>
      error === null ? resolve(stdout) : reject(new Error(`${file} ${args.join(' ')}: ${stderr}`, { cause: error })),
  )
  return promise
}

const freePort = (): Promise<number> => {
  const { promise, resolve, reject } = Promise.withResolvers<number>()
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    server.close(() => resolve(port))
  })
  return promise
}

const asServerUser = (command: string, args: ReadonlyArray<string>): readonly [string, ReadonlyArray<string>] =>
  RUNS_AS_ROOT ? ['runuser', ['-u', 'nobody', '--', command, ...args]] : [command, args]

const awaitReady = (child: ChildProcess): Promise<void> => {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  const log: Array<string> = []
  const onData = (chunk: Buffer): void => {
    log.push(chunk.toString())
    if (log.join('').includes('database system is ready to accept connections')) resolve()
  }
  child.stderr?.on('data', onData)
  child.stdout?.on('data', onData)
  child.once('error', reject)
  child.once(
    'exit',
    (code) => reject(new Error(`postgres exited with ${String(code)} before it was ready:\n${log.join('')}`)),
  )
  return promise
}

const exited = (child: ChildProcess): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  child.once('exit', () => resolve())
  if (child.exitCode !== null) resolve()
  return promise
}

interface Server {
  readonly bin: string
  readonly url: Redacted.Redacted<string>
  readonly child: ChildProcess
  readonly dir: string
}

const stopped = (server: Server): Promise<void> => {
  const [file, args] = asServerUser(join(server.bin, 'pg_ctl'), ['stop', '-D', join(server.dir, 'data'), '-m', 'fast'])
  return run(file, args).then(() => exited(server.child), () => exited(server.child))
}

const started: Effect.Effect<Server, PostgresUnavailable> = Effect.gen(function*() {
  const out = yield* attempt(
    'nix build',
    () => run('nix', ['build', '--no-link', '--print-out-paths', `${REPO_ROOT}#postgresql_17^out`]),
  )
  const bin = join(out.trim(), 'bin')
  const dir = yield* attempt('mkdtemp', () => mkdtemp(join(RUNS_AS_ROOT ? '/tmp' : tmpdir(), 'credit-ledger-pg-')))
  const data = join(dir, 'data')
  yield* attempt('prepare', () => chmod(dir, 0o777))
  const [initFile, initArgs] = asServerUser(join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust'])
  yield* attempt('initdb', () => run(initFile, initArgs))
  const port = yield* attempt('free port', freePort)
  const [serverFile, serverArgs] = asServerUser(join(bin, 'postgres'), [
    '-D',
    data,
    '-p',
    String(port),
    '-k',
    dir,
    '-c',
    'listen_addresses=127.0.0.1',
    '-c',
    'max_connections=200',
  ])
  const child = spawn(serverFile, serverArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
  yield* attempt('postgres start', () => awaitReady(child))
  return { bin, url: Redacted.make(`postgres://postgres@127.0.0.1:${port}/postgres`), child, dir }
})

export const throwawayPostgres: Effect.Effect<Redacted.Redacted<string>, never, Scope.Scope> = Effect
  .acquireRelease(
    Effect.orDie(started),
    (server) => Effect.promise(() => stopped(server).then(() => rm(server.dir, { recursive: true, force: true }))),
  )
  .pipe(Effect.map((server) => server.url))
