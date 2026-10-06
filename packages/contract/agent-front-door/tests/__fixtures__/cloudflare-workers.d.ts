interface CloudflareWorkerEntrypointCtx<Props> {
  readonly props: Props
}

declare module 'cloudflare:workers' {
  export class WorkerEntrypoint<Env = Record<string, never>, Props = Record<string, never>> {
    constructor(ctx: CloudflareWorkerEntrypointCtx<Props>, env: Env)
    readonly ctx: CloudflareWorkerEntrypointCtx<Props>
    readonly env: Env
  }
}
