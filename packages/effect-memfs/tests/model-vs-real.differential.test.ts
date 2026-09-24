import { Differential } from '@systemfsoftware/differential-spec'
import { Effect, Equal } from 'effect'
import { modelResponses, runnableCommands } from './__fixtures__/file-system.model.js'
import type { FileCommand, FileResponse } from './__fixtures__/file-system.model.js'
import { fileCommandLists, hostBypassesPermissions, realResponses } from './__fixtures__/real-store.js'

const permissionsBypassed = hostBypassesPermissions()

const runnable = (commands: ReadonlyArray<FileCommand>): ReadonlyArray<FileCommand> =>
  runnableCommands({ permissionsBypassed, commands })

const sameAnswers = (model: ReadonlyArray<FileResponse>, real: ReadonlyArray<FileResponse>): boolean =>
  Equal.equals(model, real)

Differential.compare({
  name: 'the filesystem model answers every command the way a real temporary directory does',
  reference: (commands: ReadonlyArray<FileCommand>) =>
    Effect.succeed(modelResponses({ permissionsBypassed, commands })),
  candidate: (commands: ReadonlyArray<FileCommand>) => realResponses(runnable(commands)),
})
  .on(fileCommandLists, {
    runBudget: 500,
    hostBound: {
      timeout: 30_000,
      reason: 'the real side runs every generated command against a temporary directory on the host filesystem',
    },
  })
  .assert(sameAnswers)
