import treeKill from 'tree-kill'

export function kill(pid: number | undefined): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  if (pid === undefined) {
    // No child process to kill: `childProcess.pid` is undefined until the
    // process is actually spawned. Nothing to do.
    resolve()
    return promise
  }
  treeKill(pid, 'SIGKILL', (err?: Error & { code?: number }) => {
    if (err && !canIgnore(err.code)) {
      reject(err)
    } else {
      resolve()
    }
  })

  function canIgnore(code: number | undefined) {
    // https://docs.microsoft.com/en-us/windows/desktop/Debug/system-error-codes--0-499-
    // these error codes mean the program is _already_ closed.
    return code === 255 || code === 128
  }
  return promise
}
