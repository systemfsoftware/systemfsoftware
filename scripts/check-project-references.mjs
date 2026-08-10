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
//
// Second gate on the same filename: every tsconfig.node.json under packages/
// must extend `@systemfsoftware/tsconfig/node`. One rule -- the exact extends
// string, not include contents, not compilerOptions, not key order -- so the
// preset stays the single source of the options it supplies.

import { parse } from '@std/jsonc'
import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const TSC = join(repoRoot, 'node_modules', '.bin', 'tsc')

const PROJECT_FILENAME = 'tsconfig.node.json'

const PRESET_EXTENDS = '@systemfsoftware/tsconfig/node'

// ── discovery ────────────────────────────────────────────────────────────────
// `git ls-files` rather than a directory walk: tracked-only excludes stryker
// sandboxes (.stryker-tmp/**), build output, and every other untracked copy by
// construction, with no exclusion list to drift out of date. One pathspec
// exclusion earns its place: `repos/` is vendored, read-only under REPO-S3, so
// a tsconfig.node.json in there is upstream's, is referenced by nothing we own,
// and can never be repaired here. Scanning it reports failures no one in this
// repo is permitted to fix -- the same boundary check-lint-coverage draws.
const discoverProjects = () =>
  execFileSync('git', ['ls-files', `**/${PROJECT_FILENAME}`, ':(exclude)repos/**'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
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

// The preset-extends rule: every file named tsconfig.node.json under packages/
// must have a top-level "extends" whose value is exactly PRESET_EXTENDS. The
// rule enforces nothing else -- not include contents, not compilerOptions, not
// key order -- so a file that restates the preset's options beside it fails
// this check and nothing more. Returns the offending extends value as a
// display string, or null when the file complies. Takes raw file text so the
// selftest drives the full read-decode-check path over in-memory strings.
const checkNodeConfig = (source) => {
  let config
  try {
    // `@std/jsonc` rejects a leading BOM (its whitespace set is ` \t\r\n`) but
    // tsc accepts one -- the same decode-boundary strip the two consumers use.
    config = parse(source.replace(/^\uFEFF/, ''))
  } catch (error) {
    return `(unparseable: ${error.message})`
  }
  if (config === null || typeof config !== 'object') {
    return '(not an object)'
  }
  const { extends: extendsValue } = config
  if (extendsValue === PRESET_EXTENDS) return null
  return extendsValue === undefined ? '(missing)' : JSON.stringify(extendsValue)
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

  // Preset-extends fixtures are in-memory strings: the rule is a static shape
  // check, so unlike the compile fixtures it needs no temp directory, and
  // driving checkNodeConfig over raw text pins the parse path (including the
  // @std/jsonc resolution) as well as the verdict. The accepted side is the
  // canonical file; the rejected sides are the two ways the convention has
  // actually been violated here -- extending the sibling tsconfig.json and
  // hand-rolling compilerOptions, and omitting extends entirely.
  const NODE_CONFIG_FIXTURES = [
    {
      label: 'extends the shared preset',
      source: `{
  "extends": "@systemfsoftware/tsconfig/node",
  "include": [
    "tsdown.config.ts",
    "vitest.config.ts"
  ]
}
`,
      expected: null,
    },
    {
      label: 'extends "./tsconfig.json" with hand-rolled compilerOptions',
      source: `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["tsdown.config.ts", "vitest.config.ts"]
}
`,
      expected: '"./tsconfig.json"',
    },
    {
      label: 'no extends key at all',
      source: `{
  "include": ["tsdown.config.ts"]
}
`,
      expected: '(missing)',
    },
  ]
  for (const { label, source, expected } of NODE_CONFIG_FIXTURES) {
    const actual = checkNodeConfig(source)
    if (actual !== expected) {
      failures.push(
        `  preset-extends fixture (${label}):\n` +
          `    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      )
    }
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
    `check-project-references: selftest ok (5 fixtures: 2 compile + 3 preset-extends; discovery reaches ${guarded.length} project(s) under packages/oxlint-plugins/)`,
  )
}

// ── scan ─────────────────────────────────────────────────────────────────────
const scan = async () => {
  const projects = discoverProjects()

  // Preset-extends gate, before the compile pass: a config that hand-rolls the
  // preset's options is a convention violation first, and its tsc result would
  // be noise while it is being repaired. Scoped to packages/ -- the only place
  // these files exist -- by filtering the tracked set discovery already
  // returns, so no vendored-tree special cases are needed.
  const configViolations = projects
    .filter((dir) => dir.startsWith('packages/'))
    .map((dir) => join(dir, PROJECT_FILENAME))
    .map((file) => [file, checkNodeConfig(readFileSync(file, 'utf8'))])
    .filter(([, violation]) => violation !== null)

  if (configViolations.length > 0) {
    console.error(
      `check-project-references: ${configViolations.length} tsconfig.node.json file(s) under packages/ do not extend the shared preset\n`,
    )
    for (const [file, violation] of configViolations) {
      console.error(`  ${file}: extends ${violation}`)
    }
    console.error(
      `\nEvery tsconfig.node.json must extend "@systemfsoftware/tsconfig/node", which supplies\n` +
        `types: ["node"], composite, module, moduleResolution, allowSyntheticDefaultImports, and skipLibCheck.\n` +
        `A hand-rolled compilerOptions block beside the preset is a second convention; delete it and keep\n` +
        `only the file's own include.`,
    )
    process.exit(1)
  }

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

export { checkAll, checkNodeConfig, checkProject, discoverProjects }
