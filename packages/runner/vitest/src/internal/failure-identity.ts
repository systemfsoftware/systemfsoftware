/**
 * The identity one record names: the package, the test file and the scenario the rerun command writes (KTD1, R6).
 *
 * The task comes from Vitest, `TestRunner.getCurrentTest()`, which Vitest maintains for the test being run, so it
 * is readable wherever a failure is rendered — including from the promise a kernel run returns, where no Effect
 * service is in reach. The package name comes from the shared config's provided context, so it is this package's
 * real npm name and never a guess from a directory; a run that provided none renders a rerun line without a
 * `pnpm --filter` prefix.
 *
 * @since 4.0.0
 */
import { TestRunner } from 'vitest'
import type { TestIdentity } from './failure-record.js'
import { providedPackage } from './provided.js'

const LEVEL_SEPARATOR = ' > '
const EMPTY = ''

/** The fields this reads off a Vitest task: every one optional, so a partial context yields an incomplete identity. */
interface TaskLike {
  readonly name?: string | undefined
  readonly fullName?: string | undefined
  readonly fullTestName?: string | undefined
}

const isText = (value: string | undefined): value is string => typeof value === 'string' && value.length > 0

const textOrEmpty = (value: string | undefined): string => isText(value) ? value : EMPTY

const firstText = (values: ReadonlyArray<string | undefined>): string => textOrEmpty(values.find(isText))

const fileOf = (fullName: string | undefined): string => textOrEmpty(fullName).split(LEVEL_SEPARATOR).at(0) ?? EMPTY

const identityOf = (task: TaskLike): TestIdentity => ({
  package: providedPackage() ?? EMPTY,
  file: fileOf(task.fullName),
  name: firstText([task.fullTestName, task.name]),
})

const currentTask = (): TaskLike => TestRunner.getCurrentTest() ?? {}

/**
 * The identity of the test being run, or of the task handed in. A run outside a test, or one whose task carries
 * no file, yields an incomplete identity, which the renderer reports as the R6 breach it is.
 *
 * @internal
 */
export const testIdentityOf = (task?: TaskLike | null): TestIdentity => identityOf(task ?? currentTask())
