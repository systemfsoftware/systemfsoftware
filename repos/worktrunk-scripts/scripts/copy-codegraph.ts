#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
import { resolvePrimaryRepo } from './lib/git.ts'

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const c = new Deno.Command('which', { args: [cmd], stdout: 'null', stderr: 'null' })
    const { code } = await c.output()
    return code === 0
  } catch {
    return false
  }
}

async function runCodegraphMcp(worktreePath: string): Promise<void> {
  const script = new URL('./codegraph-worktree-mcp.ts', import.meta.url).pathname
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '--allow-read',
      '--allow-write',
      '--allow-run',
      '--allow-env',
      script,
      worktreePath,
    ],
    stdout: 'piped',
    stderr: 'piped',
  })
  const { code, stderr } = await cmd.output()
  if (code !== 0) {
    const msg = new TextDecoder().decode(stderr).trim()
    console.log(`copy-codegraph: codegraph MCP provisioning skipped (rc=${code}) ${msg}`)
  }
}

async function trySqliteBackup(src: string, dst: string): Promise<boolean> {
  if (!await commandExists('sqlite3')) return false
  const cmd = new Deno.Command('sqlite3', {
    args: [src, `.backup '${dst}'`],
    stdout: 'null',
    stderr: 'null',
  })
  const { code } = await cmd.output()
  if (code !== 0) return false
  try {
    const s = await Deno.stat(dst)
    return s.size > 0
  } catch {
    return false
  }
}

async function tryReflink(src: string, dst: string): Promise<boolean> {
  const cmd = new Deno.Command('cp', {
    args: ['--reflink=always', src, dst],
    stdout: 'null',
    stderr: 'null',
  })
  const { code } = await cmd.output()
  return code === 0
}

async function tryCopy(src: string, dst: string): Promise<boolean> {
  try {
    await Deno.copyFile(src, dst)
    return true
  } catch {
    return false
  }
}

async function isSqliteOk(path: string): Promise<boolean> {
  if (!await commandExists('sqlite3')) return true // daemon will rebuild if corrupt
  const cmd = new Deno.Command('sqlite3', {
    args: [path, 'PRAGMA quick_check;'],
    stdout: 'piped',
    stderr: 'null',
  })
  const { stdout } = await cmd.output()
  const out = new TextDecoder().decode(stdout)
  return out.includes('ok')
}

async function copyCodegraph(worktreePath: string, primaryPath: string | null): Promise<void> {
  await runCodegraphMcp(worktreePath)

  const srcDb = primaryPath ? `${primaryPath}/.codegraph/codegraph.db` : ''
  const dstDir = `${worktreePath}/.codegraph`
  const dstDb = `${dstDir}/codegraph.db`

  if (!primaryPath || primaryPath === worktreePath) {
    console.log(
      'copy-codegraph: no separate primary worktree, skipping warm copy (codegraph init will build fresh)',
    )
  } else {
    let srcExists = false
    try {
      const s = await Deno.stat(srcDb)
      srcExists = s.size > 0
    } catch {
      srcExists = false
    }
    if (!srcExists) {
      console.log(
        `copy-codegraph: no primary index at ${srcDb}, skipping warm copy (codegraph init will build fresh)`,
      )
    } else {
      let dstExists = false
      try {
        const s = await Deno.stat(dstDb)
        dstExists = s.size > 0
      } catch {
        dstExists = false
      }
      if (dstExists) {
        console.log('copy-codegraph: worktree already has an index, skipping warm copy')
      } else {
        await Deno.mkdir(dstDir, { recursive: true })
        // sweep partials
        for await (const e of Deno.readDir(dstDir)) {
          if (e.name.startsWith('codegraph.db.partial.')) {
            try {
              await Deno.remove(`${dstDir}/${e.name}`)
            } catch { /* ignore */ }
          }
        }
        const tmpDb = `${dstDb}.partial.${Deno.pid}`
        let mechanism = ''
        // try sqlite backup
        if (await trySqliteBackup(srcDb, tmpDb)) {
          mechanism = 'sqlite backup, consistent snapshot'
        } else {
          try {
            await Deno.remove(tmpDb)
          } catch { /* ignore */ }
          if (await tryReflink(srcDb, tmpDb)) {
            mechanism = 'reflink, no data moved'
            if (!await isSqliteOk(tmpDb)) {
              console.log(
                'copy-codegraph: integrity check failed on copied index, dropping it (codegraph init will rebuild fresh)',
              )
              try {
                await Deno.remove(tmpDb)
              } catch { /* ignore */ }
              mechanism = ''
            }
          } else {
            try {
              await Deno.remove(tmpDb)
            } catch { /* ignore */ }
            if (await tryCopy(srcDb, tmpDb)) {
              mechanism = 'full byte copy, no reflink on this filesystem'
              if (!await isSqliteOk(tmpDb)) {
                console.log(
                  'copy-codegraph: integrity check failed on copied index, dropping it (full init will rebuild)',
                )
                try {
                  await Deno.remove(tmpDb)
                } catch { /* ignore */ }
                mechanism = ''
              }
            } else {
              console.log(
                'copy-codegraph: every copy mechanism failed, skipping DB copy (codegraph init will build fresh)',
              )
            }
          }
        }
        if (mechanism) {
          try {
            const s = await Deno.stat(tmpDb)
            if (s.size > 0) {
              await Deno.rename(tmpDb, dstDb)
              console.log(`copy-codegraph: index warm-started (${mechanism})`)
            }
          } catch {
            if (mechanism) {
              console.log(
                'copy-codegraph: index copied but rename failed, dropping it (codegraph init will build fresh)',
              )
            }
            try {
              await Deno.remove(tmpDb)
            } catch { /* ignore */ }
          }
        }
      }
    }
  }

  // codegraph init
  let cgBin: string | null = null
  if (await commandExists('codegraph')) cgBin = 'codegraph'
  else {
    try {
      await Deno.stat(`${Deno.env.get('HOME') ?? ''}/.local/bin/codegraph`)
      cgBin = `${Deno.env.get('HOME')}/.local/bin/codegraph`
    } catch { /* not found */ }
  }
  if (cgBin) {
    const cmd = new Deno.Command(cgBin, {
      args: ['init'],
      cwd: worktreePath,
      stdout: 'null',
      stderr: 'null',
    })
    const { code } = await cmd.output()
    if (code !== 0) {
      console.log(`copy-codegraph: codegraph init failed (rc=${code}) — index left to the daemon`)
    }
  } else {
    console.log('copy-codegraph: codegraph CLI not found, skipping init (daemon will index fresh)')
  }
}

if (import.meta.main) {
  const worktreePath = Deno.args[0]
  if (!worktreePath) {
    console.error('worktree_path required')
    Deno.exit(1)
  }
  let primary: string | null = Deno.args[1] ?? null
  if (!primary) {
    try {
      primary = await resolvePrimaryRepo(worktreePath)
    } catch {
      primary = null
    }
  }
  await copyCodegraph(worktreePath, primary)
}
