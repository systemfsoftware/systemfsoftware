import * as Context from 'effect/Context'
import * as Layer from 'effect/Layer'

export interface CloudflareDataPlaneShape {
  readonly k2Endpoint: (stream: string) => URL
  readonly basinSqlQueryUrl: (accountId: string, bucket: string) => URL
}

export class CloudflareDataPlane extends Context.Service<CloudflareDataPlane, CloudflareDataPlaneShape>()(
  '@systemfsoftware/alchemy-cloudflare/CloudflareDataPlane',
) {}

const K2_HOST = 'k2.cloudflarestorage.com'
const BASIN_SQL_HOST = 'api.sql.cloudflarestorage.com'

const basinSqlPath = (accountId: string, bucket: string): string =>
  `/api/v1/accounts/${accountId}/basin-sql/query/${bucket}`

export const live: Layer.Layer<CloudflareDataPlane> = Layer.succeed(CloudflareDataPlane, {
  k2Endpoint: (stream) => new URL(`https://${stream}.${K2_HOST}`),
  basinSqlQueryUrl: (accountId, bucket) => new URL(basinSqlPath(accountId, bucket), `https://${BASIN_SQL_HOST}`),
})

export const fromBaseUrl = (baseUrl: string | URL): Layer.Layer<CloudflareDataPlane> =>
  Layer.succeed(CloudflareDataPlane, {
    k2Endpoint: (stream) => new URL(`/${stream}`, baseUrl),
    basinSqlQueryUrl: (accountId, bucket) => new URL(basinSqlPath(accountId, bucket), baseUrl),
  })
