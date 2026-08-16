/**
 * Image-reference parsing and compatibility — pure string decomposition
 * ported from upstream `docker-image-name.ts` at the fork point, rebuilt as
 * data with typed failures (KTD6): nothing here throws and nothing performs
 * I/O. `IncompatibleImageError` travels on the failure channel of
 * `requireCompatibleImage`, so the module gate (R13) can check a module's
 * declared image before any backend call without a synchronous raise.
 *
 * The failure channel is Effect v4 RC's `Result` (`Either`'s current name in
 * this workspace's catalog).
 *
 * Decomposition follows the Docker convention exactly as upstream pins it:
 * `[registry/]repository[:tag][@digest]` — the first path segment is a
 * registry only if it contains a `.` (a domain) or a `:` (an explicit port),
 * or is the literal `localhost`. This is why `quay.io/keycloak/keycloak`
 * strips to repository `keycloak/keycloak` while `floci/floci` stays whole.
 */
import { Result, Schema as S } from 'effect'
import { IncompatibleImageError } from './errors.js'

/**
 * A parsed `[registry/]repository[:tag][@digest]` image reference. An
 * explicitly supplied image is always used verbatim — compatibility only
 * ever *checks* it and returns it unchanged; it never rewrites a tag or
 * substitutes an image. `substituteRepository` is the override
 * `asCompatibleSubstituteFor` records: from then on the reference declares
 * that repository as its identity.
 */
export const ImageReference = S.Struct({
  /** The image reference exactly as given — what a module passes to the backend, unmodified. */
  raw: S.String,
  /** The registry host, if the first path segment looked like one (contains `.` or `:`, or is `localhost`). */
  registry: S.optionalKey(S.String),
  /** The repository component: registry, tag, and digest all stripped. */
  repository: S.String,
  /** The tag component, if the reference carried one. */
  tag: S.optionalKey(S.String),
  /** The digest component (everything after `@`), if the reference carried one. */
  digest: S.optionalKey(S.String),
  /** The repository this reference declares itself a compatible drop-in for, if `asCompatibleSubstituteFor` was called. */
  substituteRepository: S.optionalKey(S.String),
}).pipe(
  S.annotate({
    identifier: 'ImageReference',
    title: 'ImageReference',
    description: 'A parsed Docker image reference and its compatibility override.',
  }),
)

export type ImageReference = S.Schema.Type<typeof ImageReference>

/** The decomposable parts of a reference, all present as `string | undefined` regardless of optionality. */
interface ReferenceParts {
  readonly registry: string | undefined
  readonly repository: string
  readonly tag: string | undefined
  readonly digest: string | undefined
}

/** Splits off a trailing `@sha256:...` digest, if present — always the last `@` in the reference. */
const splitDigest = (ref: string): [rest: string, digest: string | undefined] => {
  const at = ref.lastIndexOf('@')
  if (at === -1) {
    return [ref, undefined]
  }
  return [ref.slice(0, at), ref.slice(at + 1)]
}

/** Splits a registry host off the front (see module doc for the convention). */
const splitRegistry = (ref: string): [registry: string | undefined, rest: string] => {
  const slash = ref.indexOf('/')
  if (slash === -1) {
    return [undefined, ref]
  }
  const first = ref.slice(0, slash)
  if (first.includes('.') || first.includes(':') || first === 'localhost') {
    return [first, ref.slice(slash + 1)]
  }
  return [undefined, ref]
}

/** Splits a trailing `:tag` off the repository — the last `:` counts only when it falls after the last `/`. */
const splitTag = (ref: string): [repository: string, tag: string | undefined] => {
  const lastSlash = ref.lastIndexOf('/')
  const lastColon = ref.lastIndexOf(':')
  if (lastColon > lastSlash) {
    return [ref.slice(0, lastColon), ref.slice(lastColon + 1)]
  }
  return [ref, undefined]
}

const parseParts = (image: string): ReferenceParts => {
  const [withoutDigest, digest] = splitDigest(image)
  const [registry, rest] = splitRegistry(withoutDigest)
  const [repository, tag] = splitTag(rest)
  return { registry, repository, tag, digest }
}

/** Assembles a reference, omitting every unset optional key (the codec's optionality is exact). */
const buildRef = (raw: string, parts: ReferenceParts, substituteRepository: string | undefined): ImageReference => ({
  raw,
  repository: parts.repository,
  ...(parts.registry === undefined ? {} : { registry: parts.registry }),
  ...(parts.tag === undefined ? {} : { tag: parts.tag }),
  ...(parts.digest === undefined ? {} : { digest: parts.digest }),
  ...(substituteRepository === undefined ? {} : { substituteRepository }),
})

/**
 * Parses a full image reference into its registry/repository/tag/digest
 * components. A pure string decomposition — never validates against a real
 * registry, never performs I/O (upstream semantics). The decomposition is
 * total: no input can fail it, so the failure channel is uninhabited and
 * exists only so parse composes with the typed-failure gate below.
 */
export const parseImageReference = (image: string): Result.Result<ImageReference, never> =>
  Result.succeed(buildRef(image, parseParts(image), undefined))

/**
 * Declares a parsed reference a compatible drop-in for `repository` — the
 * escape hatch for a fork, mirror, or hardened rebuild that doesn't share a
 * module's expected repository name. From here on, `requireCompatibleImage`
 * treats `repository` as this image's declared identity. Returns a new
 * reference; the original is left untouched.
 */
export const asCompatibleSubstituteFor = (ref: ImageReference, repository: string): ImageReference =>
  buildRef(ref.raw, partsOf(ref), repository)

const partsOf = (ref: ImageReference): ReferenceParts => ({
  registry: ref.registry,
  repository: ref.repository,
  tag: ref.tag,
  digest: ref.digest,
})

/**
 * The repository this reference declares — its own parsed `repository`
 * unless a prior `asCompatibleSubstituteFor` override superseded it.
 */
export const declaredRepository = (ref: ImageReference): string => ref.substituteRepository ?? ref.repository

/**
 * Resolves `image` (parsing it first if it's a plain string) and checks that
 * it names `expectedRepository` — either directly via its own parsed
 * `repository`, or via a prior `asCompatibleSubstituteFor(expectedRepository)`
 * override. Returns the exact image string to hand to a backend on success:
 * never rewritten, tag and all. Fails with `IncompatibleImageError` —
 * before any backend call — when neither matches; it never throws (KTD6).
 */
export const requireCompatibleImage = (
  image: string | ImageReference,
  expectedRepository: string,
): Result.Result<string, IncompatibleImageError> => {
  const ref = typeof image === 'string' ? buildRef(image, parseParts(image), undefined) : image
  if (declaredRepository(ref) !== expectedRepository) {
    return Result.fail(
      IncompatibleImageError.make({ suppliedRepository: ref.repository, expectedRepository }),
    )
  }
  return Result.succeed(ref.raw)
}
