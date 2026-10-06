import { Match, Option, Schema } from 'effect'

export interface UndiciResponseBody {
  readonly json: () => Promise<Schema.Json>
}

export interface UndiciResponse {
  readonly statusCode: number
  readonly headers: Record<string, string | string[] | undefined>
  readonly body: UndiciResponseBody
}

export interface UndiciRequestInit {
  readonly method?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
}

type Dispatcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

let dispatcher: Dispatcher | undefined

export const setDispatcher = (next: Dispatcher | undefined): void => {
  dispatcher = next
}

const dispatch = (url: string, init?: UndiciRequestInit): Promise<UndiciResponse> => {
  if (dispatcher === undefined) {
    throw new Error('the conformance undici shim has no dispatcher bound')
  }
  return dispatcher(url, {
    method: init?.method ?? 'GET',
    ...(init?.headers === undefined ? {} : { headers: init.headers }),
    ...(init?.body === undefined ? {} : { body: init.body }),
  }).then((response) => ({
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: {
      json: () => response.json().then((value) => Option.getOrThrow(Schema.decodeUnknownOption(Schema.Json)(value))),
    },
  }))
}

export function request(url: string, init?: UndiciRequestInit): Promise<UndiciResponse>
export function request(init?: UndiciRequestInit): (url: string) => Promise<UndiciResponse>
export function request(
  urlOrInit: string | UndiciRequestInit = {},
  init?: UndiciRequestInit,
): Promise<UndiciResponse> | ((url: string) => Promise<UndiciResponse>) {
  return Match.value(urlOrInit).pipe(
    Match.when(Match.string, (url) => dispatch(url, init)),
    Match.orElse((value) => (url: string) => dispatch(url, value)),
  )
}
