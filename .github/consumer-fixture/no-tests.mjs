import { appendFile } from 'node:fs/promises'

if (process.argv[2] === 'plan') await appendFile(process.env.GITHUB_OUTPUT, 'jobs=[]\n')
