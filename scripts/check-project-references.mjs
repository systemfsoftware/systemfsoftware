#!/usr/bin/env node
// Typechecks every referenced TypeScript project, because nothing else does.
//
// Each package's `typecheck` script is `tsc --noEmit` against its own
// tsconfig.json. That compiles the files that config includes -- and stops
// there. `--noEmit` does NOT follow `references`, so a referenced project can
// be arbitrarily broken while `pnpm check` reports 220/220 green.
//
// That is not hypothetical. On 2026-08-04 sixteen packages shipped a
// tsconfig.node.json whose `include` was `["src/**/*.test.ts"]`: test files
// already owned by the parent project, importing siblings the referenced
// project neither listed nor referenced. Composite projects reject that with
// TS6307. 171 errors sat in the tree, invisible, until the mutation job -- the
// only consumer that compiles in `--build` mode -- aborted during checker
// init and killed the gate repo-wide.
//
// The gate is the compiler, not a heuristic about config shape. A static
// "does the include overlap the parent" rule would encode today's failure and
// miss tomorrow's; `tsc -p <project> --noEmit` is the same judgement the
// mutation job makes, made earlier and cheaper.
//
// Declared limit, stated rather than hidden: discovery is by filename. Every
// referenced project in this repo is named `tsconfig.node.json` and every one
// of the 33 is referenced by its sibling tsconfig.json, so the name IS the
// convention. A referenced project under a different name is not scanned and
// not caught. The selftest pins the reach into packages/oxlint-plugins/, where
// the defect lived, so narrowing discovery fails loudly rather than silently.

import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const TSC = join(repoRoot, 'node_modules', '.bin', 'tsc')

const PROJECT_FILENAME = 'tsconfig.node.json'

// ── discovery ────────────────────────────────────────────────────────────────
// `git ls-files` rather than a directory walk: tracked-only excludes stryker
// sandboxes (.stryker-tmp/**), build output, and every other untracked copy by
// construction, with no exclusion list to drift out of date.
const discoverProjects = () =>
  execFileSync('git', ['ls-files', `**/${PROJECT_FILENAME}`], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map(dirname)
    .sort()

// ── checking ─────────────────────────────────────────────────────────────────
// Returns the distinct TS error codes tsc reported, or [] when the project
// compiles. Exit status alone is not enough for the selftest: it has to assert
// the historical defect surfaces as TS6307 specifically, not merely as "some
// failure", or a fixture that breaks for an unrelated reason would pass it.
const checkProject = async (dir) => {
  try {
    await execFileAsync(TSC, ['-p', PROJECT_FILENAME, '--noEmit'], { cwd: dir, encoding: 'utf8' })
    return []
  } catch (error) {
    const output = String(error.stdout ?? '') + String(error.stderr ?? '')
    const codes = [...new Set(output.match(/TS\d+/g) ?? [])].sort()
    return codes.length > 0 ? codes : ['UNKNOWN']
  }
}

const checkAll = async (dirs) => {
  const results = await Promise.all(dirs.map(async (dir) => [dir, await checkProject(dir)]))
  return results.filter(([, codes]) => codes.length > 0)
}

// ── selftest ─────────────────────────────────────────────────────────────────
// Both fixtures are written to a temp directory and compiled for real. The
// broken one reproduces the exact pre-fix shape of the sixteen packages; the
// fixed one reproduces the shape they were corrected to. A gate that has never
// gone red on the defect it claims to catch is not a gate.
const PARENT_TSCONFIG = {
  compilerOptions: {
    composite: true,
    strict: true,
    module: 'nodenext',
    moduleResolution: 'nodenext',
    declaration: true,
  },
  include: ['src'],
  references: [{ path: './tsconfig.node.json' }],
}

const writeFixture = (root, include) => {
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify(PARENT_TSCONFIG))
  writeFileSync(
    join(root, PROJECT_FILENAME),
    JSON.stringify({ extends: './tsconfig.json', compilerOptions: { types: [] }, include }),
  )
  writeFileSync(join(root, 'tool.config.ts'), 'export default { built: true }\n')
  writeFileSync(join(root, 'src', 'rule.ts'), 'export const rule = (n: number): number => n + 1\n')
  // The import that makes the difference: the test pulls in a sibling the
  // referenced project does not list. Under `include: ["src/**/*.test.ts"]`
  // that is TS6307; under the tooling-file include the test is not in this
  // project at all and the parent compiles it instead.
  writeFileSync(
    join(root, 'src', 'rule.test.ts'),
    "import { rule } from './rule.js'\nexport const used = rule(1)\n",
  )
}

const selftest = async () => {
  const failures = []
  const root = mkdtempSync(join(tmpdir(), 'project-references-'))

  try {
    const broken = join(root, 'broken')
    writeFixture(broken, ['src/**/*.test.ts'])
    const brokenCodes = await checkProject(broken)
    if (!brokenCodes.includes('TS6307')) {
      failures.push(
        `  broken fixture (include: ["src/**/*.test.ts"]):\n` +
          `    expected TS6307, got ${JSON.stringify(brokenCodes)}`,
      )
    }

    const fixed = join(root, 'fixed')
    writeFixture(fixed, ['tool.config.ts'])
    const fixedCodes = await checkProject(fixed)
    if (fixedCodes.length > 0) {
      failures.push(
        `  fixed fixture (include: ["tool.config.ts"]):\n` +
          `    expected a clean compile, got ${JSON.stringify(fixedCodes)}`,
      )
    }
  } finally {
    rmSync(root, { force: true, recursive: true })
  }

  // Reach, pinned as a prefix rather than a count: the defect lived under
  // packages/oxlint-plugins/, and a discovery change that stops reaching it
  // leaves every fixture green while guarding nothing.
  const projects = discoverProjects()
  const guarded = projects.filter((dir) => dir.startsWith('packages/oxlint-plugins/'))
  if (guarded.length === 0) {
    failures.push(
      '  reach:\n    discovery no longer reaches packages/oxlint-plugins/ -- the sixteen\n' +
        '    packages that broke live there. Check PROJECT_FILENAME and the git ls-files pattern.',
    )
  }

  if (failures.length > 0) {
    console.error('check-project-references: SELFTEST FAILED\n')
    console.error(failures.join('\n'))
    process.exit(1)
  }
  console.log(
    `check-project-references: selftest ok (2 fixtures; discovery reaches ${guarded.length} project(s) under packages/oxlint-plugins/)`,
  )
}

// ── scan ─────────────────────────────────────────────────────────────────────
const scan = async () => {
  const projects = discoverProjects()
  const failing = await checkAll(projects)

  if (failing.length > 0) {
    console.error(
      `check-project-references: ${failing.length} referenced project(s) do not compile\n`,
    )
    for (const [dir, codes] of failing) {
      console.error(`  ${dir}/${PROJECT_FILENAME}: ${codes.join(', ')}`)
    }
    console.error(
      `\nA referenced project is compiled by \`tsc --build\` -- which the mutation job runs and\n` +
        `\`tsc --noEmit\` does not. Run \`npx tsc -p ${PROJECT_FILENAME} --noEmit\` in the package to see the\n` +
        `errors. TS6307 means the project imports a file it does not list: a referenced project\n` +
        `should list the node-context tooling files outside src (tsdown.config.ts, vitest.config.ts),\n` +
        `not files the parent project already owns.`,
    )
    process.exit(1)
  }

  console.log(`check-project-references: ${projects.length} referenced project(s) compile clean`)
}

// Entry point. Runs only when executed directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selftest')) await selftest()
  else await scan()
}

export { checkAll, checkProject, discoverProjects }
