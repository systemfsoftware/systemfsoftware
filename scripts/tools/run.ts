// run.ts — the one place this repo spawns a subprocess for the release tools.
//
// A module, never an entry point: it carries no shebang, so it runs under the
// permission grant of whichever script imports it. Every release tool needs the
// same three things from a child — its stdout, a loud failure, and the child's
// own diagnostics on our stderr — so the protocol lives here once.

const dec = new TextDecoder()
const enc = new TextEncoder()

/**
 * Run `cmd args`, returning stdout. A nonzero exit throws, and the child's
 * stdout is echoed to stderr first so a caller that discards the throw still
 * sees what the child printed before it failed.
 */
export const run = async (cmd: string, args: readonly string[]): Promise<string> => {
  const out = await new Deno.Command(cmd, { args: [...args], stdout: 'piped', stderr: 'inherit' }).output()
  const stdout = dec.decode(out.stdout)
  if (!out.success) {
    if (stdout.length > 0) {
      Deno.stderr.writeSync(enc.encode(stdout.endsWith('\n') ? stdout : `${stdout}\n`))
    }
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${out.code})\n${stdout}`)
  }
  return stdout
}
