import { parseArgs } from '@std/cli/parse-args'

export interface Reuse {
  readonly reused: number
  readonly ran: number
  readonly refused: Readonly<Record<string, number>>
}

export type PriorVerdict =
  | { readonly _tag: 'NothingToRead' }
  | { readonly _tag: 'Read'; readonly named: number; readonly reuse: Reuse }
  | { readonly _tag: 'NoReuseReport'; readonly named: number }
  | { readonly _tag: 'Unread'; readonly named: number; readonly reuse: Reuse }

const objectOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

const arrayOf = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : []

const countOf = (value: unknown): number => typeof value === 'number' && Number.isInteger(value) ? value : 0

export const shardIdsOf = (plan: unknown, index: number): ReadonlySet<string> =>
  new Set(
    arrayOf(objectOf(plan).shards)
      .filter((shard) => objectOf(shard).index === index)
      .flatMap((shard) =>
        arrayOf(objectOf(shard).projects).flatMap((project) =>
          arrayOf(objectOf(project).mutants).filter((id): id is string => typeof id === 'string')
        )
      ),
  )

export const recordIdsOf = (record: unknown): ReadonlySet<string> =>
  new Set(
    Object.values(objectOf(objectOf(record).files)).flatMap((file) =>
      arrayOf(objectOf(file).mutants).flatMap((mutant) => {
        const id = objectOf(mutant).id
        return typeof id === 'string' ? [id] : []
      })
    ),
  )

export const reuseOf = (stream: string): Reuse | undefined => {
  const event = stream.split('\n').flatMap((line) => {
    if (line.trim() === '') return []
    try {
      const parsed = objectOf(JSON.parse(line))
      return parsed._tag === 'reuse' ? [parsed] : []
    } catch {
      return []
    }
  })[0]
  if (event === undefined) return undefined
  const refused = Object.fromEntries(Object.entries(objectOf(event.refused)).map(([reason, n]) => [reason, countOf(n)]))
  return { reused: countOf(event.reused), ran: countOf(event.ran), refused }
}

export const priorVerdictOf = (
  planned: ReadonlySet<string>,
  prior: ReadonlySet<string>,
  reuse: Reuse | undefined,
): PriorVerdict => {
  const named = [...planned].filter((id) => prior.has(id)).length
  if (named === 0) return { _tag: 'NothingToRead' }
  if (reuse === undefined) return { _tag: 'NoReuseReport', named }
  const unread = reuse.reused === 0 && reuse.ran > 0 && (reuse.refused.noPriorRecord ?? 0) === reuse.ran
  return unread ? { _tag: 'Unread', named, reuse } : { _tag: 'Read', named, reuse }
}

const reuseLineOf = (reuse: Reuse): string => {
  const reasons = Object.entries(reuse.refused).filter(([, n]) => n > 0).map(([reason, n]) => `${reason} ${n}`)
  return `reused ${reuse.reused}, ran ${reuse.ran}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`
}

const USAGE =
  'usage: prior-read --plan <plan.json> --shard <k> --prior <record.json> --stream <mutation-stream.jsonl> ' +
  '[--reason-file <file>]'

const writeReason = async (reasonFile: string | undefined, code: string): Promise<void> => {
  if (reasonFile !== undefined && reasonFile !== '') await Deno.writeTextFile(reasonFile, `${code}\n`)
}

const textOf = (path: string): Promise<string | undefined> => Deno.readTextFile(path).catch(() => undefined)

const main = async (): Promise<number> => {
  const args = parseArgs(Deno.args, { string: ['plan', 'shard', 'prior', 'stream', 'reason-file'] })
  const shard = Number(args.shard)
  if ([args.plan, args.prior, args.stream].some((value) => value === undefined || value === '') || !(shard >= 1)) {
    console.error(USAGE)
    return 2
  }
  const reasonFile = args['reason-file']
  const planText = await textOf(args.plan ?? '')
  if (planText === undefined) {
    await writeReason(reasonFile, 'mutation-tool-misused')
    console.error(`mutation-tool-misused: cannot read the plan ${JSON.stringify(args.plan)}. ${USAGE}`)
    return 1
  }
  const priorText = await textOf(args.prior ?? '')
  if (priorText === undefined) {
    console.log('no prior record')
    return 0
  }
  const planned = shardIdsOf(JSON.parse(planText), shard)
  let prior: ReadonlySet<string>
  try {
    prior = recordIdsOf(JSON.parse(priorText))
  } catch {
    await writeReason(reasonFile, 'mutation-prior-unread')
    console.error(
      `mutation-prior-unread: the prior record ${
        JSON.stringify(args.prior)
      } is not JSON, so stryker read none of it. ` +
        'Next: delete the stryker-incremental cache entry this job restored and re-run the workflow.',
    )
    return 1
  }
  const verdict = priorVerdictOf(planned, prior, reuseOf(await textOf(args.stream ?? '') ?? ''))
  if (verdict._tag === 'NothingToRead') {
    console.log(`the prior record names none of the ${planned.size} planned mutants`)
    return 0
  }
  if (verdict._tag === 'Read') {
    console.log(`${reuseLineOf(verdict.reuse)}; the prior record names ${verdict.named} of ${planned.size}`)
    return 0
  }
  await writeReason(reasonFile, 'mutation-prior-unread')
  console.error(
    verdict._tag === 'NoReuseReport'
      ? `mutation-prior-unread: ${JSON.stringify(args.stream)} holds no reuse event, so nothing shows the run read ` +
        `the prior record that names ${verdict.named} of its ${planned.size} planned mutants. ` +
        'Next: read the run log for why stryker stopped before planning its mutants.'
      : `mutation-prior-unread: the prior record ${JSON.stringify(args.prior)} names ${verdict.named} of the ` +
        `${planned.size} planned mutants, yet the run found a record for none (${reuseLineOf(verdict.reuse)}). ` +
        "Next: make the project's stryker config read that file: it must be the incremental file or match an " +
        '`incrementalSources` pattern, such as `reports/stryker-incremental-*.json`.',
  )
  return 1
}

if (import.meta.main) Deno.exit(await main())
