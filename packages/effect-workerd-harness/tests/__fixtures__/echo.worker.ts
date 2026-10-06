import { Effect } from 'effect'

export default {
  fetch: (request: Request): Promise<Response> =>
    Effect.runPromise(
      Effect.map(
        Effect.promise(() => request.text()),
        (body) => new Response(body, { headers: { 'content-type': 'text/plain' } }),
      ),
    ),
}
