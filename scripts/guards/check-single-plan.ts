#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write=/tmp --allow-env
/**
 * Guard: Only allow at most ONE new plan file addition in docs/plans (or docs/plan)
 * between the target base (remote main or compare base) and the pushed commit.
 *
 * Provides an AI-friendly diagnostic that plan documents should be consolidated
 * for pull requests.
 *
 * Can run as:
 *   1. Pre-push hook validator:
 *      deno run ... scripts/guards/check-single-plan.ts <remote-main-sha> <local-sha>
 *   2. Selftest:
 *      deno run ... scripts/guards/check-single-plan.ts --selftest
 *   3. CI / Local gate:
 *      deno run ... scripts/guards/check-single-plan.ts [base-sha] [head-sha]
 */

const dec = new TextDecoder()

export type PlanAdditionCheckResult = {
  readonly ok: boolean
  readonly addedPlans: readonly string[]
  readonly error?: string
}

/**
 * Checks whether a given path is a plan document under docs/plans or docs/plan.
 */
export const isPlanPath = (path: string): boolean => {
  // Matches docs/plans/..., docs/plan/..., or docs/plans.md etc.
  // Standard plan directories in compound engineering: docs/plans/ or docs/plan/
  const normalized = path.replace(/\\/g, '/')
  return (
    normalized.startsWith('docs/plans/') ||
    normalized.startsWith('docs/plan/')
  )
}

/**
 * Parses git diff --name-status output and extracts newly added (A) plan files.
 */
export const extractAddedPlans = (diffNameStatusOutput: string): readonly string[] => {
  const added: string[] = []
  const lines = diffNameStatusOutput.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Formats:
    // A\tpath
    // A100\tpath
    // R100\told\tnew
    // C100\told\tnew
    const parts = trimmed.split(/\t+/)
    const status = parts[0]
    if (status.startsWith('A')) {
      const filePath = parts[1]
      if (filePath && isPlanPath(filePath)) {
        added.push(filePath)
      }
    } else if (status.startsWith('R') || status.startsWith('C')) {
      // For renames/copies, the new destination is the second path
      const destPath = parts[2]
      if (destPath && isPlanPath(destPath)) {
        // If it was renamed into docs/plans from outside, it is effectively a new plan added to docs/plans
        const srcPath = parts[1]
        if (!srcPath || !isPlanPath(srcPath)) {
          added.push(destPath)
        }
      }
    }
  }
  return added
}

export const formatAiDiagnostic = (addedPlans: readonly string[]): string => {
  return [
    `::error::pre-push: Multiple plan file additions detected (${addedPlans.length} plans added).`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `AI AGENT DIAGNOSTIC: CONSOLIDATE PLAN DOCUMENTS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Rule: A Pull Request must introduce at most ONE plan document in docs/plans/.`,
    ``,
    `Detected additions:`,
    ...addedPlans.map((p) => `  - ${p}`),
    ``,
    `Why this rule exists:`,
    `  Pull Requests represent a single cohesive unit of work and delivery.`,
    `  Scattering work across multiple plan documents in a single PR degrades`,
    `  context, bifurcates review trails, and indicates unmerged or uncoordinated`,
    `  agent task artifacts.`,
    ``,
    `Required Remediation for AI Agents:`,
    `  1. Consolidate: Merge the separate plan documents into ONE unified plan file`,
    `     under docs/plans/ covering the full scope of this PR.`,
    `  2. Remove or unstage: Delete or git rm the extra plan files.`,
    `  3. Squash or amend: Update your commits so only one new plan file is added`,
    `     relative to origin/main.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ].join('\n')
}

export const checkPlanAdditions = (diffOutput: string): PlanAdditionCheckResult => {
  const addedPlans = extractAddedPlans(diffOutput)
  if (addedPlans.length > 1) {
    return {
      ok: false,
      addedPlans,
      error: formatAiDiagnostic(addedPlans),
    }
  }
  return {
    ok: true,
    addedPlans,
  }
}

const runGit = async (args: readonly string[]): Promise<string> => {
  const cmd = new Deno.Command('git', {
    args: [...args],
    stdout: 'piped',
    stderr: 'piped',
  })
  const out = await cmd.output()
  if (!out.success) {
    throw new Error(`git ${args.join(' ')} failed: ${dec.decode(out.stderr).trim()}`)
  }
  return dec.decode(out.stdout)
}

const selftest = (): number => {
  const tests: { name: string; run: () => void }[] = [
    {
      name: 'isPlanPath identifies docs/plans and docs/plan',
      run: () => {
        if (!isPlanPath('docs/plans/foo.md')) throw new Error('docs/plans/foo.md should match')
        if (!isPlanPath('docs/plan/bar.md')) throw new Error('docs/plan/bar.md should match')
        if (isPlanPath('packages/foo/docs/plans/bar.md')) throw new Error('packages path should not match')
        if (isPlanPath('docs/solutions/foo.md')) throw new Error('docs/solutions should not match')
        if (isPlanPath('docs/README.md')) throw new Error('docs/README.md should not match')
      },
    },
    {
      name: 'extractAddedPlans handles single addition',
      run: () => {
        const diff = `A\tdocs/plans/2026-09-23-test-plan.md\nM\tpackages/foo/src/index.ts`
        const added = extractAddedPlans(diff)
        if (added.length !== 1 || added[0] !== 'docs/plans/2026-09-23-test-plan.md') {
          throw new Error(`Expected 1 plan, got: ${JSON.stringify(added)}`)
        }
      },
    },
    {
      name: 'extractAddedPlans ignores modifications and deletions',
      run: () => {
        const diff = `M\tdocs/plans/2026-09-23-test-plan.md\nD\tdocs/plans/old-plan.md`
        const added = extractAddedPlans(diff)
        if (added.length !== 0) {
          throw new Error(`Expected 0 added plans, got: ${JSON.stringify(added)}`)
        }
      },
    },
    {
      name: 'checkPlanAdditions rejects multiple plan additions with diagnostic',
      run: () => {
        const diff = [
          'A\tdocs/plans/2026-09-23-plan-a.md',
          'A\tdocs/plans/2026-09-23-plan-b.md',
          'M\tpackages/core/src/index.ts',
        ].join('\n')
        const result = checkPlanAdditions(diff)
        if (result.ok) throw new Error('Should not be ok with 2 added plans')
        if (!result.error?.includes('AI AGENT DIAGNOSTIC: CONSOLIDATE PLAN DOCUMENTS')) {
          throw new Error('Diagnostic missing required header')
        }
        if (!result.error?.includes('docs/plans/2026-09-23-plan-a.md')) {
          throw new Error('Diagnostic missing plan A')
        }
        if (!result.error?.includes('docs/plans/2026-09-23-plan-b.md')) {
          throw new Error('Diagnostic missing plan B')
        }
      },
    },
    {
      name: 'checkPlanAdditions allows 0 or 1 plan addition',
      run: () => {
        const diff0 = `M\tpackages/core/src/index.ts`
        const res0 = checkPlanAdditions(diff0)
        if (!res0.ok) throw new Error('0 additions should be ok')

        const diff1 = `A\tdocs/plans/single-plan.md\nM\tpackages/core/src/index.ts`
        const res1 = checkPlanAdditions(diff1)
        if (!res1.ok) throw new Error('1 addition should be ok')
      },
    },
    {
      name: 'extractAddedPlans handles renames into docs/plans',
      run: () => {
        // Rename from outside docs/plans into docs/plans is a new plan
        const diffRenameIn = `R100\tsrc/old.md\tdocs/plans/new.md`
        const addedIn = extractAddedPlans(diffRenameIn)
        if (addedIn.length !== 1 || addedIn[0] !== 'docs/plans/new.md') {
          throw new Error(`Expected 1 plan for rename into docs/plans, got ${JSON.stringify(addedIn)}`)
        }

        // Rename within docs/plans is NOT a new additional plan
        const diffRenameWithin = `R100\tdocs/plans/old.md\tdocs/plans/new.md`
        const addedWithin = extractAddedPlans(diffRenameWithin)
        if (addedWithin.length !== 0) {
          throw new Error(`Expected 0 added plans for rename within docs/plans, got ${JSON.stringify(addedWithin)}`)
        }
      },
    },
  ]

  let failures = 0
  for (const t of tests) {
    try {
      t.run()
      console.log(`  ✓ ${t.name}`)
    } catch (err) {
      console.error(`  ✗ ${t.name}: ${err instanceof Error ? err.message : String(err)}`)
      failures++
    }
  }

  if (failures > 0) {
    console.error(`check-single-plan: selftest FAILED (${failures}/${tests.length})`)
    return 1
  }
  console.log(`check-single-plan: selftest ok (${tests.length} tests)`)
  return 0
}

const main = async (): Promise<number> => {
  const args = Deno.args
  if (args.includes('--selftest')) {
    return selftest()
  }

  let baseSha = args[0]
  const headSha = args[1] || 'HEAD'

  if (!baseSha) {
    // If no baseSha is provided, resolve origin/main or HEAD~1
    try {
      baseSha = (await runGit(['merge-base', 'origin/main', headSha])).trim()
    } catch {
      try {
        baseSha = (await runGit(['rev-parse', `${headSha}~1`])).trim()
      } catch {
        // Empty tree
        baseSha = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
      }
    }
  }

  // Get diff name-status between base and head
  let diffOutput = ''
  try {
    diffOutput = await runGit(['diff', '--name-status', `${baseSha}...${headSha}`])
  } catch {
    // Fall back to direct two-dot diff
    diffOutput = await runGit(['diff', '--name-status', baseSha, headSha])
  }

  const result = checkPlanAdditions(diffOutput)
  if (!result.ok) {
    console.error(result.error)
    return 1
  }

  return 0
}

if (import.meta.main) {
  try {
    const code = await main()
    Deno.exit(code)
  } catch (err) {
    console.error(`check-single-plan: error: ${err instanceof Error ? err.message : String(err)}`)
    Deno.exit(1)
  }
}
