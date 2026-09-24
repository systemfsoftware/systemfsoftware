import { Effect, Match } from 'effect'
import * as fc from 'fast-check'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { FileCommand, FileResponse, Refusal } from './file-system.model.js'
import { StorePath } from './file-system.model.js'

const storePath = fc.constantFrom(...StorePath.literals)
const text = fc.constantFrom<'one' | 'two'>('one', 'two')

const fileCommand: fc.Arbitrary<FileCommand> = fc.oneof(
  fc.record({ _tag: fc.constant('WriteFile' as const), path: storePath, text }),
  fc.record({ _tag: fc.constant('ReadFile' as const), path: storePath }),
  fc.record({ _tag: fc.constant('MakeDirectory' as const), path: storePath, recursive: fc.boolean() }),
  fc.record({ _tag: fc.constant('Remove' as const), path: storePath, recursive: fc.boolean() }),
  fc.record({ _tag: fc.constant('MakeReadOnly' as const), path: storePath }),
)

export const fileCommandLists: fc.Arbitrary<Array<FileCommand>> = fc.array(fileCommand, { maxLength: 12 })

const EFFECT_NODE_REASONS: Readonly<Record<string, Refusal>> = {
  ENOENT: 'NotFound',
  EACCES: 'PermissionDenied',
  EEXIST: 'AlreadyExists',
  EISDIR: 'BadResource',
  ENOTDIR: 'BadResource',
  ELOOP: 'BadResource',
}

const codeOf = (error: Error): string => String(Reflect.get(error, 'code'))

const reasonOf = (error: Error): Refusal => EFFECT_NODE_REASONS[codeOf(error)] ?? 'Unknown'

const done: FileResponse = { _tag: 'Done' }

const attempted = (act: () => FileResponse): FileResponse => {
  try {
    return act()
  } catch (error: unknown) {
    return { _tag: 'Refused', reason: error instanceof Error ? reasonOf(error) : 'Unknown' }
  }
}

const performed = (root: string, command: FileCommand): FileResponse =>
  Match.value(command).pipe(
    Match.tag('WriteFile', (write) => {
      fs.writeFileSync(root + write.path, write.text)
      return done
    }),
    Match.tag(
      'ReadFile',
      (read): FileResponse => ({ _tag: 'Content', text: fs.readFileSync(root + read.path, 'utf8') }),
    ),
    Match.tag('MakeDirectory', (make) => {
      fs.mkdirSync(root + make.path, { recursive: make.recursive })
      return done
    }),
    Match.tag('Remove', (removal) => {
      fs.rmSync(root + removal.path, { recursive: removal.recursive })
      return done
    }),
    Match.tag('MakeReadOnly', (lock) => {
      fs.chmodSync(root + lock.path, 0o444)
      return done
    }),
    Match.exhaustive,
  )

export const realResponses = (commands: ReadonlyArray<FileCommand>): Effect.Effect<ReadonlyArray<FileResponse>> =>
  Effect.acquireUseRelease(
    Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), 'memfs-model-'))),
    (root) => Effect.sync(() => commands.map((command) => attempted(() => performed(root, command)))),
    (root) => Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  )

export const hostBypassesPermissions = (): boolean => process.getuid?.() === 0
