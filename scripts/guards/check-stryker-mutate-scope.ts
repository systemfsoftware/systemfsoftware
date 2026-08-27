#!/usr/bin/env -S deno run --allow-read --allow-run=git

interface Finding {
  readonly configPath: string
  readonly detail: string
}

export const findingsInStrykerConfig = (configPath: string, configJson: string): readonly Finding[] => {
  let parsed: { mutate?: unknown }
  try {
    parsed = JSON.parse(configJson)
  } catch (error) {
    return [{ configPath, detail: `unparseable JSON: ${error instanceof Error ? error.message : String(error)}` }]
  }

  const mutate = parsed.mutate
  if (!Array.isArray(mutate) || mutate.length === 0) {
    return [{
      configPath,
      detail: 'mutate must be an explicit non-empty array targeting workflow.ts files',
    }]
  }

  const findings: Finding[] = []

  const positives = mutate.filter((pattern: unknown): pattern is string =>
    typeof pattern === 'string' && !pattern.startsWith('!')
  )

  if (positives.length === 0) {
    findings.push({
      configPath,
      detail: 'mutate contains no positive patterns',
    })
  }

  for (const pattern of positives) {
    if (pattern.includes('.workflow.ts')) continue
    findings.push({
      configPath,
      detail: `mutate positive pattern "${pattern}" does not restrict mutation to *.workflow.ts files`,
    })
  }

  return findings
}

export const isWorkspaceStrykerConfig = (path: string): boolean => {
  if (!path.endsWith('stryker.config.json')) return false
  if (path.startsWith('repos/')) return false
  if (path.includes('__fixtures__') || path.includes('/fixtures/')) return false
  if (path.includes('node_modules/')) return false
  if (path.startsWith('packages/lint/oxlint/')) return false
  return true
}

const trackedFiles = async (): Promise<readonly string[]> => {
  const git = new Deno.Command('git', { args: ['ls-files', '-z'], stdout: 'piped', stderr: 'piped' })
  const { code, stdout, stderr } = await git.output()
  if (code !== 0) throw new Error(`git ls-files failed: ${new TextDecoder().decode(stderr)}`)
  return new TextDecoder()
    .decode(stdout)
    .split('\0')
    .filter((path) => path !== '')
    .filter(isWorkspaceStrykerConfig)
}

const selftest = (): number => {
  const failures: string[] = []

  const validConfig = JSON.stringify({
    extends: '../../stryker.config.base.json',
    mutate: [
      'src/**/*.workflow.ts',
      '!src/**/*.test.ts',
      '!src/**/*.property.test.ts',
    ],
  })

  const invalidBroadConfig = JSON.stringify({
    extends: '../../stryker.config.base.json',
    mutate: [
      'src/**/*.ts',
      '!src/**/*.test.ts',
    ],
  })

  const emptyMutateConfig = JSON.stringify({
    extends: '../../stryker.config.base.json',
    mutate: [],
  })

  const missingMutateConfig = JSON.stringify({
    extends: '../../stryker.config.base.json',
  })

  if (findingsInStrykerConfig('packages/core/stryker.config.json', validConfig).length !== 0) {
    failures.push('valid workflow mutate config was rejected')
  }

  if (findingsInStrykerConfig('packages/core/stryker.config.json', invalidBroadConfig).length === 0) {
    failures.push('broad src/**/*.ts mutate config was erroneously accepted')
  }

  if (findingsInStrykerConfig('packages/core/stryker.config.json', emptyMutateConfig).length === 0) {
    failures.push('empty mutate array was erroneously accepted')
  }

  if (findingsInStrykerConfig('packages/core/stryker.config.json', missingMutateConfig).length === 0) {
    failures.push('missing mutate key was erroneously accepted')
  }

  if (
    isWorkspaceStrykerConfig(
      'packages/testing/mutation/stryker-js/cli/tests/__fixtures__/fixtures/broken-config-project/stryker.config.json',
    )
  ) {
    failures.push('fixture stryker config was not excluded')
  }

  if (!isWorkspaceStrykerConfig('packages/core/effect/daemon-spec/stryker.config.json')) {
    failures.push('workspace stryker config was wrongly excluded')
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`selftest: ${failure}`)
    console.error(`selftest FAILED: ${failures.length} case(s)`)
    return 1
  }

  console.log('selftest ok: 6 cases')
  return 0
}

if (import.meta.main) {
  if (Deno.args.includes('--selftest')) Deno.exit(selftest())

  const files = await trackedFiles()
  const findings: Finding[] = []

  for (const file of files) {
    const contents = await Deno.readTextFile(file).catch(() => null)
    if (contents === null) continue
    findings.push(...findingsInStrykerConfig(file, contents))
  }

  if (files.length === 0) {
    console.error(
      '::error::found 0 workspace stryker.config.json files — the gate scanned nothing, so its silence proves nothing',
    )
    Deno.exit(1)
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.configPath}: ${finding.detail}`)
    }
    console.error(
      `\n${findings.length} Stryker config mutate scope violation(s). Mutate glob must target *.workflow.ts only.`,
    )
    Deno.exit(1)
  }

  console.log(
    `check-stryker-mutate-scope: ${files.length} workspace stryker config(s) clean — mutate glob restricted to *.workflow.ts`,
  )
}
