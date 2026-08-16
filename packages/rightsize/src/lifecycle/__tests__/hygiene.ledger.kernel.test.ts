/**
 * The hygiene ledger kernel — the names-only, atomic, cross-process legible
 * persistence protocol (R6/R7): entry round-trips, the run record, the
 * id-fingerprint rewrite, prune-on-untrack, torn-line tolerance, and the
 * sweep's liveness judgment (dead → reap, alive → leave, own run → skip).
 * Promise-chained (the effect TS profile bans async function declarations).
 */
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  appendNetworkEntry,
  appendSandboxEntry,
  deleteRunFiles,
  dockerKillCommands,
  isRecordAlive,
  listRunIds,
  parseLedgerEntry,
  parseRunRecord,
  readLedgerEntries,
  readRunRecordRaw,
  recordSandboxId,
  removeNetworkEntry,
  removeSandboxEntry,
  serializeLedgerEntry,
  sweepOnce,
  writeRunRecord,
} from '../hygiene/ledger.js'

const freshCache = (): Promise<string> => fsp.mkdtemp(path.join(os.tmpdir(), 'rightsize-ledger-kernel-'))
const runId = 'run-kernel-test'
const OLD_START = '2020-01-01T00:00:00.000Z'
const EPOCH = '1970-01-01T00:00:00.000Z'

const deadTimeSource = {
  isAlive: () => false,
  startedIso: () => Promise.resolve(OLD_START),
}

const aliveTimeSource = {
  isAlive: () => true,
  startedIso: () => Promise.resolve(EPOCH),
}

describe('hygiene ledger kernel', () => {
  it('Should_ReadBackAppendedEntriesInOrder_When_AppendedAsJsonLines', () =>
    freshCache().then((cache) =>
      appendSandboxEntry(cache, runId, { kind: 'sandbox', backend: 'msb', name: 'rz-run-1' })
        .then(() => appendNetworkEntry(cache, runId, 'net-abc'))
        .then(() => appendSandboxEntry(cache, runId, { kind: 'sandbox', backend: 'msb', name: 'rz-run-2' }))
        .then(() => readLedgerEntries(cache, runId))
        .then((entries) => {
          expect(entries).toEqual([
            { kind: 'sandbox', backend: 'msb', name: 'rz-run-1' },
            { kind: 'network', id: 'net-abc' },
            { kind: 'sandbox', backend: 'msb', name: 'rz-run-2' },
          ])
        })
    ))

  it('Should_RoundTripSingleEntries_When_Serialized', () => {
    const line = serializeLedgerEntry({ kind: 'sandbox', backend: 'docker', name: 'rz-x' })
    expect(parseLedgerEntry(line)).toEqual({ kind: 'sandbox', backend: 'docker', name: 'rz-x' })
    expect(parseLedgerEntry('garbage { not json')).toBeUndefined()
    expect(parseLedgerEntry('   ')).toBeUndefined()
    expect(parseLedgerEntry(JSON.stringify({ kind: 'sandbox', name: 'missing-backend' }))).toBeUndefined()
  })

  it('Should_RecordBackendIdOnTheSandboxLine_When_CreateSucceeded', () =>
    freshCache().then((cache) =>
      appendSandboxEntry(cache, runId, { kind: 'sandbox', backend: 'docker', name: 'rz-cid' })
        .then(() => recordSandboxId(cache, runId, 'rz-cid', 'cid-42'))
        .then(() => readLedgerEntries(cache, runId))
        .then((entries) => {
          expect(entries[0]).toEqual({ kind: 'sandbox', backend: 'docker', name: 'rz-cid', id: 'cid-42' })
        })
    ))

  it('Should_UntrackAndPruneRunFiles_When_EverythingIsRemoved', () =>
    freshCache().then((cache) =>
      appendSandboxEntry(cache, runId, { kind: 'sandbox', backend: 'docker', name: 'rz-only' })
        .then(() => appendNetworkEntry(cache, runId, 'net-only'))
        .then(() => removeSandboxEntry(cache, runId, 'rz-only'))
        .then(() => readLedgerEntries(cache, runId))
        .then((entries) => expect(entries).toEqual([{ kind: 'network', id: 'net-only' }]))
        .then(() => removeNetworkEntry(cache, runId, 'net-only'))
        .then(() => readLedgerEntries(cache, runId))
        .then((entries) => expect(entries).toEqual([]))
        .then(() => listRunIds(cache))
        .then((ids) => expect(ids).toEqual([]))
        .then(() => deleteRunFiles(cache, runId)) // already gone: must not throw
        .then(() => listRunIds(cache))
        .then((ids) => expect(ids).toEqual([]))
    ))

  it('Should_SerialiseEachConcurrentAppend_When_ManyRace', () =>
    freshCache().then((cache) => {
      const names = Array.from({ length: 20 }, (_, i) => `rz-race-${i}`)
      return Promise.all(
        names.map((name) => appendSandboxEntry(cache, runId, { kind: 'sandbox', backend: 'docker', name })),
      )
        .then(() => readLedgerEntries(cache, runId))
        .then((entries) => expect(entries).toHaveLength(20))
    }))

  it('Should_WriteAndReadRunRecord_When_Atomic', () =>
    freshCache().then((cache) =>
      writeRunRecord(cache, runId, { pid: 1234, startedIso: '2026-08-16T00:00:00.000Z', backend: 'msb' })
        .then(() => readRunRecordRaw(cache, runId))
        .then((raw) => {
          expect(raw).toBeDefined()
          expect(parseRunRecord(raw?.text ?? '')).toEqual({
            pid: 1234,
            startedIso: '2026-08-16T00:00:00.000Z',
            backend: 'msb',
          })
          expect(parseRunRecord('not json')).toBeUndefined()
        })
    ))

  it('Should_JudgeLiveness_When_ProcessStateIsFabricated', () =>
    isRecordAlive(deadTimeSource, 999, OLD_START).then((dead) => {
      expect(dead).toBe(false)
      return isRecordAlive(aliveTimeSource, 1, EPOCH).then((alive) => expect(alive).toBe(true))
    }))

  it('Should_ReapDeadRun_When_SweepingRecordsKillArgv', () =>
    freshCache().then((cache) => {
      const argv: ReadonlyArray<string>[] = []
      return writeRunRecord(cache, 'run:dead-1', { pid: 424242, startedIso: OLD_START, backend: 'docker' })
        .then(() => appendSandboxEntry(cache, 'run:dead-1', { kind: 'sandbox', backend: 'docker', name: 'rz-dead' }))
        .then(() =>
          sweepOnce({
            cacheDir: cache,
            thisRunId: runId,
            kill: dockerKillCommands(),
            runKill: (parts) => argv.push(parts),
            timeSource: deadTimeSource,
          })
        )
        .then(() => {
          expect(argv).toHaveLength(2) // docker: empty stop prefix + the rm -f remove prefix
          expect(argv[1]?.join(' ')).toContain('rm')
          return listRunIds(cache)
        })
        .then((ids) => expect(ids).toEqual([])) // the dead run's ledger files were pruned
    }))

  it('Should_LeaveOwnRunUntouched_When_ItsOwnRunIdIsSwept', () =>
    freshCache().then((cache) => {
      const argv: Array<ReadonlyArray<string>> = []
      return writeRunRecord(cache, 'run:alive-1', { pid: 1, startedIso: EPOCH, backend: 'docker' })
        .then(() => appendSandboxEntry(cache, 'run:alive-1', { kind: 'sandbox', backend: 'docker', name: 'rz-alive' }))
        .then(() =>
          sweepOnce({
            cacheDir: cache,
            thisRunId: 'run:alive-1',
            kill: msbKillCommands('/opt/msb'),
            runKill: (parts) => argv.push(parts),
            timeSource: deadTimeSource, // even judged dead, the own run is exempt
          })
        )
        .then(() => {
          expect(argv).toEqual([])
          return listRunIds(cache)
        })
        .then((ids) => expect(ids).toEqual(['run:alive-1']))
    }))
})

const msbKillCommands = (msbPath: string) => ({
  backend: 'msb' as const,
  stop: [msbPath, 'stop'],
  remove: [msbPath, 'rm'],
  removeNetwork: [msbPath, 'network', 'rm'],
})
