import { Contract } from '@systemfsoftware/effect-contract'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { AdmitHost, admitHost } from './admit-host.workflow.js'

export const EGRESS_DENIED_HEADER = 'x-sandbox-egress-denied'

export interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export interface EgressGatewayCtx {
  readonly props: { readonly allow: ReadonlyArray<Contract.Host> }
}

export interface EgressGatewayEnv {
  readonly UPSTREAM: Fetcher
}

export interface EgressGatewayRequest {
  readonly ctx: EgressGatewayCtx
  readonly env: EgressGatewayEnv
  readonly request: Request
}

const hostnameOf = (url: string): Option.Option<Contract.Host> =>
  URL.canParse(url) ? Schema.decodeOption(Contract.Host)(new URL(url).hostname) : Option.none()

const denied = (host: string): Response =>
  new Response('the program is not permitted to reach this host', {
    status: 403,
    headers: { [EGRESS_DENIED_HEADER]: host },
  })

export const egressGatewayFetch = ({ ctx, env, request }: EgressGatewayRequest): Promise<Response> =>
  Option.match(hostnameOf(request.url), {
    onNone: () => Promise.resolve(denied(request.url)),
    onSome: (host) =>
      Result.match(admitHost(new AdmitHost({ allow: ctx.props.allow, host })), {
        onFailure: () => Promise.resolve(denied(host)),
        onSuccess: (verdict) =>
          Match.value(verdict).pipe(
            Match.tag('Allow', () => env.UPSTREAM.fetch(request)),
            Match.tag('Deny', () => Promise.resolve(denied(host))),
            Match.exhaustive,
          ),
      }),
  })
