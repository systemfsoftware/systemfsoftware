import { Effect } from 'effect'

/** A value read from code this file does not own, narrowed by predicates. */
type Field<A = unknown> = A

interface HostProcess {
  readonly getBuiltinModule: (name: string) => Field
}

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object'

const isHostProcess = (candidate: Field): candidate is HostProcess => isHostObject(candidate)

const missingHost = (name: string): never => {
  throw new Error(`effect-sim-kernel tests need the node host ${name}`)
}

const hostProcess = (): Field => Reflect.get(globalThis, 'process')

/**
 * Reaches the host module loader the way a port module does — through the
 * global object at call time — so the file below is a real file on the real
 * filesystem, never an in-memory fake.
 */
const builtinModule = (name: string): Field => {
  if (!isHostProcess(hostProcess())) missingHost('process')
  const host = hostProcess()
  return isHostProcess(host) ? host.getBuiltinModule(name) : missingHost('process')
}

type MakeTempDir = (prefix: string) => string

type WriteFile = (path: string, data: string) => void

type RemoveDir = (path: string, options: { readonly recursive: boolean; readonly force: boolean }) => void

type TmpDir = () => string

type ReadFile = (path: string, encoding: string) => Promise<string>

const isMakeTempDir = (candidate: Field): candidate is MakeTempDir => typeof candidate === 'function'

const isWriteFile = (candidate: Field): candidate is WriteFile => typeof candidate === 'function'

const isRemoveDir = (candidate: Field): candidate is RemoveDir => typeof candidate === 'function'

const isTmpDir = (candidate: Field): candidate is TmpDir => typeof candidate === 'function'

const isReadFile = (candidate: Field): candidate is ReadFile => typeof candidate === 'function'

const memberOf = (module: Field, member: string): Field => {
  if (!isHostObject(module)) missingHost(`module member ${member}`)
  const object = isHostObject(module) ? module : {}
  return Reflect.get(object, member)
}

const narrowMember = <M>(module: Field, member: string, guard: (candidate: Field) => candidate is M): M => {
  const value = memberOf(module, member)
  if (!guard(value)) missingHost(`node module member ${member}`)
  return guard(value) ? value : missingHost(`node module member ${member}`)
}

const syncFs = (): {
  readonly makeTempDir: MakeTempDir
  readonly writeFile: WriteFile
  readonly removeDir: RemoveDir
} => ({
  makeTempDir: narrowMember(builtinModule('node:fs'), 'mkdtempSync', isMakeTempDir),
  writeFile: narrowMember(builtinModule('node:fs'), 'writeFileSync', isWriteFile),
  removeDir: narrowMember(builtinModule('node:fs'), 'rmSync', isRemoveDir),
})

const hostTmpDir = (): string => narrowMember(builtinModule('node:os'), 'tmpdir', isTmpDir)()

const promisedFs = (): { readonly readFile: ReadFile } => ({
  readFile: narrowMember(builtinModule('node:fs/promises'), 'readFile', isReadFile),
})

/** A real temporary directory holding one real file the checker program reads. */
export interface HostFiles {
  readonly directory: string
  readonly report: string
  readonly expected: string
}

const REPORT_NAME = 'report.txt'

const REPORT_TEXT = 'started'

/** Creates the directory and the file on the host, before any kernel run starts. */
export const makeHostFiles: Effect.Effect<HostFiles> = Effect.sync(() => {
  const fs = syncFs()
  const directory = fs.makeTempDir(`${hostTmpDir()}/kernel-external-`)
  const report = `${directory}/${REPORT_NAME}`
  fs.writeFile(report, REPORT_TEXT)
  return { directory, report, expected: REPORT_TEXT }
})

/** Removes the directory whatever the run found, so one scenario leaves nothing behind. */
export const removeHostFiles = (files: HostFiles): Effect.Effect<void> =>
  Effect.sync(() => {
    syncFs().removeDir(files.directory, { recursive: true, force: true })
  })

/** Reads the file through the host, the way a checker program under test would. */
export const readHostFile = (report: string): Promise<string> => promisedFs().readFile(report, 'utf8')

/** A checker program that reads a real file from disk and returns its contents. */
export const fileReadProgram = (report: string): Effect.Effect<string> => Effect.promise(() => readHostFile(report))

/** A checker program that sets a real timer while its work runs. */
export const hostTimerProgram = (onTimeout: () => void): Effect.Effect<string> =>
  Effect.sync(() => {
    const candidate: Field = Reflect.get(globalThis, 'setTimeout')
    if (typeof candidate === 'function') candidate(onTimeout, 0)
    return 'kept running past the timer'
  })
