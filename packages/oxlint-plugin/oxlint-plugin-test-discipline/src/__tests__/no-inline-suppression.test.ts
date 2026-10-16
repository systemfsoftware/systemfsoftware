import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Option, Schema } from 'effect'
import { afterEach, expect, it } from 'vitest'

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))

const Manifest = Schema.fromJsonString(
  Schema.Struct({ publishConfig: Schema.Struct({ bin: Schema.Record(Schema.String, Schema.String) }) }),
)

const NO_BIN = 'package.json publishes no no-inline-suppression bin'

interface Outcome {
  readonly code: number | string
  readonly stdout: string
  readonly stderr: string
}

const declaredBin = async (): Promise<string> => {
  const manifest = Schema.decodeUnknownOption(Manifest)(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  return Option.match(manifest, {
    onNone: () => NO_BIN,
    onSome: ({ publishConfig }) => join(PACKAGE_ROOT, publishConfig.bin['no-inline-suppression'] ?? NO_BIN),
  })
}

const runBin = async (cwd: string, args: readonly string[]): Promise<Outcome> => {
  const bin = await declaredBin()
  const { promise, resolve } = Promise.withResolvers<Outcome>()
  execFile(process.execPath, [bin, ...args], { cwd }, (error, stdout, stderr) => {
    resolve({ code: error === null ? 0 : (error.code ?? error.signal ?? 'killed'), stdout, stderr })
  })
  return promise
}

const git = (cwd: string, args: readonly string[]): Promise<void> => {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  execFile('git', args, { cwd }, (error) => {
    if (error === null) resolve()
    else reject(error)
  })
  return promise
}

const plant = async (root: string, files: Readonly<Record<string, string>>): Promise<void> => {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), text)
  }
}

const TRACKED = {
  'src/clean.ts': [
    "export const note = '// oxlint-disable-next-line no-console'",
    '// Never add eslint-disable here; fix the code.',
    '',
  ].join('\n'),
  'src/typed.ts': ['export const ok = 1', '// @ts-expect-error -- deliberate', "export const n: number = 'n'", ''].join(
    '\n',
  ),
  'tests/widget.test.ts': [
    '/* eslint-disable */',
    "import { ok } from '../src/typed.js'",
    'ok // oxlint-disable-line',
    '',
  ]
    .join('\n'),
  'README.md': '<!-- eslint-disable -->\n',
}

const UNTRACKED = { 'src/scratch.ts': '// oxlint-disable\n' }

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

it('fails on the tracked refused comments, naming file:line, and passes a clean file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'no-inline-suppression-'))
  roots.push(root)
  await plant(root, TRACKED)
  await git(root, ['init', '--quiet'])
  await git(root, ['add', ...Object.keys(TRACKED)])
  await plant(root, UNTRACKED)

  const tracked = await runBin(root, [])
  const clean = await runBin(root, ['src/clean.ts'])

  expect(clean).toEqual({ code: 0, stdout: '', stderr: '' })
  expect({
    code: tracked.code,
    locations: tracked.stdout.trimEnd().split('\n').map((line) => line.slice(0, line.indexOf(' '))),
  }).toEqual({
    code: 1,
    locations: ['src/typed.ts:2:1:', 'tests/widget.test.ts:1:1:', 'tests/widget.test.ts:3:4:'],
  })
})

it('fails an unparseable file and names it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'no-inline-suppression-'))
  roots.push(root)
  await plant(root, { 'src/broken.ts': 'const = ;\n// eslint-disable-next-line\n' })

  const broken = await runBin(root, ['src/broken.ts'])

  expect({ code: broken.code, files: broken.stdout.trimEnd().split('\n').map((line) => line.split(':')[0]) }).toEqual({
    code: 1,
    files: ['src/broken.ts'],
  })
})
