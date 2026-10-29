const decoder = new TextDecoder()

const command = async (cmd: string, args: readonly string[], env: Record<string, string> = {}) => {
  const out = await new Deno.Command(cmd, { args: [...args], env, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${out.code}: ${decoder.decode(out.stderr)}`)
  }
  return decoder.decode(out.stdout)
}

const git = async (...args: readonly string[]) => (await command('git', args)).trim()

interface Package {
  readonly name: string
  readonly path: string
}

interface Manifest {
  readonly scripts?: Record<string, string>
  readonly devDependencies?: Record<string, string>
}

const turboLs = async (env: Record<string, string>, affected: boolean): Promise<readonly Package[]> => {
  const text = await command('corepack', [
    'pnpm',
    'exec',
    'turbo',
    'ls',
    ...affected ? ['--affected'] : [],
    '--output=json',
  ], env)
  const json: { packages: { items: Package[] } } = JSON.parse(text.slice(text.indexOf('{')))
  return json.packages.items
}

const manifest = async (pkg: Package): Promise<Manifest> =>
  JSON.parse(await Deno.readTextFile(`${pkg.path}/package.json`))

const owner = (packages: readonly Package[], file: string): Package | undefined =>
  packages
    .filter((pkg) => file.startsWith(`${pkg.path}/`))
    .reduce<Package | undefined>(
      (best, pkg) => (best === undefined || pkg.path.length > best.path.length ? pkg : best),
      undefined,
    )

const otherTestTasks = ['test:engine']

const plan = async (base: string) => {
  const head = await git('rev-parse', 'HEAD')
  const scm = { TURBO_SCM_BASE: base, TURBO_SCM_HEAD: head }
  const changed = (await git('diff', '--name-only', '--diff-filter=AMR', '-z', base, head)).split('\0').filter(Boolean)
  const [all, affected] = await Promise.all([turboLs(scm, false), turboLs(scm, true)])
  const manifests = new Map(await Promise.all(all.map(async (pkg) => [pkg.name, await manifest(pkg)] as const)))

  const filesByPackage = new Map<string, string[]>()
  for (const file of changed) {
    const pkg = owner(all, file)
    if (pkg === undefined) continue
    filesByPackage.set(pkg.name, [...filesByPackage.get(pkg.name) ?? [], file.slice(pkg.path.length + 1)])
  }

  const commands: string[][] = [[
    'corepack',
    'pnpm',
    'exec',
    'turbo',
    'run',
    'test',
    '--affected',
    '--continue',
    '--concurrency=50%',
    '--output-logs=new-only',
    '--log-order=stream',
    '--',
    `--changed=${base}`,
    '--passWithNoTests',
  ]]
  for (const [name, files] of filesByPackage) {
    for (const task of otherTestTasks) {
      if (manifests.get(name)?.scripts?.[task] === undefined) continue
      commands.push([
        'corepack',
        'pnpm',
        'exec',
        'turbo',
        'run',
        task,
        `--filter=${name}`,
        '--output-logs=new-only',
        '--',
        '--passWithNoTests',
        ...files,
      ])
    }
  }

  const browserPackages = affected.filter((pkg) => {
    const json = manifests.get(pkg.name)
    return json?.scripts?.test !== undefined && json.devDependencies?.playwright !== undefined
  })
  return { head, scm, changed, affected, commands, browserPackages }
}

const mode = Deno.args[0]
if (mode !== 'plan' && mode !== 'run') {
  console.error('usage: pr-tests.ts plan|run')
  Deno.exit(2)
}
const base = Deno.env.get('BASE') || await git('rev-parse', 'HEAD^1')
const { head, scm, changed, affected, commands, browserPackages } = await plan(base)

if (mode === 'plan') {
  console.log(`base ${base}, head ${head}: ${changed.length} changed files, ${affected.length} affected packages`)
  for (const pkg of affected) console.log(`  affected ${pkg.name}`)
  for (const cmd of commands) console.log(cmd.join(' '))
  const output = Deno.env.get('GITHUB_OUTPUT')
  if (output) {
    const browserPackage = browserPackages[0]?.name ?? ''
    await Deno.writeTextFile(
      output,
      `base=${base}\nbrowsers=${browserPackages.length > 0}\nbrowser-package=${browserPackage}\n`,
      { append: true },
    )
  }
} else {
  let failed = false
  for (const [cmd, ...args] of commands) {
    console.log(`::group::${[cmd, ...args].join(' ')}`)
    const status = await new Deno.Command(cmd, { args, env: scm, stdout: 'inherit', stderr: 'inherit' }).spawn().status
    console.log('::endgroup::')
    if (!status.success) {
      console.log(`::error title=pr-tests::${[cmd, ...args].join(' ')} exited ${status.code}`)
      failed = true
    }
  }
  Deno.exit(failed ? 1 : 0)
}
