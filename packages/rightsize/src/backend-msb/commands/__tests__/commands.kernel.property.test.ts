import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'
import { describe } from 'vitest'

import { MsbCommands } from '../msb.kernel.js'

/**
 * Invocation-grammar properties over the full generated spec space. The
 * recorded vectors in `commands.kernel.test.ts` pin upstream's exact argv
 * spellings; these properties pin the GRAMMAR — flag order, token formats and
 * the attached-mode/-d and --from-snapshot exclusivity invariants — across
 * arbitrary specs.
 */
interface GeneratedRunSpec {
  readonly name: string
  readonly image: string
  readonly memoryLimitMb: number | undefined
  readonly diskLimitMb: number | undefined
  readonly tmpfsRootMb: number | undefined
  readonly networkDisabled: boolean
  readonly ports: ReadonlyArray<{ readonly hostPort: number; readonly guestPort: number }>
  readonly env: ReadonlyArray<readonly [string, string]>
  readonly mounts: ReadonlyArray<{ readonly hostPath: string; readonly guestPath: string; readonly readOnly: boolean }>
  readonly checkpointRef: string | undefined
  readonly command: ReadonlyArray<string> | undefined
}

const specGenerator: fc.Arbitrary<GeneratedRunSpec> = fc
  .record({
    // User strings are constrained so they can never collide with the
    // builder's own flag tokens: not starting with '-', and the image keeps
    // the `ref:tag` shape. Command tokens live behind `--`, so the flag
    // region of the argv is exactly what the builder emitted.
    name: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/),
    image: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._/:-]*$/),
    memoryLimitMb: fc.option(fc.integer({ min: 1, max: 8192 }), { nil: undefined }),
    diskLimitMb: fc.option(fc.integer({ min: 1, max: 65536 }), { nil: undefined }),
    tmpfsRootMb: fc.option(fc.integer({ min: 1, max: 65536 }), { nil: undefined }),
    networkDisabled: fc.boolean(),
    ports: fc.array(
      fc.record({ hostPort: fc.integer({ min: 1, max: 65535 }), guestPort: fc.integer({ min: 1, max: 65535 }) }),
      { maxLength: 5 },
    ),
    env: fc.array(fc.tuple(fc.string({ minLength: 1 }), fc.string()), { maxLength: 5 }),
    mounts: fc.array(
      fc.record({
        hostPath: fc.string({ minLength: 1 }),
        guestPath: fc.string({ minLength: 1 }),
        readOnly: fc.boolean(),
      }),
      { maxLength: 5 },
    ),
    checkpointRef: fc.option(fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/), { nil: undefined }),
    command: fc.option(
      fc.array(fc.stringMatching(/^[a-zA-Z0-9._/:=+-]+$/), { minLength: 1, maxLength: 5 }),
      { nil: undefined },
    ),
  })
  // The launch workflow makes root-disk and tmpfs mutually exclusive (RootDiskConflictError):
  // the argv builder itself is total, but real specs never carry both. An
  // image shaped like a published-port token (`123:456`) would collide with a
  // `-p` token in whole-argv membership checks, and a snapshot ref equal to
  // the image would make "the image is absent" unobservable — generated
  // identifiers are kept pairwise distinct.
  .filter((spec) => !(spec.diskLimitMb !== undefined && spec.tmpfsRootMb !== undefined))
  .filter((spec) => !/^\d+:\d+$/.test(spec.image))
  .filter((spec) => spec.name !== spec.image && spec.image !== spec.checkpointRef && spec.name !== spec.checkpointRef)

/**
 * The canonical run grammar, spelled out as a validator: name header,
 * -m immediately after --name, limits/net/ports/env/mounts all before the
 * image positional, exact token spellings, --from-snapshot/image exclusivity,
 * and a single trailing `--` carrying the command verbatim.
 */
const conformsToRunGrammar = (spec: GeneratedRunSpec, argv: readonly string[]): boolean => {
  if (argv[0] !== 'run' || argv[1] !== '--name' || argv[2] !== spec.name) return false
  let i = 3
  if (spec.memoryLimitMb !== undefined) {
    if (argv[i] !== '-m' || argv[i + 1] !== `${spec.memoryLimitMb}M`) return false
    i += 2
  }
  if (spec.diskLimitMb !== undefined) {
    if (argv[i] !== '--root-disk' || argv[i + 1] !== `${spec.diskLimitMb}M`) return false
    i += 2
  }
  if (spec.tmpfsRootMb !== undefined) {
    if (argv[i] !== '--root-disk' || argv[i + 1] !== `tmpfs:${spec.tmpfsRootMb}M`) return false
    i += 2
  }
  if (spec.networkDisabled) {
    if (argv[i] !== '--net' || argv[i + 1] !== 'private') return false
    i += 2
  }
  for (const p of spec.ports) {
    if (argv[i] !== '-p' || argv[i + 1] !== `${p.hostPort}:${p.guestPort}`) return false
    i += 2
  }
  for (const [key, value] of spec.env) {
    if (argv[i] !== '-e' || argv[i + 1] !== `${key}=${value}`) return false
    i += 2
  }
  for (const m of spec.mounts) {
    if (argv[i] !== '--mount-file') return false
    const token = argv[i + 1]
    if (token !== `${m.hostPath}:${m.guestPath}:${m.readOnly ? 'ro' : 'rw'},nodev`) return false
    i += 2
  }
  if (spec.checkpointRef !== undefined) {
    if (argv[i] !== '--from-snapshot' || argv[i + 1] !== spec.checkpointRef) return false
    i += 2
  } else if (argv[i] !== spec.image) {
    return false
  } else {
    i += 1
  }
  if (spec.command !== undefined) {
    if (argv[i] !== '--') return false
    i += 1
    for (const c of spec.command) {
      if (argv[i] !== c) return false
      i += 1
    }
  }
  return i === argv.length
}

describe('MsbCommands.run invocation grammar', () => {
  it.prop(
    '∀spec_RunArgv_⊥DetachFlag',
    [specGenerator],
    ([spec]) => {
      const argv = MsbCommands.run(spec)
      // `-d` is a builder FLAG, never a user token: the flag region ends at the
      // `--` separator (command tokens, which may legally equal "-d-*", live
      // behind it), so slice the check to everything before `--`.
      const dashDashIdx = argv.indexOf('--')
      const flagRegion = dashDashIdx === -1 ? argv : argv.slice(0, dashDashIdx)
      return !flagRegion.includes('-d') && argv[0] === 'run' && argv[1] === '--name' && argv[2] === spec.name
    },
  )

  it.prop(
    '∀spec_RunArgv_∈MsbGrammar',
    [specGenerator],
    ([spec]) => conformsToRunGrammar(spec, MsbCommands.run(spec)),
  )

  it.prop(
    '∀spec_SnapshotBoot_≠Image',
    [specGenerator],
    ([spec]) => {
      const argv = MsbCommands.run(spec)
      // The exclusivity law is about the POSITIONAL token: the last
      // builder-emitted token is `--from-snapshot <ref>` XOR the image. Whole-argv
      // `includes` checks are too weak (a generated name or port token can equal
      // the image string), so anchor on the last token of the flag region.
      const dashDashIdx = argv.indexOf('--')
      const tail = dashDashIdx === -1 ? argv : argv.slice(0, dashDashIdx)
      const last = tail[tail.length - 1]
      if (spec.checkpointRef !== undefined) {
        return tail.includes('--from-snapshot') && last === spec.checkpointRef && tail.includes(spec.image) === false
      }
      return tail.includes('--from-snapshot') === false && last === spec.image
    },
  )
})
