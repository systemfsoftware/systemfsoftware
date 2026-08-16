/**
 * Label-scheme acceptance tests: the run-id filter query and the keepAlive
 * label swap (behavioral reference: upstream rightsize-node's labels tests
 * and `labels.ts`). The literal wire-format keys are asserted through the
 * function-produced query so every assertion exercises code under test.
 */
import { describe, expect, it } from 'vitest'
import { containerLabels, labelFilterQuery, REUSE_LABEL_KEY, RUN_ID_LABEL_KEY } from '../labels.js'

describe('labelFilterQuery', () => {
  it('Should_BuildTheRunIdLabelFilter_When_GivenARunId', () => {
    expect(labelFilterQuery('deadbeef')).toBe(JSON.stringify({ label: [`${RUN_ID_LABEL_KEY}=deadbeef`] }))
  })

  it('Should_NameTheRunIdKeyAsTheWireFormatLiteral_When_BuildingTheFilter', () => {
    expect(labelFilterQuery('deadbeef')).toContain('dev.rightsize.runId=deadbeef')
  })
})

describe('containerLabels', () => {
  it('Should_CarryOnlyTheRunIdLabel_When_TheContainerIsNotKeepAlive', () => {
    const labels = containerLabels({ keepAlive: false, runId: 'deadbeef', name: 'rz-deadbeef-1' })
    expect(labels).toEqual({ [RUN_ID_LABEL_KEY]: 'deadbeef' })
  })

  it('Should_CarryOnlyTheReuseLabelAndNeverTheRunIdLabel_When_TheContainerIsKeepAlive', () => {
    const labels = containerLabels({ keepAlive: true, runId: 'deadbeef', name: 'rz-reuse-abc123abc123' })
    expect(Object.keys(labels)).toEqual(['dev.rightsize.reuse'])
    expect(labels['dev.rightsize.reuse']).toMatch(/^[0-9a-f]{12}$/)
    expect(labels[RUN_ID_LABEL_KEY]).toBeUndefined()
  })

  it('Should_DeriveTheReuseLabelFromTheName_When_KeepAliveIsSet', () => {
    const first = containerLabels({ keepAlive: true, runId: 'x', name: 'rz-reuse-abc123abc123' })[REUSE_LABEL_KEY]
    const second = containerLabels({ keepAlive: true, runId: 'y', name: 'rz-reuse-abc123abc123' })[REUSE_LABEL_KEY]
    const other = containerLabels({ keepAlive: true, runId: 'x', name: 'rz-reuse-def456def456' })[REUSE_LABEL_KEY]
    expect(first).toBe(second)
    expect(first).not.toBe(other)
  })
})
