/// <reference types="vitest/import-meta" />
import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { catalog } from '../laws.js'

class ParsePortCommand extends S.TaggedClass<ParsePortCommand>()('ParsePortCommand', {
  raw: S.String,
}) {}

class PortParsed extends S.TaggedClass<PortParsed>()('PortParsed', {
  value: S.Int,
}) {}

class PortRefused extends S.TaggedError<PortRefused>()('PortRefused', {
  why: S.String,
}) {}

interface PortSlot {
  readonly value: number
}

/** @internal */
export const parsePort = Workflow.make(
  ParsePortCommand,
  (command): Result.Result<PortSlot, PortRefused> =>
    Match.value(command).pipe(
      Match.when({ raw: (raw: string) => /^\d+$/.test(raw) }, ({ raw }) =>
        Result.succeed(PortParsed.make({ value: Number.parseInt(raw, 10) }))),
      Match.orElse(() =>
        Result.fail(PortRefused.make({ why: 'not a port' }))
      ),
    ),
)

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'parsePort',
    run: parsePort,
    reserved: catalog.refuseHomes.invalidSocketPath((socketPath: string) => ParsePortCommand.make({ raw: socketPath })),
    refused: Result.isFailure,
    published: catalog.contract([
      {
        label: 'plain',
        input: ParsePortCommand.make({ raw: '8080' }),
        project: (result: Result.Result<PortSlot, PortRefused>) =>
          Result.isSuccess(result) ? { value: result.success.value } : {},
        expect: { value: 8080 },
      },
    ]),
    inverse: (result: Result.Result<PortSlot, PortRefused>) =>
      ParsePortCommand.make({ raw: Result.isSuccess(result) ? String(result.success.value) : '' }),
  })
}
