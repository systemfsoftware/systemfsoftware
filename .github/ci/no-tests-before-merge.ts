const output = Deno.env.get('GITHUB_OUTPUT')
if (Deno.args[0] === 'plan' && output) await Deno.writeTextFile(output, 'jobs=[]\n', { append: true })
