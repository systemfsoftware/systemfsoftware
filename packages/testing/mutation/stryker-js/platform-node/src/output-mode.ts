/**
 * Mode type vocabulary shared with the CLI package. Runtime resolution
 * (`resolveMode`) and gate functions (`isProgressEnabled`, `isColorEnabled`)
 * live in the CLI; the `ResolvedMode` fields (`mode`, `signal`,
 * `stdoutIsTTY`) ride along in `VerdictEnvelope` (`verdict-envelope.ts`),
 * so the types stay where the data does.
 */
export type OutputMode = 'human' | 'machine'

export type ModeSignal = 'flag' | 'env' | 'tty' | 'agent' | 'tool'

export interface ResolvedMode {
  readonly mode: OutputMode
  readonly signal: ModeSignal
  readonly stdoutIsTTY: boolean
}
