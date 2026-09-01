import { Schema as S } from 'effect'
import * as Rpc from 'effect/unstable/rpc/Rpc'
import * as RpcGroup from 'effect/unstable/rpc/RpcGroup'

import { CheckerFailed, CheckResultSchema } from '@systemfsoftware/stryker-js/Checker'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import {
  DryRunOptionsSchema,
  DryRunResultSchema,
  MutantRunOptionsSchema,
  MutantRunResultSchema,
  TestRunnerCapabilitiesSchema,
  TestRunnerFailed,
} from '@systemfsoftware/stryker-js/TestRunner'

export const CheckerRpcs = RpcGroup.make(
  Rpc.make('check', {
    payload: { checkerName: S.String, mutants: S.Array(Mutant) },
    success: S.Record(S.String, CheckResultSchema),
    error: CheckerFailed,
  }),
  Rpc.make('group', {
    payload: { checkerName: S.String, mutants: S.Array(Mutant) },
    success: S.Array(S.Array(S.String)),
    error: CheckerFailed,
  }),
)

export const TestRunnerRpcs = RpcGroup.make(
  Rpc.make('capabilities', {
    success: TestRunnerCapabilitiesSchema,
    error: TestRunnerFailed,
  }),
  Rpc.make('dryRun', {
    payload: { options: DryRunOptionsSchema },
    success: DryRunResultSchema,
    error: TestRunnerFailed,
  }),
  Rpc.make('mutantRun', {
    payload: { options: MutantRunOptionsSchema },
    success: MutantRunResultSchema,
    error: TestRunnerFailed,
  }),
)
