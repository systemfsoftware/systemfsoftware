/**
 * The floci presets — upstream `src/modules/floci.ts` (`FlociContainer`):
 * one module type, three provider variants (aws / azure / gcp), each pinned
 * to its own native Quarkus image, guest port and expected repository. The
 * upstream class has no bare constructor — the factory choice is data here:
 * three rows in the registry, each with its own image-compat gate.
 */
import type { ModulePreset } from '../preset.schema.js'

const flociPreset = (
  id: string,
  description: string,
  image: string,
  expectedRepository: string,
  guestPort: number,
): ModulePreset => ({
  id,
  description,
  image,
  expectedRepository,
  env: [],
  ports: [guestPort],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/health', port: guestPort },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    endpointUrl: { _tag: 'Url', scheme: 'http', guestPort },
  },
})

/** The AWS cloud emulator (S3, DynamoDB, SQS, …) — `floci/floci:latest`. */
export const FlociAwsPreset: ModulePreset = flociPreset(
  'floci-aws',
  'The floci AWS cloud emulator (S3, DynamoDB, SQS, …), ready on GET /health.',
  'floci/floci:latest',
  'floci/floci',
  4566,
)

/** The Azure cloud emulator — `floci/floci-az:latest`. */
export const FlociAzurePreset: ModulePreset = flociPreset(
  'floci-azure',
  'The floci Azure cloud emulator, ready on GET /health.',
  'floci/floci-az:latest',
  'floci/floci-az',
  4577,
)

/** The GCP cloud emulator — `floci/floci-gcp:latest`. */
export const FlociGcpPreset: ModulePreset = flociPreset(
  'floci-gcp',
  'The floci GCP cloud emulator, ready on GET /health.',
  'floci/floci-gcp:latest',
  'floci/floci-gcp',
  4588,
)
