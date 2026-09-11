import { Schema as S } from 'effect'
import * as Rpc from 'effect/unstable/rpc/Rpc'
import * as RpcGroup from 'effect/unstable/rpc/RpcGroup'

import type { CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { TestRunnerFailed } from '@systemfsoftware/stryker-js/TestRunner'

import {
  CheckerFailedPayload,
  CheckResultPayload,
  DryRunOptionsPayload,
  DryRunResultPayload,
  MutantPayload,
  MutantRunOptionsPayload,
  MutantRunResultPayload,
  TestRunnerCapabilitiesPayload,
  TestRunnerFailedPayload,
} from './abi-payload.schema.js'

export type { CheckerFailed, Mutant, TestRunnerFailed }

export const CheckerRpcs = RpcGroup.make(
  Rpc.make('check', {
    payload: { checkerName: S.String, mutants: S.Array(MutantPayload) },
    success: S.Record(S.String, CheckResultPayload),
    error: CheckerFailedPayload,
  }),
  Rpc.make('group', {
    payload: { checkerName: S.String, mutants: S.Array(MutantPayload) },
    success: S.Array(S.Array(S.String)),
    error: CheckerFailedPayload,
  }),
)

export const TestRunnerRpcs = RpcGroup.make(
  Rpc.make('capabilities', {
    success: TestRunnerCapabilitiesPayload,
    error: TestRunnerFailedPayload,
  }),
  Rpc.make('dryRun', {
    payload: { options: DryRunOptionsPayload },
    success: DryRunResultPayload,
    error: TestRunnerFailedPayload,
  }),
  Rpc.make('mutantRun', {
    payload: { options: MutantRunOptionsPayload },
    success: MutantRunResultPayload,
    error: TestRunnerFailedPayload,
  }),
)
