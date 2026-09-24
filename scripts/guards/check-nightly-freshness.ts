#!/usr/bin/env -S deno run --allow-env=GITHUB_TOKEN,GITHUB_REPOSITORY --allow-net=api.github.com

const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1000
const WORKFLOW_FILE = 'nightly-conformance.yml'
const WORKFLOW_NAME = 'nightly conformance'

export type WorkflowRun = {
  readonly id: number
  readonly status: string
  readonly conclusion: string | null
  readonly head_branch: string
  readonly created_at: string
  readonly html_url: string
}

export type NightlyVerdict =
  | { readonly ok: true; readonly run: WorkflowRun }
  | {
    readonly ok: false
    readonly reason: 'missing' | 'failed' | 'stale'
    readonly message: string
    readonly remedy: string
  }

const recoveryCommand = 'gh workflow run nightly-conformance.yml'

export const latestCompletedRun = (runs: readonly WorkflowRun[]): WorkflowRun | null => {
  const completed = runs.filter((run) => run.status === 'completed')
  if (completed.length === 0) return null
  return completed.reduce((newest, run) => Date.parse(run.created_at) > Date.parse(newest.created_at) ? run : newest)
}

const ageMs = (run: WorkflowRun, now: Date): number => now.getTime() - Date.parse(run.created_at)

const hours = (ms: number): string => (ms / (60 * 60 * 1000)).toFixed(1)

export const decideNightlyGate = (
  runs: readonly WorkflowRun[],
  now: Date,
): NightlyVerdict => {
  const latest = latestCompletedRun(runs)
  if (latest === null) {
    return {
      ok: false,
      reason: 'missing',
      message: `no completed ${WORKFLOW_NAME} run on main — the nightly conformance budget has never been explored`,
      remedy: `run '${recoveryCommand}' (workflow_dispatch) on main, let it pass, then re-run this release`,
    }
  }

  if (latest.conclusion !== 'success') {
    return {
      ok: false,
      reason: 'failed',
      message: `the latest ${WORKFLOW_NAME} run on main did not pass (conclusion: ${
        latest.conclusion ?? 'unknown'
      }) ${latest.html_url}`,
      remedy: `fix the failure, then run '${recoveryCommand}' (workflow_dispatch) on main`,
    }
  }

  const age = ageMs(latest, now)
  if (age >= FRESHNESS_WINDOW_MS) {
    return {
      ok: false,
      reason: 'stale',
      message: `the latest green ${WORKFLOW_NAME} run on main is ${hours(age)}h old (limit ${
        hours(FRESHNESS_WINDOW_MS)
      }h) ${latest.html_url}`,
      remedy: `run '${recoveryCommand}' (workflow_dispatch) on main, let it pass, then re-run this release`,
    }
  }

  return { ok: true, run: latest }
}

const selftest = (): number => {
  const now = new Date('2026-09-23T12:00:00Z')
  const hoursAgo = (h: number): string => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString()

  const run = (over: Partial<WorkflowRun>): WorkflowRun => ({
    id: 1,
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    created_at: hoursAgo(1),
    html_url: 'https://github.com/systemfsoftware/systemfsoftware/actions/runs/1',
    ...over,
  })

  const tests: { name: string; run: () => void }[] = [
    {
      name: 'missing: no nightly run on main fails and names workflow_dispatch as recovery',
      run: () => {
        const verdict = decideNightlyGate([], now)
        if (verdict.ok) throw new Error('empty run list must fail')
        if (verdict.reason !== 'missing') throw new Error(`expected missing, got ${verdict.reason}`)
        if (!verdict.remedy.includes('workflow_dispatch')) throw new Error('remedy must name workflow_dispatch')
        if (!verdict.remedy.includes('gh workflow run nightly-conformance.yml')) {
          throw new Error('remedy must name the dispatch command')
        }
        if (!verdict.message.includes('no completed')) throw new Error('message must state the run is missing')
      },
    },
    {
      name: 'failed: latest nightly run did not pass',
      run: () => {
        const verdict = decideNightlyGate([run({ conclusion: 'failure' })], now)
        if (verdict.ok) throw new Error('a failed run must not pass')
        if (verdict.reason !== 'failed') throw new Error(`expected failed, got ${verdict.reason}`)
        if (!verdict.message.includes('failure')) throw new Error('message must name the conclusion')
      },
    },
    {
      name: 'stale: a green run older than 48h fails',
      run: () => {
        const verdict = decideNightlyGate([run({ created_at: hoursAgo(49) })], now)
        if (verdict.ok) throw new Error('a stale run must not pass')
        if (verdict.reason !== 'stale') throw new Error(`expected stale, got ${verdict.reason}`)
        if (!verdict.remedy.includes('workflow_dispatch')) throw new Error('remedy must name workflow_dispatch')
      },
    },
    {
      name: 'fresh: a green run less than 48h old passes',
      run: () => {
        const verdict = decideNightlyGate([run({ created_at: hoursAgo(1) })], now)
        if (!verdict.ok) throw new Error(`a fresh green run must pass, got ${verdict.reason}: ${verdict.message}`)
        if (verdict.run.id !== 1) throw new Error('the verdict must carry the passing run')
      },
    },
    {
      name: 'boundary: exactly 48h old is stale',
      run: () => {
        const verdict = decideNightlyGate([run({ created_at: hoursAgo(48) })], now)
        if (verdict.ok || verdict.reason !== 'stale') throw new Error('exactly 48h must be stale')
      },
    },
    {
      name: 'selection: the newest COMPLETED run decides, in-progress runs are ignored',
      run: () => {
        const passing = run({ id: 7, created_at: hoursAgo(2) })
        const older = run({ id: 6, conclusion: 'failure', created_at: hoursAgo(3) })
        const inProgress = run({ id: 9, status: 'in_progress', conclusion: null, created_at: hoursAgo(0.1) })
        const verdict = decideNightlyGate([inProgress, passing, older], now)
        if (!verdict.ok || verdict.run.id !== 7) throw new Error('the newest completed passing run must decide')
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
    console.error(`check-nightly-freshness: selftest FAILED (${failures}/${tests.length})`)
    return 1
  }
  console.log(`check-nightly-freshness: selftest ok (${tests.length} tests)`)
  return 0
}

type RunsResponse = { readonly workflow_runs?: readonly WorkflowRun[] }

const fetchCompletedRuns = async (repo: string, token: string): Promise<readonly WorkflowRun[]> => {
  const url = new URL(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs`)
  url.searchParams.set('branch', 'main')
  url.searchParams.set('status', 'completed')
  url.searchParams.set('per_page', '30')

  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  })
  if (!response.ok) {
    const body = (await response.text()).trim()
    throw new Error(`GitHub API returned ${response.status} for ${url.pathname}: ${body}`)
  }
  const doc = (await response.json()) as RunsResponse
  return doc.workflow_runs ?? []
}

const main = async (): Promise<number> => {
  if (Deno.args.includes('--selftest')) return selftest()

  const token = Deno.env.get('GITHUB_TOKEN')
  const repo = Deno.env.get('GITHUB_REPOSITORY')
  if (!token) throw new Error('GITHUB_TOKEN is required (the release workflow passes it)')
  if (!repo) throw new Error('GITHUB_REPOSITORY is required (the release workflow passes it)')

  const runs = await fetchCompletedRuns(repo, token)
  const verdict = decideNightlyGate(runs, new Date())

  if (verdict.ok) {
    console.error(
      `check-nightly-freshness: ok — latest nightly conformance run on main passed ${verdict.run.html_url}`,
    )
    return 0
  }

  console.error(verdict.message)
  console.error(`remedy: ${verdict.remedy}`)
  console.error(`::error title=nightly conformance is not fresh green on main::${verdict.message}`)
  return 1
}

if (import.meta.main) {
  try {
    Deno.exit(await main())
  } catch (err) {
    console.error(`check-nightly-freshness: error: ${err instanceof Error ? err.message : String(err)}`)
    Deno.exit(1)
  }
}
