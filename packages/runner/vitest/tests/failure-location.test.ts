/**
 * Where a failure's first location comes from when the fork is the thing that raised it. A check is deferred: the
 * body writes `expect(...)` and the driver judges it later, so the check's own stack holds only the fork's frames.
 * The author's line is captured at the call and becomes the failure's raising frame, so the record still leads with
 * the line that wrote the check instead of being refused for naming no location (R2, KTD6).
 *
 * The values the checks and properties carry are deliberately free of any `path:line`, so a location in the record
 * can only have come from the raising frame; each expectation is the site of the statement that called this.
 */
import { it } from '@systemfsoftware/vitest'
import { type FailureRecord, type RecordedRun, recordOfProperty, recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect } from 'effect'
import { refutedProperty } from './__fixtures__/failure-corpus/refuted-property.js'

const FRAME = /\s\(?((?:file:\/\/)?\/[^()\s]+):(\d+):(\d+)\)?$/u
const RAISED_AT = /^ {2}raised at (.+?)(?: \([^)]*\))?$/u

/**
 * Pushes the `file:line` of the statement that called this into `sites` and returns `marker`, so the caller's value
 * carries no location of its own.
 */
const atThisLine = (sites: Array<string>, marker: string): string => {
  const frame = `${new Error('site').stack ?? ''}`.split('\n')[2] ?? ''
  const [, file = '', line = ''] = FRAME.exec(frame.trim()) ?? []
  sites.push(`${file}:${line}`)
  return marker
}

const raisedSiteOf = (record: FailureRecord | undefined): string | undefined =>
  RAISED_AT.exec(record?.record.split('\n')[1] ?? '')?.[1]

/** The record writes locations repo-relative while a stack frame carries the absolute path: compare the part it keeps. */
const repoRelative = (site: string | undefined): string | undefined => site?.replace(/^.*\/packages\//u, 'packages/')

const checking = (sites: Array<string>): RecordedRun<void, never> => (checks) =>
  checks.expect(atThisLine(sites, 'the check the body wrote')).toEqual('never')

const refutedOf = (sites: Array<string>): Promise<FailureRecord | undefined> =>
  recordOfProperty({ ...refutedProperty, name: atThisLine(sites, 'the refuted property') })

/** A verdict that is a number at run time while its signature says boolean: one way a plain body returns one. */
const notABoolean = (): { readonly value: boolean } => {
  const verdict: { value: boolean } = { value: true }
  return Object.assign(verdict, { value: 1 })
}

const NOT_BOOLEAN = { holds: () => notABoolean().value }

const notBooleanOf = (sites: Array<string>): Promise<FailureRecord | undefined> =>
  recordOfProperty({ ...refutedProperty, ...NOT_BOOLEAN, name: atThisLine(sites, 'not a boolean') })

it('Should_NameTheCheckLine_When_TheCheckFails', function*({ expect }) {
  const sites: Array<string> = []
  const record = yield* Effect.promise(() => recordOfRun(checking(sites)))
  yield* expect({ breaches: record?.breaches, raisedAt: raisedSiteOf(record) }).toEqual({
    breaches: [],
    raisedAt: repoRelative(sites[0]),
  })
})

it('Should_NameTheDeclarationLine_When_ThePropertyIsFalsified', function*({ expect }) {
  const sites: Array<string> = []
  const record = yield* Effect.promise(() => refutedOf(sites))
  yield* expect({
    breaches: record?.breaches,
    raisedAt: raisedSiteOf(record),
    carriesTheReplay: record?.record.includes('CONFORMANCE_REPLAY="seed=1;path='),
  }).toEqual({ breaches: [], raisedAt: repoRelative(sites[0]), carriesTheReplay: true })
})

it('Should_NameTheDeclarationLine_When_TheVerdictIsNotBoolean', function*({ expect }) {
  const sites: Array<string> = []
  const record = yield* Effect.promise(() => notBooleanOf(sites))
  yield* expect({ breaches: record?.breaches, raisedAt: raisedSiteOf(record) }).toEqual({
    breaches: [],
    raisedAt: repoRelative(sites[0]),
  })
})
