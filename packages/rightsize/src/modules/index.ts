/**
 * The preset registry (R13) — the closed table of module presets plus the
 * accessors built over it. The registry is data: 23 upstream modules (floci
 * expanded into its three provider variants), in upstream order. The table
 * carries the contract — the catalog tests enumerate this exact list — and
 * the accessors are the only way code reaches into it.
 */
import { Option } from 'effect'
import type { ModulePreset } from './preset.schema.js'
import { ArangoPreset } from './presets/arango.js'
import { CassandraPreset } from './presets/cassandra.js'
import { ClickHousePreset } from './presets/clickhouse.js'
import { ElasticsearchPreset } from './presets/elasticsearch.js'
import { FlinkPreset } from './presets/flink.js'
import { FlociAwsPreset, FlociAzurePreset, FlociGcpPreset } from './presets/floci.js'
import { KafkaPreset } from './presets/kafka.js'
import { KeycloakPreset } from './presets/keycloak.js'
import { MariaDBPreset } from './presets/mariadb.js'
import { MemcachedPreset } from './presets/memcached.js'
import { MinIOPreset } from './presets/minio.js'
import { MongoDBPreset } from './presets/mongodb.js'
import { MySQLPreset } from './presets/mysql.js'
import { Neo4jPreset } from './presets/neo4j.js'
import { PinotPreset } from './presets/pinot.js'
import { PostgresPreset } from './presets/postgres.js'
import { QdrantPreset } from './presets/qdrant.js'
import { RabbitMQPreset } from './presets/rabbitmq.js'
import { RedisPreset } from './presets/redis.js'
import { RedpandaPreset } from './presets/redpanda.js'
import { SpringCloudConfigPreset } from './presets/spring-cloud-config.js'
import { ValkeyPreset } from './presets/valkey.js'
import { WireMockPreset } from './presets/wiremock.js'

export {
  ArangoPreset,
  CassandraPreset,
  ClickHousePreset,
  ElasticsearchPreset,
  FlinkPreset,
  FlociAwsPreset,
  FlociAzurePreset,
  FlociGcpPreset,
  KafkaPreset,
  KeycloakPreset,
  MariaDBPreset,
  MemcachedPreset,
  MinIOPreset,
  MongoDBPreset,
  MySQLPreset,
  Neo4jPreset,
  PinotPreset,
  PostgresPreset,
  QdrantPreset,
  RabbitMQPreset,
  RedisPreset,
  RedpandaPreset,
  SpringCloudConfigPreset,
  ValkeyPreset,
  WireMockPreset,
}

/**
 * The closed registry, in upstream-module order (upstream
 * `src/modules/index.ts` at the fork point), floci expanded in its slot.
 * Treat as immutable.
 */
export const presetRegistry: ReadonlyArray<ModulePreset> = [
  RedisPreset,
  ValkeyPreset,
  MemcachedPreset,
  ArangoPreset,
  MongoDBPreset,
  RedpandaPreset,
  KafkaPreset,
  SpringCloudConfigPreset,
  PostgresPreset,
  MySQLPreset,
  PinotPreset,
  RabbitMQPreset,
  MariaDBPreset,
  FlinkPreset,
  WireMockPreset,
  KeycloakPreset,
  ClickHousePreset,
  Neo4jPreset,
  FlociAwsPreset,
  FlociAzurePreset,
  FlociGcpPreset,
  MinIOPreset,
  CassandraPreset,
  ElasticsearchPreset,
  QdrantPreset,
]

/** Every preset row in the registry. */
export const allPresets = (): ReadonlyArray<ModulePreset> => presetRegistry

/** Looks a row up by its registry id; `none` when the id is not in the closed catalog. */
export const presetById = (id: string): Option.Option<ModulePreset> => {
  for (const preset of presetRegistry) {
    if (preset.id === id) return Option.some(preset)
  }
  return Option.none()
}
