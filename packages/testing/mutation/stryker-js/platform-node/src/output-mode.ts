/**
 * Mode type vocabulary shared with the CLI package. Runtime resolution
 * (`resolveMode`) and gate functions (`isProgressEnabled`, `isColorEnabled`)
 * live in the CLI; the `ResolvedMode` fields (`mode`, `signal`,
 * `stdoutIsTTY`) ride along in `VerdictEnvelope` (`verdict-envelope.ts`),
 * so the types stay where the data does.
 */
/** @public */
export type OutputMode = 'human' | 'machine'

/** @public */
export type ModeSignal = 'flag' | 'env' | 'tty' | 'agent' | 'tool'

/** @public */
export interface ResolvedMode {
  readonly mode: OutputMode
  readonly signal: ModeSignal
  readonly stdoutIsTTY: boolean
}
