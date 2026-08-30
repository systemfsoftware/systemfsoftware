import { ALLOWLISTED_ENV_VARS, type GuardFs, type ProcessResult, type Runner, SpawnFailure } from './facts.ts'

export const realFs: GuardFs = {
  exists: async (target) => {
    try {
      await Deno.stat(target)
      return true
    } catch {
      return false
    }
  },
  readFirstLine: async (target) => {
    try {
      const file = await Deno.open(target)
      try {
        const buffer = new Uint8Array(4096)
        const bytesRead = await file.read(buffer)
        const text = new TextDecoder().decode(buffer.subarray(0, bytesRead ?? 0))
        const firstLine = text.split('\n', 1)[0] ?? ''
        return firstLine === '' ? null : firstLine
      } finally {
        file.close()
      }
    } catch {
      return null
    }
  },
}

export const realSnapEnv = (envOverrides: Readonly<Record<string, string | undefined>>): Record<string, string> => {
  const snapshot: Record<string, string> = {}
  for (const key of ALLOWLISTED_ENV_VARS) {
    const value = key in envOverrides ? envOverrides[key] : Deno.env.get(key)
    if (value !== undefined) {
      snapshot[key] = value
    }
  }
  return snapshot
}

const reasonOf = (error: unknown): SpawnFailure['reason'] => {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return 'unknown'
  }
  const name = (error as { name: unknown }).name
  if (name === 'NotFound') {
    return 'not-found'
  }
  if (name === 'PermissionDenied' || name === 'NotCapable') {
    return 'not-executable'
  }
  return 'unknown'
}

export const realRunner: Runner = {
  async run(program, args, cwd, env, timeoutMs) {
    const signal = AbortSignal.timeout(timeoutMs)
    try {
      const command = new Deno.Command(program, {
        args,
        cwd,
        env,
        stdout: 'piped',
        stderr: 'piped',
        signal,
      })
      const process = command.spawn()
      const decode = async (stream: ReadableStream<Uint8Array>): Promise<string> => await new Response(stream).text()
      const drained = Promise.all([decode(process.stdout), decode(process.stderr)])
      const status = await process.status
      if (signal.aborted) {
        return { _tag: 'timeout' }
      }
      const [stdout, stderr] = await drained
      const result: ProcessResult = { exitCode: status.code, stdout, stderr }
      return { _tag: 'result', result }
    } catch (error) {
      return {
        _tag: 'spawn-failure',
        failure: new SpawnFailure({
          reason: reasonOf(error),
          message: error instanceof Error ? error.message : 'unknown error',
        }),
      }
    }
  },
}
