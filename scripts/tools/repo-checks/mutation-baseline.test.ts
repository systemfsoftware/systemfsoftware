// Pure rules are judged directly; the orchestration (workspace packages,
// merge-base, manifest presence) is driven through the real CLI against real
// temporary git repositories, so a gate that quietly stops judging a tree
// fails a test rather than passing one.
import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Baseline, baselineOf, judgeBaseline, MANIFEST_PATH, parseReasons } from './mutation-baseline.ts'

const A = 'aaaaaaaaaaaaaaaa'
const B = 'bbbbbbbbbbbbbbbb'
const C = 'cccccccccccccccc'
const DIR = 'packages/demo'
const PKG = '@systemfsoftware/demo'
const OTHER = '@systemfsoftware/other'
const HEADER = '| id | file:line | mutator -> replacement | reason |\n| --- | --- | --- | --- |\n'

const json = (...ids: string[]): string => JSON.stringify({ schemaVersion: 1, survivors: ids })
const row = (id: string, reason: string): string =>
  `| \`${id}\` | \`src/a.ts:1\` | BooleanLiteral -> \`true\` | ${reason} |\n`
const justified = (id: string): string => row(id, 'line 3 already returns for every input that reaches here')
const debt = (id: string): string => row(id, 'debt: pre-existing on main@ba6664c185')
const reasons = (just: string, deb: string): string =>
  `# Mutation baseline reasons - demo\n\n## Justified\n\n${HEADER}${just}\n## Debt\n\n${HEADER}${deb}`

const headOf = (jsonText: string, reasonsText: string | null): Baseline => baselineOf(jsonText, reasonsText, 'head')
const judge = (
  head: Baseline,
  seed: readonly string[] = [],
  baseSeed: readonly string[] | null = null,
): readonly string[] => judgeBaseline({ dir: DIR, pkg: PKG, head, seed, baseSeed }).violations
const codes = (violations: readonly string[]): string[] => violations.map((line) => line.split(' ')[0]!)

Deno.test('Should_Hold_When_TheMergeBaseHasNoManifest_TheSeedingExemption', () => {
  const head = headOf(json(A, B), reasons('', debt(A) + debt(B)))
  assertEquals(judge(head, [A, B], null), [])
})

Deno.test('Should_ReportDebtAdded_When_TheManifestExistsAndASeedEntryOmitsADebtId', () => {
  const head = headOf(json(A), reasons('', debt(A)))
  assertEquals(codes(judge(head, [], [])), ['BASELINE_DEBT_ADDED'])
})

Deno.test('Should_ReportManifestGrew_When_ASeedEntryGainsAnIdTheMergeBaseNeverSeeded', () => {
  const head = headOf(json(A, B), reasons('', debt(A) + debt(B)))
  assertEquals(codes(judge(head, [A, B], [A])), ['BASELINE_MANIFEST_GREW'])
})

Deno.test('Should_ReportLaundered_When_ASeededDebtIdIsRelabelledJustified', () => {
  const head = headOf(json(A), reasons(justified(A), ''))
  assertEquals(codes(judge(head, [A], [A])), ['BASELINE_DEBT_LAUNDERED'])
})

Deno.test('Should_ReportDuplicate_When_ASeededDebtIdIsListedASecondTime', () => {
  const head = headOf(json(A), reasons(justified(A), debt(A)))
  const found = codes(judge(head, [A], [A]))
  assertEquals(found.includes('BASELINE_REASON_DUPLICATE'), true)
})

Deno.test('Should_Hold_When_ASeededDebtIdLeavesTheBaseline', () => {
  const head = headOf(json(A), reasons('', debt(A)))
  assertEquals(judge(head, [A, B], [A, B]), [])
})

Deno.test('Should_Hold_When_ANewIdCarriesANonEmptyJustifiedReason', () => {
  const head = headOf(json(A), reasons(justified(A), ''))
  assertEquals(judge(head, [], []), [])
})

Deno.test('Should_ReportReasonMissing_When_AnIdHasNoRow', () => {
  const head = headOf(json(A, B), reasons('', debt(A)))
  assertEquals(codes(judge(head, [A, B], null)), ['BASELINE_REASON_MISSING'])
})

Deno.test('Should_ReportReasonMissing_When_TheReasonCellIsBlank', () => {
  const head = headOf(json(A), reasons('', row(A, '   ')))
  assertEquals(codes(judge(head, [A], null)), ['BASELINE_REASON_MISSING'])
})

Deno.test('Should_ReportReasonMissing_When_TheBaselineHasNoReasonsFile', () => {
  assertEquals(codes(judge(headOf(json(A), null), [A], null)), ['BASELINE_REASON_MISSING'])
})

Deno.test('Should_WarnNotFail_When_ARowNamesAnIdTheBaselineDropped', () => {
  const judgment = judgeBaseline({
    dir: DIR,
    pkg: PKG,
    head: headOf(json(), reasons(justified(A), '')),
    seed: [],
    baseSeed: null,
  })
  assertEquals(judgment.violations, [])
  assertEquals(judgment.warnings.length, 1)
  assertStringIncludes(judgment.warnings[0]!, 'BASELINE_REASON_ORPHAN')
})

Deno.test('Should_ReportMisplaced_When_ADebtRowSitsUnderJustified', () => {
  const head = headOf(json(A), reasons(debt(A), ''))
  assertEquals(codes(judge(head, [A], null)), ['BASELINE_REASON_MISPLACED'])
})

Deno.test('Should_ParseEscapedPipeInsideACell_When_AReasonContainsAPipe', () => {
  const parsed = parseReasons(reasons(row(B, 'covered by a \\| b'), debt(A).replace('on main', 'on main \\| main')))
  assertEquals(parsed.malformed, [])
  assertEquals(parsed.rows.get(A)?.kind, 'debt')
  assertStringIncludes(parsed.rows.get(A)!.reason, '|')
  assertEquals(parsed.rows.get(B)?.kind, 'justified')
  assertStringIncludes(parsed.rows.get(B)!.reason, '|')
})

Deno.test('Should_ReportHeading_When_ASectionOtherThanJustifiedOrDebtAppears', () => {
  const head = headOf(json(A), `## Seeded debt\n\n${HEADER}${debt(A)}`)
  const found = codes(judge(head, [A], null))
  assertEquals(found.includes('BASELINE_REASON_HEADING'), true)
})

Deno.test('Should_ReportMalformed_When_ARowCarriesAFifthColumn', () => {
  const head = headOf(
    json(A),
    reasons('', `| \`${A}\` | \`src/a.ts:1\` | BooleanLiteral -> \`true\` | debt: seeded | next action |\n`),
  )
  assertEquals(codes(judge(head, [A], null)).includes('BASELINE_REASON_MALFORMED'), true)
})

Deno.test('Should_ReportRejected_When_TheSchemaVersionIsNotTheGateVersion', () => {
  assertEquals(codes(judge(headOf('{"schemaVersion":2,"survivors":[]}', null), [], null)), ['BASELINE_REJECTED'])
})

Deno.test('Should_ReportRejected_When_ASurvivorIdIsNotSixteenHex', () => {
  assertEquals(codes(judge(headOf('{"schemaVersion":1,"survivors":["not-an-id"]}', null), [], null)), [
    'BASELINE_REJECTED',
  ])
})

Deno.test('Should_ReportRejected_When_TheSurvivorsFieldIsAbsent', () => {
  assertEquals(codes(judge(headOf('{"schemaVersion":1}', null), [], null)), ['BASELINE_REJECTED'])
})

// --- Orchestration against real temporary git repositories ---

const childEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(Deno.env.toObject()).filter(([key]) => !key.startsWith('LD_') && !key.startsWith('DYLD_')),
  )

const decoder = new TextDecoder()

const gitIn = async (cwd: string, ...args: string[]): Promise<string> => {
  const out = await new Deno.Command('git', {
    cwd,
    args,
    clearEnv: true,
    env: childEnv(),
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  if (!out.success) throw new Error(`git ${args.join(' ')} failed: ${decoder.decode(out.stderr)}`)
  return decoder.decode(out.stdout)
}

const write = async (cwd: string, path: string, content: string): Promise<void> => {
  await Deno.mkdir(join(cwd, dirname(path)), { recursive: true })
  await Deno.writeTextFile(join(cwd, path), content)
}

const commit = async (cwd: string, message: string): Promise<void> => {
  await gitIn(cwd, 'add', '-A')
  await gitIn(cwd, 'commit', '-q', '--no-verify', '-m', message)
}

const packageFiles = async (
  cwd: string,
  dir: string,
  name: string,
  survivors: readonly string[],
  just: string,
  deb: string,
): Promise<void> => {
  await write(cwd, `${dir}/package.json`, `${JSON.stringify({ name, version: '0.0.0' })}\n`)
  await write(cwd, `${dir}/mutation-baseline.json`, `${JSON.stringify({ schemaVersion: 1, survivors }, null, 2)}\n`)
  await write(cwd, `${dir}/mutation-baseline.reasons.md`, reasons(just, deb))
}

const seedManifest = async (cwd: string, packages: Readonly<Record<string, readonly string[]>>): Promise<void> =>
  write(cwd, MANIFEST_PATH, `${JSON.stringify({ seededFrom: 'test@seed', packages }, null, 2)}\n`)

const withRepo = async (body: (cwd: string) => Promise<void>): Promise<void> => {
  const cwd = await Deno.makeTempDir({ prefix: 'mutation-baseline-test-' })
  try {
    await gitIn(cwd, 'init', '-q', '-b', 'main')
    await gitIn(cwd, 'config', 'user.email', 'plant@localhost')
    await gitIn(cwd, 'config', 'user.name', 'plant')
    await write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n')
    await body(cwd)
  } finally {
    await Deno.remove(cwd, { recursive: true })
  }
}

const CLI = fromFileUrl(new URL('./cli.ts', import.meta.url))
const CONFIG = fromFileUrl(new URL('../../../scripts/deno.jsonc', import.meta.url))
const LOCK = fromFileUrl(new URL('../../../scripts/deno.lock', import.meta.url))

const runCheck = async (
  cwd: string,
  base: string,
  head: string,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> => {
  const out = await new Deno.Command(Deno.execPath(), {
    cwd,
    clearEnv: true,
    env: childEnv(),
    args: [
      'run',
      '--config',
      CONFIG,
      '--lock',
      LOCK,
      '--frozen',
      '--allow-read',
      '--allow-env',
      '--allow-run=git',
      CLI,
      'mutation-baseline',
      '--base',
      base,
      '--head',
      head,
    ],
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  return { code: out.code, stdout: decoder.decode(out.stdout), stderr: decoder.decode(out.stderr) }
}

Deno.test('Should_Hold_When_TheMergeBaseCarriesNoManifestEvenThoughBaseDoes', async () => {
  await withRepo(async (cwd) => {
    await packageFiles(cwd, 'packages/demo', PKG, [], '', '')
    await commit(cwd, 'seed the package with no manifest')
    const root = (await gitIn(cwd, 'rev-parse', 'HEAD')).trim()

    await gitIn(cwd, 'checkout', '-q', '-b', 'base')
    await seedManifest(cwd, { [PKG]: [] })
    await commit(cwd, 'add an empty manifest on base')

    await gitIn(cwd, 'checkout', '-q', '-b', 'feature', root)
    await packageFiles(cwd, 'packages/demo', PKG, [A], '', debt(A))
    await seedManifest(cwd, { [PKG]: [A] })
    await commit(cwd, 'seed debt on feature')

    const result = await runCheck(cwd, 'base', 'feature')
    assertEquals(result.code, 0, `${result.stdout}\n${result.stderr}`)
    assertStringIncludes(result.stdout, 'holds')
  })
})

Deno.test('Should_ReportDebtAdded_When_ACommitAfterTheSeedAddsAnUnseededDebtId', async () => {
  await withRepo(async (cwd) => {
    await packageFiles(cwd, 'packages/demo', PKG, [], '', '')
    await commit(cwd, 'package with an empty baseline')
    await seedManifest(cwd, { [PKG]: [A] })
    await packageFiles(cwd, 'packages/demo', PKG, [A], '', debt(A))
    await commit(cwd, 'seed debt A')
    await packageFiles(cwd, 'packages/demo', PKG, [A, B], '', debt(A) + debt(B))
    await commit(cwd, 'add unseeded debt B')

    const result = await runCheck(cwd, 'HEAD~1', 'HEAD')
    assertEquals(result.code, 1, `${result.stdout}\n${result.stderr}`)
    assertStringIncludes(result.stderr, 'BASELINE_DEBT_ADDED')
    assertStringIncludes(result.stderr, B)
  })
})

Deno.test('Should_Hold_When_ARenamedPackageKeepsItsSeededDebt', async () => {
  await withRepo(async (cwd) => {
    await packageFiles(cwd, 'packages/demo', PKG, [], '', '')
    await commit(cwd, 'package with an empty baseline')
    await seedManifest(cwd, { [PKG]: [A] })
    await packageFiles(cwd, 'packages/demo', PKG, [A], '', debt(A))
    await commit(cwd, 'seed debt A')
    await gitIn(cwd, 'mv', 'packages/demo', 'packages/demo-renamed')
    await commit(cwd, 'rename the package directory')

    const result = await runCheck(cwd, 'HEAD~1', 'HEAD')
    assertEquals(result.code, 0, `${result.stdout}\n${result.stderr}`)
    assertStringIncludes(result.stdout, 'holds')
  })
})

Deno.test('Should_ReportDebtAdded_When_ARenamedPackageGainsADebtId', async () => {
  await withRepo(async (cwd) => {
    await packageFiles(cwd, 'packages/demo', PKG, [], '', '')
    await commit(cwd, 'package with an empty baseline')
    await seedManifest(cwd, { [PKG]: [A] })
    await packageFiles(cwd, 'packages/demo', PKG, [A], '', debt(A))
    await commit(cwd, 'seed debt A')
    await gitIn(cwd, 'mv', 'packages/demo', 'packages/demo-renamed')
    await packageFiles(cwd, 'packages/demo-renamed', PKG, [A, B], '', debt(A) + debt(B))
    await commit(cwd, 'rename and add unseeded debt B')

    const result = await runCheck(cwd, 'HEAD~1', 'HEAD')
    assertEquals(result.code, 1, `${result.stdout}\n${result.stderr}`)
    assertStringIncludes(result.stderr, 'BASELINE_DEBT_ADDED')
  })
})

Deno.test('Should_ReportDebtAdded_When_APackageIsDeletedAndReAddedWithExtraDebt', async () => {
  await withRepo(async (cwd) => {
    await packageFiles(cwd, 'packages/demo', PKG, [], '', '')
    await commit(cwd, 'package with an empty baseline')
    await seedManifest(cwd, { [PKG]: [A] })
    await packageFiles(cwd, 'packages/demo', PKG, [A], '', debt(A))
    await commit(cwd, 'seed debt A')
    await gitIn(cwd, 'rm', '-q', '-r', 'packages/demo')
    await commit(cwd, 'delete the package')
    await packageFiles(cwd, 'packages/demo', PKG, [A, B], '', debt(A) + debt(B))
    await commit(cwd, 're-add the package with unseeded debt B')

    const result = await runCheck(cwd, 'HEAD~2', 'HEAD')
    assertEquals(result.code, 1, `${result.stdout}\n${result.stderr}`)
    assertStringIncludes(result.stderr, 'BASELINE_DEBT_ADDED')
  })
})

Deno.test('Should_ReportManifestGrew_When_TheSeedManifestAddsAPackageKey', async () => {
  await withRepo(async (cwd) => {
    await packageFiles(cwd, 'packages/demo', PKG, [], '', '')
    await packageFiles(cwd, 'packages/other', OTHER, [], '', '')
    await commit(cwd, 'two packages with empty baselines')
    await seedManifest(cwd, { [PKG]: [] })
    await commit(cwd, 'seed the manifest with one package')
    await seedManifest(cwd, { [PKG]: [], [OTHER]: [] })
    await commit(cwd, 'grow the manifest with a second package')

    const result = await runCheck(cwd, 'HEAD~1', 'HEAD')
    assertEquals(result.code, 1, `${result.stdout}\n${result.stderr}`)
    assertStringIncludes(result.stderr, 'BASELINE_MANIFEST_GREW')
  })
})

Deno.test('Should_ReportAnUnseededDebtId_When_ItsPackageFilesAreUnchangedByTheDiff', async () => {
  await withRepo(async (cwd) => {
    await packageFiles(cwd, 'packages/demo', PKG, [], '', '')
    await packageFiles(cwd, 'packages/other', OTHER, [B], '', debt(B))
    await seedManifest(cwd, { [PKG]: [], [OTHER]: [] })
    await commit(cwd, 'seeded manifest with other already unseeded')
    await packageFiles(cwd, 'packages/demo', PKG, [C], justified(C), '')
    await commit(cwd, 'change only the demo package')

    const result = await runCheck(cwd, 'HEAD~1', 'HEAD')
    assertEquals(result.code, 1, `${result.stdout}\n${result.stderr}`)
    assertStringIncludes(result.stderr, 'BASELINE_DEBT_ADDED')
    assertStringIncludes(result.stderr, B)
  })
})
