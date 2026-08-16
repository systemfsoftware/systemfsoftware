/**
 * The minio preset — upstream `src/modules/minio.ts` (`MinIOContainer`): an
 * S3-compatible object store. The image's default ENTRYPOINT does not serve,
 * so the command `server /data --console-address :9001` is declared.
 * `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` default to testuser/testpassword —
 * the image rejects a root password shorter than 8 characters.
 */
import type { ModulePreset } from '../preset.schema.js'

export const MinIOPreset: ModulePreset = {
  id: 'minio',
  description: 'A single-node MinIO S3-compatible object store; root credentials testuser/testpassword.',
  image: 'minio/minio:latest',
  expectedRepository: 'minio/minio',
  env: [
    ['MINIO_ROOT_USER', 'testuser'],
    ['MINIO_ROOT_PASSWORD', 'testpassword'],
  ],
  command: ['server', '/data', '--console-address', ':9001'],
  ports: [9000, 9001],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/minio/health/live', port: 9000 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    endpointUrl: { _tag: 'Url', scheme: 'http', guestPort: 9000 },
  },
}
