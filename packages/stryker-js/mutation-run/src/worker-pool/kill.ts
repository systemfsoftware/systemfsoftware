import treeKill from 'tree-kill'

export function kill(pid: number | undefined): Promise<void> {
  return new Promise((res, rej) => {
    treeKill(pid!, 'SIGKILL', (err?: Error & { code?: number }) => {
      if (err && !canIgnore(err.code)) {
        rej(err)
      } else {
        res()
      }
    })

    function canIgnore(code: number | undefined) {
      // https://docs.microsoft.com/en-us/windows/desktop/Debug/system-error-codes--0-499-
      // these error codes mean the program is _already_ closed.
      return code === 255 || code === 128
    }
  })
}
