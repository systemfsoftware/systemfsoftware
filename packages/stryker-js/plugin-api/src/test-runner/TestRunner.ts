import { DryRunResult } from './DryRunResult.js'
import { MutantRunResult } from './MutantRunResult.js'
import { DryRunOptions, MutantRunOptions } from './RunOptions.js'
import { TestRunnerCapabilities } from './TestRunnerCapabilities.js'

export interface TestRunner {
  capabilities(): Promise<TestRunnerCapabilities> | TestRunnerCapabilities
  init?(): Promise<void>
  dryRun(options: DryRunOptions): Promise<DryRunResult>
  mutantRun(options: MutantRunOptions): Promise<MutantRunResult>
  dispose?(): Promise<void>
}
