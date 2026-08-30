#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env

function sanitizeInstance(name: string): string {
  let s = name.replace(/[^A-Za-z0-9_.-]/g, '-').replace(/--/g, '-')
  s = s.replace(/^[-_.]+/, '').replace(/[-_.]+$/, '')
  return s || 'root'
}

async function commandExists(cmd: string): Promise<boolean> {
  const c = new Deno.Command('which', { args: [cmd], stdout: 'null', stderr: 'null' })
  const { code } = await c.output()
  return code === 0
}

async function provisionMcp(worktreePath: string): Promise<void> {
  try {
    await Deno.stat(worktreePath)
  } catch {
    console.error(`codegraph-worktree-mcp: no such dir: ${worktreePath}`)
    Deno.exit(1)
  }

  let cg = ''
  if (await commandExists('codegraph')) cg = 'codegraph'
  else if (Deno.env.get('HOME')) {
    const p = `${Deno.env.get('HOME')}/.local/bin/codegraph`
    try {
      await Deno.stat(p)
      cg = p
    } catch { /* not found */ }
  }
  if (!cg) {
    console.error(
      'codegraph-worktree-mcp: codegraph CLI not found on PATH or at $HOME/.local/bin/codegraph — install omp-infra-bootstrap first',
    )
    Deno.exit(1)
  }

  console.log(`codegraph-worktree-mcp: ensuring instance for ${worktreePath}`)
  {
    const cmd = new Deno.Command(cg, {
      args: [],
      cwd: worktreePath,
      stdout: 'null',
      stderr: 'null',
    })
    const { code } = await cmd.output()
    if (code !== 0) {
      console.error('codegraph-worktree-mcp: instance install failed')
      Deno.exit(1)
    }
  }

  const base = worktreePath.replace(/\/+$/, '').split('/').at(-1) ?? 'root'
  const instance = sanitizeInstance(base)
  const socket = `${
    Deno.env.get('HOME')
  }/.local/share/containers/storage/volumes/codegraph-${instance}-data/_data/codegraph.sock`
  const mcpFile = `${worktreePath}/.mcp.json`

  let cfg: Record<string, unknown> = {}
  try {
    const raw = await Deno.readTextFile(mcpFile)
    cfg = JSON.parse(raw)
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error(`codegraph-worktree-mcp: existing ${mcpFile} unreadable (${e}); overwriting`)
      cfg = {}
    } else if (!(e instanceof Deno.errors.NotFound)) {
      // other IO error, overwrite
      cfg = {}
    }
  }
  const servers = (cfg['mcpServers'] as Record<string, unknown> | undefined) ?? {}
  servers['codegraph'] = {
    type: 'stdio',
    command: 'socat',
    args: ['STDIO', `UNIX-CONNECT:${socket}`],
    enabled: true,
  }
  cfg['mcpServers'] = servers
  await Deno.writeTextFile(mcpFile, JSON.stringify(cfg, null, 2) + '\n')
  console.log(`codegraph-worktree-mcp: ${mcpFile} -> ${socket}`)
}

if (import.meta.main) {
  const wt = Deno.args[0] ?? Deno.cwd()
  await provisionMcp(wt)
}
