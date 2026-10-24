// record-pricing - decide whether a project's incremental records may price its shard plan.
//
//   record-pricing --plan mutation-plan-<slug>.json <record.json>...
//
// A record holds a cost entry for every mutant, but only a mutant a test run executed carries a measured
// `actualMs`. The rest (CompileError, Ignored, NoCoverage, and mutants new since the record) carry only
// `predictedMs`, which stryker sets to the whole suite's time, so a record prices the plan only when it
// measured every mutant the plan lists. Prints `record\t<measured>\t<planned>` when it did, otherwise
// `seed\t<measured>\t<planned>` (the plan is priced by the seed rate), and exits 0.

import { parseArgs } from '@std/cli/parse-args'
import { objectOf, plannedIdsOf } from './mutation-plan.ts'

export type Pricing =
  | { readonly _tag: 'Record'; readonly planned: number }
  | { readonly _tag: 'Seed'; readonly measured: number; readonly planned: number }

/** The mutant ids whose cost some record measured. */
export const measuredIdsOf = (records: readonly unknown[]): ReadonlySet<string> =>
  new Set(
    records.flatMap((record) =>
      Object.entries(objectOf(objectOf(record).costs)).flatMap(([id, entry]) => {
        const actualMs = objectOf(entry).actualMs
        return typeof actualMs === 'number' && Number.isFinite(actualMs) ? [id] : []
      })
    ),
  )

export const pricingOf = (planned: ReadonlySet<string>, measured: ReadonlySet<string>): Pricing => {
  const covered = [...planned].filter((id) => measured.has(id)).length
  return planned.size > 0 && covered === planned.size
    ? { _tag: 'Record', planned: planned.size }
    : { _tag: 'Seed', measured: covered, planned: planned.size }
}

const readJson = async (path: string): Promise<unknown> => JSON.parse(await Deno.readTextFile(path))

const main = async (): Promise<number> => {
  const args = parseArgs(Deno.args, { string: ['plan'] })
  if (args.plan === undefined || args.plan === '') {
    console.error('usage: record-pricing --plan <plan.json> <record.json>...')
    return 2
  }
  const planned = plannedIdsOf(await readJson(args.plan))
  const records = await Promise.all(args._.map((path) => readJson(String(path))))
  const pricing = pricingOf(planned, measuredIdsOf(records))
  console.log(
    pricing._tag === 'Record'
      ? `record\t${pricing.planned}\t${pricing.planned}`
      : `seed\t${pricing.measured}\t${pricing.planned}`,
  )
  return 0
}

if (import.meta.main) Deno.exit(await main())
