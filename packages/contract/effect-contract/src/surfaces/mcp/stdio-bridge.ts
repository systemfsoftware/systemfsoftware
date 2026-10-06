import { Array as Arr, Effect } from 'effect'
import type { PlatformError } from 'effect'
import { dual } from 'effect/Function'

export interface StdioRelayResponse {
  readonly status: number
  readonly body: string
}

export interface StdioTransport {
  readonly post: (body: string) => Effect.Effect<StdioRelayResponse, PlatformError.PlatformError>
}

const isRequestLine = (line: string): boolean => line.trim().length > 0

export interface RelayLine {
  (line: string, transport: StdioTransport): Effect.Effect<string, PlatformError.PlatformError>
  (transport: StdioTransport): (line: string) => Effect.Effect<string, PlatformError.PlatformError>
}

export const relayLine: RelayLine = dual(2, (line: string, transport: StdioTransport) =>
  isRequestLine(line)
    ? Effect.map(transport.post(line), (response) => `${response.body}\n`)
    : Effect.succeed(''))

export interface Relay {
  (input: string, transport: StdioTransport): Effect.Effect<string, PlatformError.PlatformError>
  (transport: StdioTransport): (input: string) => Effect.Effect<string, PlatformError.PlatformError>
}

export const relay: Relay = dual(2, (input: string, transport: StdioTransport) =>
  Effect.map(
    Effect.forEach(Arr.filter(input.split('\n'), isRequestLine), (line) => relayLine(line, transport), {
      concurrency: 1,
    }),
    (responses) => responses.join(''),
  ))
