export const PROBE_REPLY = 'alchemy-stack-layer probe'

export default {
  fetch: (): Response => new Response(PROBE_REPLY),
}
