# @systemfsoftware/microvm-test-images

Private. The OCI image references that the repository's real-microVM checks boot: the `effect-microsandbox` smoke journeys (`examples/boot-alpine.ts`) and the `effect-daemon-microvm` integration suites. Each consumer imports the same file:

```ts
import images from '@systemfsoftware/microvm-test-images' with { type: 'json' }

MicroVM.job(images.alpine, ['pwd'])
```

## Why every reference names its registry host

microsandbox parses image strings with `oci_spec::distribution::Reference`, which reads a name without a dotted host, such as `alpine:3.20`, as `docker.io/library/alpine:3.20` and fetches it from `index.docker.io`. GitHub-hosted runners share egress IPs, so anonymous Docker Hub pulls in CI fail with "You have reached your unauthenticated pull rate limit". A fully qualified reference is the only way to choose the registry.

The references point at `mirror.gcr.io`, Google's anonymous read-through cache of Docker Hub images. It serves the same digests as Docker Hub and publishes no anonymous pull limit. `public.ecr.aws/docker/library` serves the same digests too, but allows one unauthenticated pull per second per IP.

## Provenance

| Key      | Reference                                                                                                   | Recorded   |
| -------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| `alpine` | `mirror.gcr.io/library/alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc` | 2026-10-09 |

The digest is the OCI image index (`application/vnd.oci.image.index.v1+json`) that Docker Hub reported for `alpine:3.20` on 2026-09-24. On 2026-10-09, `HEAD /v2/library/alpine/manifests/3.20` on `mirror.gcr.io` returned the same `docker-content-digest`, and the digest resolved on its own.

To move a pin, read the new digest with `HEAD https://mirror.gcr.io/v2/library/<name>/manifests/<tag>` and its `docker-content-digest` header, then edit `lib/images.json` and the table above.
